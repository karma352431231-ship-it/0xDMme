import { constants } from 'node:fs';
import {
  mkdir,
  realpath,
  open,
  readdir,
  lstat,
  unlink,
  rmdir,
  copyFile,
  chmod,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { uuid } from '../../shared/account/index.ts';
import { communityMediaPartBytes } from '../../shared/community-media/index.ts';
import type { CommunityMediaSource } from '../../shared/community-media/index.ts';

/** Dedicated private namespaces. No public/static route points at this directory. */
export class CommunityMediaFiles {
  readonly root: string;
  private readonly sharedProcessing: boolean;
  constructor(directory: string, options: { sharedProcessing?: boolean } = {}) {
    this.root = resolve(directory, 'community-media');
    this.sharedProcessing = options.sharedProcessing === true;
  }
  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await realpath(this.root)) !== this.root)
      throw new Error('Diretório de mídia irregular.');
    if (this.sharedProcessing) await chmod(this.root, 0o770);
    await this.sync(resolve(this.root, '..'));
  }
  async directory(id: string): Promise<string> {
    const path = resolve(this.root, uuid(id));
    try {
      await mkdir(path, { mode: 0o700 });
      // The namespace entry must survive a crash before its files can be accepted.
      await this.sync(this.root);
    } catch (e: unknown) {
      if (!isCode(e, 'EEXIST')) throw e;
    }
    const stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path)
      throw new Error('Diretório de mídia irregular.');
    if (this.sharedProcessing) await chmod(path, 0o770);
    return path;
  }
  async part(id: string, index: number, bytes: Uint8Array): Promise<void> {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= 382 ||
      !bytes.length ||
      bytes.length > communityMediaPartBytes
    )
      throw new Error('Parte irregular.');
    const path = resolve(await this.directory(id), `part-${index}`);
    const file = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await this.sync(await this.directory(id));
  }
  async assemble(source: CommunityMediaSource): Promise<string> {
    const path = await this.directory(source.id),
      output = resolve(path, 'source');
    const file = await open(
      output,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        constants.O_NOFOLLOW,
      0o600,
    );
    const hash = createHash('sha256');
    try {
      for (
        let index = 0;
        index < Math.ceil(source.bytes / communityMediaPartBytes);
        index++
      ) {
        const bytes = await this.read(
          source.id,
          `part-${index}`,
          communityMediaPartBytes,
        );
        if (
          bytes.length !==
          Math.min(
            communityMediaPartBytes,
            source.bytes - index * communityMediaPartBytes,
          )
        )
          throw new Error('Upload incompleto.');
        hash.update(bytes);
        await file.writeFile(bytes);
      }
      if (this.sharedProcessing) await file.chmod(0o640);
      await file.sync();
    } finally {
      await file.close();
    }
    if (hash.digest('hex') !== source.hash)
      throw new Error('Upload integral divergente.');
    return output;
  }
  async read(id: string, name: string, maximum: number): Promise<Uint8Array> {
    if (!validName(name)) throw new Error('Objeto irregular.');
    const file = await open(
      resolve(await this.existingDirectory(id), name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || !stat.size || stat.size > maximum)
        throw new Error('Objeto irregular.');
      const bytes = Buffer.alloc(stat.size);
      const read = await file.read(bytes, 0, stat.size, 0);
      if (
        read.bytesRead !== stat.size ||
        (await file.stat()).size !== stat.size
      )
        throw new Error('Objeto incompleto.');
      return bytes;
    } finally {
      await file.close();
    }
  }
  async outputSize(
    id: string,
    name: 'result' | 'thumbnail',
    maximum: number,
  ): Promise<number> {
    const stat = await lstat(resolve(await this.directory(id), name));
    if (!stat.isFile() || !stat.size || stat.size > maximum)
      throw new Error('Mídia preparada excede o tamanho.');
    const file = await open(
      resolve(await this.directory(id), name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    await this.sync(await this.directory(id));
    return stat.size;
  }
  /** Hash immutable prepared output with a bounded buffer, outside SQL transactions. */
  async digest(
    id: string,
    name: 'result' | 'thumbnail',
    expectedBytes: number,
  ): Promise<string> {
    const file = await open(
      resolve(await this.existingDirectory(id), name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size !== expectedBytes ||
        expectedBytes < 1 ||
        expectedBytes > 25_000_000
      )
        throw new Error('Objeto de mídia irregular.');
      const buffer = Buffer.alloc(
          Math.min(expectedBytes, communityMediaPartBytes),
        ),
        hash = createHash('sha256');
      let offset = 0;
      while (offset < expectedBytes) {
        const read = await file.read(
          buffer,
          0,
          Math.min(buffer.length, expectedBytes - offset),
          offset,
        );
        if (!read.bytesRead) throw new Error('Objeto incompleto.');
        hash.update(buffer.subarray(0, read.bytesRead));
        offset += read.bytesRead;
      }
      const after = await file.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
        throw new Error('Objeto alterado durante a leitura.');
      return hash.digest('hex');
    } finally {
      await file.close();
    }
  }
  async slice(
    id: string,
    input: { name: 'result' | 'thumbnail'; index: number; bytes: number },
  ): Promise<Uint8Array> {
    const file = await open(
      resolve(await this.existingDirectory(id), input.name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat(),
        offset = input.index * communityMediaPartBytes;
      if (!stat.isFile() || stat.size !== input.bytes || offset >= stat.size)
        throw new Error('Objeto de mídia irregular.');
      const bytes = Buffer.alloc(
        Math.min(communityMediaPartBytes, stat.size - offset),
      );
      const read = await file.read(bytes, 0, bytes.length, offset);
      if (read.bytesRead !== bytes.length)
        throw new Error('Objeto incompleto.');
      return bytes;
    } finally {
      await file.close();
    }
  }
  async copySource(id: string): Promise<void> {
    const path = await this.directory(id);
    await copyFile(
      resolve(path, 'source'),
      resolve(path, 'result'),
      constants.COPYFILE_EXCL,
    );
  }
  async resetOutput(id: string): Promise<void> {
    const path = await this.directory(id);
    for (const name of ['result', 'thumbnail'])
      await unlink(resolve(path, name)).catch((e: unknown) => {
        if (!isCode(e, 'ENOENT')) throw e;
      });
  }
  async prune(id: string): Promise<void> {
    const path = await this.directory(id);
    for (const name of await this.names(path)) {
      if (name === 'source' || name.startsWith('part-'))
        await unlink(resolve(path, name));
    }
    await this.sync(path);
  }
  async discard(id: string): Promise<void> {
    const path = resolve(this.root, uuid(id));
    try {
      await lstat(path);
    } catch (e: unknown) {
      if (isCode(e, 'ENOENT')) return;
      throw e;
    }
    if ((await realpath(path)) !== path)
      throw new Error('Diretório irregular.');
    for (const name of await this.names(path))
      await unlink(resolve(path, name));
    await rmdir(path);
    await this.sync(this.root);
  }
  private async existingDirectory(id: string): Promise<string> {
    const path = resolve(this.root, uuid(id)),
      stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path)
      throw new Error('Diretório de mídia irregular.');
    return path;
  }
  private async names(path: string): Promise<string[]> {
    const names = await readdir(path);
    if (names.length > 385) throw new Error('Objetos excedem orçamento.');
    for (const name of names) {
      if (!validName(name) || !(await lstat(resolve(path, name))).isFile())
        throw new Error('Objeto irregular.');
    }
    return names;
  }
  private async sync(path: string): Promise<void> {
    const file = await open(path, constants.O_RDONLY);
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }
}
function validName(name: string): boolean {
  return /^(?:source|result|thumbnail|part-(?:[0-9]|[1-9][0-9]{1,2}))$/u.test(
    name,
  );
}
function isCode(e: unknown, code: string): boolean {
  return e instanceof Error && 'code' in e && e.code === code;
}
