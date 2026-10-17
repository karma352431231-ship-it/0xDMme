import { createServer, connect } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';

/** Synthetic local PostgreSQL only: drop the acknowledgement after real COMMIT. */
export async function allocationCommitProxy(databaseUrl: string) {
  const target = new URL(databaseUrl);
  if (
    target.hostname !== '127.0.0.1' ||
    !target.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('Exclusive local synthetic database required.');
  const sockets = new Set<Socket>();
  const state = { dropped: 0 };
  const server = createServer((downstream) => {
    const upstream = connect({
      host: '127.0.0.1',
      port: Number(target.port) || 5432,
    });
    for (const socket of [downstream, upstream]) {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    }
    downstream.once('error', () => upstream.destroy());
    upstream.once('error', () => downstream.destroy());
    downstream.once('close', () => upstream.destroy());
    upstream.once('close', () => downstream.destroy());
    downstream.pipe(upstream);
    let pending = Buffer.alloc(0);
    upstream.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 5) {
        const length = 1 + pending.readUInt32BE(1);
        if (length < 5 || length > 65536) {
          downstream.destroy();
          upstream.destroy();
          return;
        }
        if (pending.length < length) return;
        const frame = pending.subarray(0, length);
        pending = pending.subarray(length);
        if (frame[0] === 0x43 && frame.subarray(5).toString() === 'COMMIT\0') {
          state.dropped++;
          downstream.destroy();
          upstream.destroy();
          return;
        }
        downstream.write(frame);
      }
    });
  });
  server.listen({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening', { signal: AbortSignal.timeout(1000) });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Synthetic proxy address required.');
  const url = new URL(databaseUrl);
  url.port = String(address.port);
  return {
    url: url.href,
    state,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
