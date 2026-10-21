import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

/** Read one regular file with a byte budget, without following a final symlink. */
export async function readBoundedFile(
  path: string,
  limit: number,
): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.size > limit)
    throw new Error('Invalid release file or size.');
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('Release file changed or exceeds its budget.');
    const buffer = Buffer.alloc(info.size + 1);
    let used = 0;
    while (used < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        used,
        buffer.byteLength - used,
        used,
      );
      if (!bytesRead) break;
      used += bytesRead;
    }
    if (used > info.size)
      throw new Error('Release file changed while reading.');
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
