const databaseName = '0xdmme-mobile-feasibility';
const recordKey = 'synthetic-fixture';

/** One synthetic record in its own database; no product history or device keys. */
export class FeasibilityStore {
  read(signal: AbortSignal): Promise<unknown> {
    return transaction({
      signal,
      mode: 'readonly',
      request: (store) => store.get(recordKey) as IDBRequest<unknown>,
    });
  }
  async write(value: unknown, signal: AbortSignal): Promise<void> {
    await transaction({
      signal,
      mode: 'readwrite',
      request: (store) => store.put(value, recordKey),
    });
  }
  async clear(signal: AbortSignal): Promise<void> {
    await transaction({
      signal,
      mode: 'readwrite',
      request: (store) => store.delete(recordKey) as IDBRequest<unknown>,
    });
  }
}

function transaction<T>(input: {
  signal: AbortSignal;
  mode: IDBTransactionMode;
  request: (store: IDBObjectStore) => IDBRequest<T>;
}): Promise<T> {
  input.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(databaseName, 1);
    let database: IDBDatabase | undefined;
    let active: IDBTransaction | undefined;
    let request: IDBRequest<T> | undefined;
    let settled = false;
    const timer = setTimeout(fail, 5000);
    function cleanup(): void {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', fail);
      database?.close();
    }
    function fail(): void {
      if (settled) return;
      settled = true;
      try {
        active?.abort();
      } catch {
        // A completed transaction cannot be aborted.
      }
      cleanup();
      reject(new Error('Local feasibility storage did not complete.'));
    }
    input.signal.addEventListener('abort', fail, { once: true });
    opening.onerror = fail;
    opening.onblocked = fail;
    opening.onupgradeneeded = () => {
      if (settled) opening.transaction?.abort();
      else opening.result.createObjectStore('records');
    };
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) return database.close();
      database.onversionchange = fail;
      try {
        active = database.transaction('records', input.mode);
        active.onerror = fail;
        active.onabort = fail;
        active.oncomplete = () => {
          if (settled || !request) return;
          settled = true;
          cleanup();
          resolve(request.result);
        };
        request = input.request(active.objectStore('records'));
        request.onerror = fail;
      } catch {
        fail();
      }
    };
  });
}
