import { setTimeout as delay } from 'node:timers/promises';
import type pg from 'pg';

/** pg-pool can resolve end() before its clients finish closing their sockets. */
export function closeDisposablePool(pool: pg.Pool): () => Promise<void> {
  const disconnected: Promise<void>[] = [];
  pool.on('connect', (client: pg.PoolClient) => {
    disconnected.push(
      new Promise<void>((resolve) => client.once('end', resolve)),
    );
  });
  return async () => {
    const deadline = new AbortController();
    try {
      await Promise.race([
        pool.end().then(() => Promise.all(disconnected)),
        delay(5000, undefined, { signal: deadline.signal }).then(() => {
          throw new Error('Disposable metric pool connections did not close.');
        }),
      ]);
    } finally {
      deadline.abort();
    }
  };
}
