import { lstat, realpath, statfs } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export interface VolumeFilesystem {
  realpath(path: string): Promise<string>;
  directory(path: string): Promise<{ device: bigint; directory: boolean }>;
  space(path: string): Promise<{
    blockSize: bigint;
    availableBlocks: bigint;
    freeBlocks: bigint;
    totalBlocks: bigint;
  }>;
}
const filesystem: VolumeFilesystem = {
  realpath,
  async directory(path) {
    const info = await lstat(path, { bigint: true });
    return { device: info.dev, directory: info.isDirectory() };
  },
  async space(path) {
    const info = await statfs(path, { bigint: true });
    return {
      blockSize: info.bsize,
      availableBlocks: info.bavail,
      freeBlocks: info.bfree,
      totalBlocks: info.blocks,
    };
  },
};
export interface VolumeReader {
  read(): Promise<bigint>;
}

async function directoryDevice(io: VolumeFilesystem, path: string) {
  const [canonical, info] = await Promise.all([
    io.realpath(path),
    io.directory(path),
  ]);
  if (canonical !== path || !info.directory)
    throw new Error('Storage volume path unavailable');
  return info.device;
}

async function boundedRead(read: Promise<bigint>): Promise<bigint> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Storage volume measurement timed out')),
          1000,
        );
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class PinnedVolume implements VolumeReader {
  private readonly io: VolumeFilesystem;
  private readonly path: string;
  private readonly device: bigint;
  private active: Promise<bigint> | undefined;
  constructor(input: { io: VolumeFilesystem; path: string; device: bigint }) {
    this.io = input.io;
    this.path = input.path;
    this.device = input.device;
  }
  async read(): Promise<bigint> {
    if (this.active)
      throw new Error('Storage volume measurement still pending');
    const reading = this.sample();
    this.active = reading;
    void reading
      .finally(() => {
        if (this.active === reading) this.active = undefined;
      })
      .catch(() => undefined);
    return boundedRead(reading);
  }
  private async sample(): Promise<bigint> {
    if ((await directoryDevice(this.io, this.path)) !== this.device)
      throw new Error('Storage volume changed');
    const space = await this.io.space(this.path);
    if ((await directoryDevice(this.io, this.path)) !== this.device)
      throw new Error('Storage volume changed');
    if (
      space.blockSize <= 0n ||
      space.availableBlocks < 0n ||
      space.freeBlocks < space.availableBlocks ||
      space.totalBlocks < space.freeBlocks
    )
      throw new Error('Storage volume space unavailable');
    return space.blockSize * space.availableBlocks;
  }
}

/** A service-owned bind mount must resolve to a different device from its private parent. */
export async function createPinnedVolume(input: {
  directory: string;
  filesystem?: VolumeFilesystem;
}): Promise<VolumeReader> {
  const path = resolve(input.directory),
    io = input.filesystem ?? filesystem;
  const [device, parent] = await Promise.all([
    directoryDevice(io, path),
    io.directory(dirname(path)),
  ]);
  if (!parent.directory || device === parent.device)
    throw new Error('Dedicated storage volume mount required');
  const volume = new PinnedVolume({ io, path, device });
  await volume.read();
  return volume;
}
