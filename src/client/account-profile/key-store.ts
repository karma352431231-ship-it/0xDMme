function validKey(value: unknown): value is CryptoKey {
  return (
    value instanceof CryptoKey &&
    !value.extractable &&
    value.algorithm.name === 'AES-GCM' &&
    value.usages.includes('encrypt') &&
    value.usages.includes('decrypt')
  );
}

function keyTransaction(
  database: IDBDatabase,
  accountId: string,
  candidate: CryptoKey | null,
  complete: (key: CryptoKey | null) => void,
): IDBTransaction {
  const transaction = database.transaction(
    'keys',
    candidate ? 'readwrite' : 'readonly',
  );
  let result: CryptoKey | null = null;
  const store = transaction.objectStore('keys');
  const reading = store.get(accountId);
  reading.onsuccess = () => {
    const stored: unknown = reading.result;
    if (validKey(stored)) result = stored;
    else if (stored !== undefined) {
      transaction.abort();
      return;
    } else if (candidate) {
      result = candidate;
      store.add(candidate, accountId);
    }
  };
  transaction.oncomplete = () => complete(result);
  return transaction;
}

/** Independent non-exportable profile key; never derived from a wallet signature.
 * Not an E2EE device grant. Wrapping/sync belongs to blocks 04/05.
 */
export async function profileKey(
  accountId: string,
  create: boolean,
): Promise<CryptoKey | null> {
  const candidate = create
    ? await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ])
    : null;
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('hash-talk-private-profile', 1);
    let database: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        transaction?.abort();
      } catch (error: unknown) {
        if (!(
          error instanceof DOMException && error.name === 'InvalidStateError'
        )) {
          database?.close();
          reject(
            new Error('Falha ao encerrar transação local.', { cause: error }),
          );
          return;
        }
        // A completed/aborted transaction cannot be aborted again.
      }
      database?.close();
      reject(new Error('Armazenamento local indisponível.'));
    };
    const timer = window.setTimeout(fail, 5000);
    const complete = (key: CryptoKey | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      database?.close();
      resolve(key);
    };
    opening.onblocked = fail;
    opening.onerror = fail;
    opening.onupgradeneeded = () => {
      if (settled) opening.transaction?.abort();
      else opening.result.createObjectStore('keys');
    };
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) {
        database.close();
        return;
      }
      try {
        transaction = keyTransaction(database, accountId, candidate, complete);
        transaction.onabort = fail;
        transaction.onerror = fail;
      } catch {
        fail();
      }
    };
  });
}
