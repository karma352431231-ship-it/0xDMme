import {
  privateSendPoint,
  privateSendSpan,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
export interface RecordRow {
  scope: string;
  name: string;
  value: unknown;
  size: number;
}
export class MessageStorageError extends Error {}
/** Strict durable transactions; only ciphertext/public protocol data enters this database. */
export function transaction<T>(
  scope: string,
  work: (store: IDBObjectStore, done: (result: T) => void) => void,
  diagnostic?: {
    context: PrivateSendContext | undefined;
    current: () => boolean;
  },
): Promise<T> {
  const openDone = privateSendSpan(diagnostic?.context, 'local-storage-open');
  let transactionDone: ((ok?: boolean) => void) | undefined;
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-messages', 1);
    let db: IDBDatabase | undefined,
      tx: IDBTransaction | undefined,
      result: T,
      finished = false;
    const timer = setTimeout(fail, 8000);
    function fail() {
      if (finished) return;
      finished = true;
      openDone?.(false);
      transactionDone?.(false);
      clearTimeout(timer);
      try {
        tx?.abort();
      } catch {
        /* Already completed. */
      }
      db?.close();
      reject(
        new MessageStorageError(
          'Message storage on the device was not confirmed.',
        ),
      );
    }
    opening.onerror = fail;
    opening.onblocked = fail;
    opening.onupgradeneeded = () => {
      if (finished) {
        opening.transaction?.abort();
        return;
      }
      const store = opening.result.createObjectStore('records', {
        keyPath: ['scope', 'name'],
      });
      store.createIndex('scope', 'scope');
    };
    opening.onsuccess = () => {
      db = opening.result;
      if (finished) {
        db.close();
        return;
      }
      openDone?.();
      tx = db.transaction('records', 'readwrite', { durability: 'strict' });
      transactionDone = privateSendSpan(
        diagnostic?.context,
        'outbox-transaction',
      );
      tx.onerror = fail;
      tx.onabort = fail;
      tx.oncomplete = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        db?.close();
        const current = diagnostic ? diagnostic.current() : true;
        transactionDone?.(current);
        if (current) privateSendPoint(diagnostic?.context, 'outbox-commit');
        else
          privateSendPoint(diagnostic?.context, 'send-cancelled', {
            sendOutcome: 'cancelled',
          });
        resolve(result);
      };
      try {
        work(tx.objectStore('records'), (value) => {
          result = value;
          privateSendPoint(diagnostic?.context, 'outbox-write-ready');
        });
      } catch {
        fail();
      }
    };
    void scope;
  });
}
