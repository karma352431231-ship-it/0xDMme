import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { deviceIdentity, fingerprint } from '../../shared/devices/index.ts';
import { checkIdentity, createIdentity } from '../device-keys/index.ts';
import type { LocalIdentity } from '../device-keys/index.ts';

interface Checkpoint {
  events: DirectoryEvent[];
  trustedRoot: string | null;
}
function transaction<T>(
  key: string,
  operation: (store: IDBObjectStore, value: unknown) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-device-authority', 1);
    let database: IDBDatabase | undefined;
    let active: IDBTransaction | undefined;
    let result: T;
    let settled = false;
    const timeout = setTimeout(fail, 5000);
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        active?.abort();
      } catch {
        /* A completed transaction cannot be aborted. */
      }
      database?.close();
      reject(
        new Error(
          'Armazenamento de dispositivos indisponível. Nenhuma autorização local foi confirmada.',
        ),
      );
    }
    opening.onerror = fail;
    opening.onblocked = fail;
    opening.onupgradeneeded = () => {
      if (settled) opening.transaction?.abort();
      else opening.result.createObjectStore('records');
    };
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) {
        database.close();
        return;
      }
      active = database.transaction('records', 'readwrite');
      const store = active.objectStore('records');
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          result = operation(store, read.result as unknown);
        } catch {
          fail();
        }
      };
      active.onerror = fail;
      active.onabort = fail;
      active.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        database?.close();
        resolve(result);
      };
    };
  });
}
export async function exclusive<T>(
  accountId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      'Este navegador não oferece a exclusão entre abas necessária. Use um navegador atualizado.',
    );
  return navigator.locks.request(
    `0xdmme-device-authority:${accountId}`,
    { mode: 'exclusive', signal: AbortSignal.timeout(8000) },
    operation,
  );
}
export async function localIdentity(
  accountId: string,
  deviceId: string,
  name: string,
): Promise<LocalIdentity> {
  const key = `identity:${accountId}:${deviceId}`;
  const stored = await transaction(
    key,
    (_store, value) => value as LocalIdentity | undefined,
  );
  if (stored) {
    await checkIdentity(stored);
    return stored;
  }
  const identity = await createIdentity(deviceId, name);
  return transaction(key, (store, existing) => {
    if (existing) throw new Error('Identidade criada em outra aba.');
    store.add(identity, key);
    return identity;
  });
}
export async function storedIdentity(
  accountId: string,
  deviceId: string,
): Promise<LocalIdentity> {
  const identity = await transaction(
    `identity:${accountId}:${deviceId}`,
    (_store, value) => value as LocalIdentity | undefined,
  );
  if (!identity)
    throw new Error(
      'Sem chave local deste aparelho. Faça login e recupere com autorização.',
    );
  await checkIdentity(identity);
  return identity;
}
export function nameIdentity(
  accountId: string,
  identity: LocalIdentity,
  name: string,
): Promise<LocalIdentity> {
  const next = {
    ...identity,
    public: deviceIdentity({ ...identity.public, name }),
  };
  return transaction(
    `identity:${accountId}:${identity.public.id}`,
    (store, existing) => {
      const current = existing as LocalIdentity | undefined;
      if (
        current?.public.signing !== identity.public.signing ||
        current.public.wrapping !== identity.public.wrapping
      )
        throw new Error('Identidade local alterada.');
      store.put(next, `identity:${accountId}:${identity.public.id}`);
      return next;
    },
  );
}
export function readCheckpoint(accountId: string): Promise<Checkpoint> {
  return transaction(`checkpoint:${accountId}`, (_store, value) => {
    if (value === undefined) return { events: [], trustedRoot: null };
    if (
      typeof value !== 'object' ||
      value === null ||
      !('events' in value) ||
      !Array.isArray(value.events) ||
      value.events.length > 128 ||
      !('trustedRoot' in value)
    )
      throw new Error('Checkpoint local inválido.');
    const checkpoint = value as Checkpoint;
    if (checkpoint.trustedRoot !== null) fingerprint(checkpoint.trustedRoot);
    return checkpoint;
  });
}
export function saveCheckpoint(
  accountId: string,
  checkpoint: Checkpoint,
): Promise<void> {
  return transaction(`checkpoint:${accountId}`, (store, value) => {
    const existing = value as Checkpoint | undefined;
    if ((existing?.events.length ?? 0) > checkpoint.events.length)
      throw new Error('Checkpoint antigo.');
    if (
      existing?.trustedRoot &&
      existing.trustedRoot !== checkpoint.trustedRoot
    )
      throw new Error('Raiz local alterada.');
    store.put(checkpoint, `checkpoint:${accountId}`);
  });
}
