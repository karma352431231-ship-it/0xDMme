import type { Page } from '@playwright/test';

/** Fixture-only white-box observation of committed ciphertext record keys.
 * Never reads values, exports identifiers, decrypts, writes or upgrades storage.
 * This adapter must be reviewed if the message-storage schema changes. */
export async function outboxCounts(page: Page) {
  return page.evaluate(async () => {
    const existing = await indexedDB.databases();
    if (!existing.some((database) => database.name === '0xdmme-messages'))
      throw new Error('Synthetic message storage has not initialized.');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('0xdmme-messages');
      let expired = false;
      const fail = () => {
        expired = true;
        clearTimeout(timer);
        reject(new Error('Synthetic storage inspection could not open.'));
      };
      const timer = setTimeout(fail, 5000);
      opening.onerror = fail;
      opening.onblocked = fail;
      opening.onupgradeneeded = () => {
        opening.transaction?.abort();
        fail();
      };
      opening.onsuccess = () => {
        clearTimeout(timer);
        if (expired) opening.result.close();
        else resolve(opening.result);
      };
    });
    try {
      return await new Promise<{ direct: number; group: number }>(
        (resolve, reject) => {
          const transaction = database.transaction('records', 'readonly');
          const timer = setTimeout(() => transaction.abort(), 5000);
          const request = transaction
            .objectStore('records')
            .getAllKeys(undefined, 10_001);
          const counts = { direct: 0, group: 0 };
          transaction.onabort = () => {
            clearTimeout(timer);
            reject(new Error('Synthetic outbox inspection did not complete.'));
          };
          transaction.oncomplete = () => {
            clearTimeout(timer);
            resolve(counts);
          };
          request.onsuccess = () => {
            const keys = request.result;
            if (keys.length > 10_000) return transaction.abort();
            for (const key of keys) {
              if (!Array.isArray(key)) continue;
              const [scope, name] = key as unknown[];
              if (typeof scope !== 'string' || typeof name !== 'string')
                continue;
              if (!name.startsWith('outbox:')) continue;
              counts[scope.includes(':group:') ? 'group' : 'direct']++;
            }
          };
        },
      );
    } finally {
      database.close();
    }
  });
}
