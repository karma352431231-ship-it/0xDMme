import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  link,
  mkdir,
  open,
  opendir,
  realpath,
  unlink,
  lstat,
} from 'node:fs/promises';
import { resolve } from 'node:path';

const maximumBytes = 3 * 1024 * 1024 + 64 * 1024;
const validIdentifier = /^[a-f0-9]{64}$/u;

function isExisting(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

/** Opaque bytes only. No public upload endpoint before authorization/quotas. */
export class ObjectStore {
  private readonly directory: string;
  private readonly staging: string;
  private writers = 0;

  constructor(directory: string) {
    this.directory = resolve(directory);
    this.staging = resolve(directory, '.staging');
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await realpath(this.directory)) !== this.directory)
      throw new Error('Diretório de objetos não pode usar links simbólicos.');
    await access(this.directory, constants.R_OK | constants.W_OK);
    await mkdir(this.staging, { mode: 0o700 }).catch((error: unknown) => {
      if (!isExisting(error)) throw error;
    });
    if ((await realpath(this.staging)) !== this.staging)
      throw new Error('Staging inválido.');
    await this.cleanStaging();
  }

  private async cleanStaging(): Promise<void> {
    const entries = await opendir(this.staging);
    let count = 0;
    for await (const entry of entries) {
      count++;
      if (count > 32 || !/^pending-[a-f0-9-]{36}$/u.test(entry.name))
        throw new Error('Staging exige revisão local.');
      const path = resolve(this.staging, entry.name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size > maximumBytes)
        throw new Error('Temporário inválido.');
      // Only unaccepted temporary uploads. Never age/delete final objects.
      if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) await unlink(path);
    }
  }

  async healthy(): Promise<boolean> {
    try {
      await access(this.directory, constants.R_OK | constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async read(identifier: string): Promise<Uint8Array> {
    if (!validIdentifier.test(identifier)) throw new Error('Objeto inválido.');
    const file = await open(
      resolve(this.directory, identifier),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > maximumBytes)
        throw new Error('Objeto inválido.');
      // Bound allocation even if another process changes the file after stat.
      const bytes = Buffer.alloc(stat.size);
      const read = await file.read(bytes, 0, stat.size, 0);
      const after = await file.stat();
      if (read.bytesRead !== stat.size || after.size !== stat.size)
        throw new Error('Objeto alterado durante a leitura.');
      if (createHash('sha256').update(bytes).digest('hex') !== identifier)
        throw new Error('Integridade do objeto inválida.');
      return bytes;
    } finally {
      await file.close();
    }
  }

  private async synchronizeDirectory(): Promise<void> {
    const directory = await open(this.directory, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  async put(ciphertext: Uint8Array): Promise<string> {
    if (ciphertext.byteLength === 0 || ciphertext.byteLength > maximumBytes)
      throw new Error('Tamanho de objeto inválido.');
    if (this.writers >= 8) throw new Error('Armazenamento ocupado.');
    this.writers++;
    try {
      return await this.writeObject(Uint8Array.from(ciphertext));
    } finally {
      this.writers--;
    }
  }

  /** Caller owns an exclusively reserved, unaccepted object. Never expire accepted files. */
  async discardUnaccepted(identifier: string): Promise<void> {
    if (!validIdentifier.test(identifier)) throw new Error('Objeto inválido.');
    await unlink(resolve(this.directory, identifier)).catch(
      (error: unknown) => {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      },
    );
    await this.synchronizeDirectory();
  }

  private async writeObject(bytes: Uint8Array): Promise<string> {
    // Snapshot above prevents caller mutation while filesystem operations await.
    const identifier = createHash('sha256').update(bytes).digest('hex');
    const pending = resolve(this.staging, `pending-${randomUUID()}`);
    try {
      const file = await open(pending, 'wx', 0o600);
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
      await link(pending, resolve(this.directory, identifier));
      await this.synchronizeDirectory();
    } catch (error: unknown) {
      if (!isExisting(error)) throw error;
      // A collision with corrupt/symlinked data must fail, not report success.
      await this.read(identifier);
      await this.synchronizeDirectory();
    } finally {
      await unlink(pending).catch((error: unknown) => {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      });
    }
    return identifier;
  }
}
