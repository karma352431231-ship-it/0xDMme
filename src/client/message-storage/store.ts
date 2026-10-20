export interface RecordRow {
  scope: string;
  name: string;
  value: unknown;
  size: number;
}
/** Strict durable transactions; only ciphertext/public protocol data enters this database. */
export function transaction<T>(
  scope: string,
  work: (store: IDBObjectStore, done: (result: T) => void) => void,
): Promise<T> {
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
      clearTimeout(timer);
      try {
        tx?.abort();
      } catch {
        /* Already completed. */
      }
      db?.close();
      reject(new Error('Message storage on the device was not confirmed.'));
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
      tx = db.transaction('records', 'readwrite', { durability: 'strict' });
      tx.onerror = fail;
      tx.onabort = fail;
      tx.oncomplete = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        db?.close();
        resolve(result);
      };
      try {
        work(tx.objectStore('records'), (value) => {
          result = value;
        });
      } catch {
        fail();
      }
    };
    void scope;
  });
}
