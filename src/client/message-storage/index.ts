import { base64, encode } from '../../shared/account/index.ts';
import { bytesHash, vaultQuota } from '../../shared/vault/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { openBlock, sealBlock } from '../vault-crypto/index.ts';
export interface LocalCipher {
  id: string;
  epoch: number;
  block: { hash: string; bytes: number };
  bytes: Uint8Array<ArrayBuffer>;
}
interface RecordRow {
  scope: string;
  name: string;
  value: unknown;
  size: number;
}
/** Strict durable transactions; only ciphertext/public protocol data enters this database. */
function transaction<T>(
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
      reject(new Error('Gravação de mensagens não confirmada no aparelho.'));
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
export async function localGet<T>(
  scope: string,
  name: string,
): Promise<T | null> {
  return transaction(scope, (store, done) => {
    const get = store.get([scope, name]);
    get.onsuccess = () =>
      done(((get.result as RecordRow | undefined)?.value as T) ?? null);
  });
}
export async function localPut(
  scope: string,
  name: string,
  value: unknown,
  size: number,
): Promise<void> {
  return transaction(scope, (store, done) => {
    const old = store.get([scope, name]),
      usage = store.get([scope, 'usage']);
    let previous: RecordRow | undefined,
      used = 0,
      reads = 0;
    const update = () => {
      if (++reads !== 2) return;
      const next = used - (previous?.size ?? 0) + size;
      if (next > vaultQuota) {
        old.transaction?.abort();
        return;
      }
      store.put({ scope, name, value, size });
      store.put({ scope, name: 'usage', value: next, size: 0 });
      done(undefined);
    };
    old.onsuccess = () => {
      previous = old.result as RecordRow | undefined;
      update();
    };
    usage.onsuccess = () => {
      used = ((usage.result as RecordRow | undefined)?.value as number) ?? 0;
      update();
    };
  });
}
export function localDelete(scope: string, name: string): Promise<void> {
  return transaction(scope, (store, done) => {
    const old = store.get([scope, name]);
    old.onsuccess = () => {
      const row = old.result as RecordRow | undefined,
        usage = store.get([scope, 'usage']);
      usage.onsuccess = () => {
        const used =
          ((usage.result as RecordRow | undefined)?.value as number) ?? 0;
        store.delete([scope, name]);
        store.put({
          scope,
          name: 'usage',
          value: Math.max(0, used - (row?.size ?? 0)),
          size: 0,
        });
        done(undefined);
      };
    };
  });
}
export function localPage<T>(
  scope: string,
  prefix: string,
  after: string | null,
): Promise<{ items: { name: string; value: T }[]; next: string | null }> {
  return transaction(scope, (store, done) => {
    const range = IDBKeyRange.bound(
      [scope, after ?? prefix],
      [scope, prefix + '\uffff'],
      after !== null,
    );
    const read = store.getAll(range, 17);
    read.onsuccess = () => {
      const rows = read.result as RecordRow[],
        items = rows
          .slice(0, 16)
          .map((r) => ({ name: r.name, value: r.value as T }));
      done({
        items,
        next: rows.length > 16 ? (items.at(-1)?.name ?? null) : null,
      });
    };
  });
}
export async function sealLocal(
  authority: VaultAuthority,
  id: string,
  value: string,
): Promise<LocalCipher> {
  const bytes = await sealBlock(
    await authority.key(authority.epoch),
    { accountId: authority.session.accountId, id, epoch: authority.epoch },
    value,
  );
  return {
    id,
    epoch: authority.epoch,
    block: { hash: await bytesHash(bytes), bytes: bytes.length },
    bytes,
  };
}
export function openLocal(
  authority: VaultAuthority,
  row: LocalCipher,
): Promise<string> {
  return authority
    .key(row.epoch)
    .then((key) =>
      openBlock(
        key,
        { accountId: authority.session.accountId, ...row },
        row.bytes,
      ),
    );
}
export async function localStoreKey(
  authority: VaultAuthority,
): Promise<Uint8Array<ArrayBuffer>> {
  const scope = `${authority.session.accountId}:${authority.session.deviceId}`,
    name = 'olm-store-key';
  let row = await localGet<LocalCipher>(scope, name);
  if (!row) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    try {
      row = await sealLocal(authority, crypto.randomUUID(), encode(bytes));
      await localPut(scope, name, row, row.bytes.length + 512);
    } finally {
      bytes.fill(0);
    }
  }
  const value = base64(await openLocal(authority, row), 32);
  if (value.length !== 32) throw new Error('Chave de armazenamento inválida.');
  return Uint8Array.from(value);
}
