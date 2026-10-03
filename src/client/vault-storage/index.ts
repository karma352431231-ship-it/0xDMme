import type { VaultCommit } from '../../shared/vault/index.ts';
import {
  integer,
  vaultQuota,
  vaultCommit,
  blockLimit,
} from '../../shared/vault/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import type { VaultLocator } from '../vault-authority/index.ts';
import { keys, object, uuid } from '../../shared/account/index.ts';
export interface VaultCheckpoint {
  sequence: number;
  head: string | null;
  used: number;
}
export interface VaultDraft {
  commit: VaultCommit;
  bytes: Uint8Array;
}
const empty: VaultCheckpoint = { sequence: 0, head: null, used: 0 };
function readCheckpoint(value: unknown): VaultCheckpoint {
  if (value === undefined) return empty;
  const data = object(value);
  keys(data, ['sequence', 'head', 'used']);
  const sequence = integer(data['sequence']);
  const head = data['head'] === null ? null : fingerprint(data['head']);
  if ((sequence === 0) !== (head === null))
    throw new Error('Checkpoint inválido.');
  return { sequence, head, used: integer(data['used'], vaultQuota) };
}
export function rememberLocator(value: VaultLocator | null): Promise<void> {
  return transaction((s, done) => {
    if (value) s.meta.put(value, 'last-account');
    else s.meta.delete('last-account');
    done(undefined);
  });
}
export function localLocator(): Promise<VaultLocator | null> {
  return transaction((s, done) => {
    const read = s.meta.get('last-account');
    read.onsuccess = () => {
      if (read.result === undefined) {
        done(null);
        return;
      }
      try {
        const data = object(read.result as unknown);
        keys(data, ['accountId', 'deviceId']);
        done({
          accountId: uuid(data['accountId']),
          deviceId: uuid(data['deviceId']),
        });
      } catch {
        read.transaction?.abort();
      }
    };
  });
}
function transaction<T>(
  work: (
    stores: Record<'meta' | 'commits' | 'blocks', IDBObjectStore>,
    done: (value: T) => void,
  ) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-vault', 1);
    let database: IDBDatabase | undefined;
    let active: IDBTransaction | undefined;
    let result: T;
    let settled = false;
    const timer = setTimeout(fail, 5000);
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        active?.abort();
      } catch {
        /* Completed transactions cannot abort. */
      }
      database?.close();
      reject(
        new Error(
          'Cópia local não confirmada. Verifique espaço e armazenamento do navegador.',
        ),
      );
    }
    opening.onerror = fail;
    opening.onblocked = fail;
    opening.onupgradeneeded = () => {
      if (settled) opening.transaction?.abort();
      else
        for (const name of ['meta', 'commits', 'blocks'])
          opening.result.createObjectStore(name);
    };
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) {
        database.close();
        return;
      }
      active = database.transaction(
        ['meta', 'commits', 'blocks'],
        'readwrite',
        { durability: 'strict' },
      );
      active.onerror = fail;
      active.onabort = fail;
      active.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        database?.close();
        resolve(result);
      };
      try {
        work(
          {
            meta: active.objectStore('meta'),
            commits: active.objectStore('commits'),
            blocks: active.objectStore('blocks'),
          },
          (value) => {
            result = value;
          },
        );
      } catch {
        fail();
      }
    };
  });
}
export function checkpoint(accountId: string): Promise<VaultCheckpoint> {
  return transaction((s, done) => {
    const request = s.meta.get(`checkpoint:${accountId}`);
    request.onsuccess = () => {
      try {
        done(readCheckpoint(request.result as unknown));
      } catch {
        request.transaction?.abort();
      }
    };
  });
}
export function draft(accountId: string): Promise<VaultDraft | null> {
  return transaction((s, done) => {
    const request = s.meta.get(`draft:${accountId}`);
    request.onsuccess = () => {
      if (request.result === undefined) {
        done(null);
        return;
      }
      try {
        const data = object(request.result as unknown);
        keys(data, ['commit', 'bytes']);
        const commit = vaultCommit(data['commit']);
        const bytes = data['bytes'];
        if (
          !(bytes instanceof Uint8Array) ||
          bytes.length !== commit.block.bytes ||
          bytes.length > blockLimit
        )
          throw new Error('Rascunho inválido.');
        done({ commit, bytes });
      } catch {
        request.transaction?.abort();
      }
    };
  });
}
export function saveDraft(
  accountId: string,
  value: VaultDraft | null,
): Promise<void> {
  return transaction((s, done) => {
    if (value) s.meta.put(value, `draft:${accountId}`);
    else s.meta.delete(`draft:${accountId}`);
    done(undefined);
  });
}
export function commitPage(
  accountId: string,
  expected: VaultCheckpoint,
  next: VaultCheckpoint,
  commits: VaultCommit[],
): Promise<void> {
  return transaction((s, done) => {
    const read = s.meta.get(`checkpoint:${accountId}`);
    read.onsuccess = () => {
      const current = (read.result as VaultCheckpoint | undefined) ?? empty;
      if (
        current.sequence !== expected.sequence ||
        current.head !== expected.head ||
        next.sequence < current.sequence
      ) {
        read.transaction?.abort();
        return;
      }
      for (const commit of commits)
        s.commits.add(
          commit,
          `${accountId}:${commit.sequence.toString().padStart(6, '0')}`,
        );
      s.meta.put(next, `checkpoint:${accountId}`);
      done(undefined);
    };
  });
}
export function cachedPage(
  accountId: string,
  after: number,
): Promise<VaultCommit[]> {
  return transaction((s, done) => {
    const lower = `${accountId}:${(after + 1).toString().padStart(6, '0')}`;
    const upper = `${accountId}:999999`;
    const read = s.commits.getAll(IDBKeyRange.bound(lower, upper), 16);
    read.onsuccess = () => done(read.result as VaultCommit[]);
  });
}
export function cachedBlock(
  accountId: string,
  id: string,
): Promise<Uint8Array | null> {
  return transaction((s, done) => {
    const read = s.blocks.get(`${accountId}:${id}`);
    read.onsuccess = () =>
      done((read.result as Uint8Array | undefined) ?? null);
  });
}
/** At most 16 ciphertext blocks, evict only confirmed cache copies. Checkpoint/drafts survive. */
export function cacheBlock(
  accountId: string,
  id: string,
  bytes: Uint8Array,
): Promise<void> {
  return transaction((s, done) => {
    const read = s.meta.get(`blocks:${accountId}`);
    read.onsuccess = () => {
      const ids = (read.result as string[] | undefined) ?? [];
      if (!ids.includes(id)) ids.push(id);
      if (ids.length > 16) {
        const old = ids.shift();
        if (old) s.blocks.delete(`${accountId}:${old}`);
      }
      s.blocks.put(bytes, `${accountId}:${id}`);
      s.meta.put(ids, `blocks:${accountId}`);
      done(undefined);
    };
  });
}
export async function storageEstimate(): Promise<{
  usage: number | null;
  quota: number | null;
  persistent: boolean;
}> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
    persistent: await navigator.storage.persisted(),
  };
}

export function forgetCachedBlock(
  accountId: string,
  id: string,
): Promise<void> {
  return transaction((s, done) => {
    s.blocks.delete(`${accountId}:${id}`);
    done(undefined);
  });
}
