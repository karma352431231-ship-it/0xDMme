import { lstat, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';

async function listening(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({
      path,
      signal: AbortSignal.timeout(1000),
    });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT')
        resolve(false);
      else reject(error);
    });
  });
}
/** Recover only our owned stale socket, never replace a file, symlink or live sender. */
export async function preparePushSocket(path: string): Promise<void> {
  let stat: import('node:fs').Stats;
  try {
    stat = await lstat(path);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return;
    throw error;
  }
  if (!stat.isSocket() || stat.uid !== process.getuid?.())
    throw new Error('Arquivo de socket não pertence ao emissor.');
  if (await listening(path)) throw new Error('Emissor já está ativo.');
  await unlink(path);
}
