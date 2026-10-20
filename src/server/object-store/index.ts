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
  rmdir,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { reserveOperationMemory } from '../memory-admission/index.ts';

const maximumBytes = 3 * 1024 * 1024 + 64 * 1024;
const validIdentifier = /^[a-f0-9]{64}$/u;
const validUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function isExisting(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

/** Independent collectors may already have removed a validated entry. */
function requireMissing(error: unknown): void {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
    throw error;
}

/** Opaque bytes only. No public upload endpoint before authorization/quotas. */
export class ObjectStore {
  private readonly directory: string;
  private readonly staging: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
    this.staging = resolve(directory, '.staging');
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await realpath(this.directory)) !== this.directory)
      throw new Error('Object directory must not use symbolic links.');
    await access(this.directory, constants.R_OK | constants.W_OK);
    await mkdir(this.staging, { mode: 0o700 }).catch((error: unknown) => {
      if (!isExisting(error)) throw error;
    });
    if ((await realpath(this.staging)) !== this.staging)
      throw new Error('Invalid staging.');
    await this.cleanStaging();
  }

  private async cleanStaging(
    olderThan = Date.now() - 60 * 60 * 1000,
  ): Promise<void> {
    const entries = await opendir(this.staging);
    let count = 0;
    for await (const entry of entries) {
      count++;
      if (!/^pending-[a-f0-9-]{36}$/u.test(entry.name))
        throw new Error('Staging requires local review.');
      const path = resolve(this.staging, entry.name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size > maximumBytes)
        throw new Error('Invalid temporary file.');
      // Only unaccepted temporary uploads. Never age/delete final objects.
      if (stat.mtimeMs < olderThan) await unlink(path);
      if (count % 32 === 0) await setImmediate();
    }
  }

  /** Caller holds the exclusive attachment writer lease. Random namespaces isolate
   * reservations; interrupted temporary writes can be removed before resuming. */
  async attachment(id: string): Promise<ObjectStore> {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        id,
      )
    )
      throw new Error('Invalid attachment identifier.');
    const child = new ObjectStore(resolve(this.directory, `attachment-${id}`));
    await child.initialize();
    await child.cleanStaging(Number.POSITIVE_INFINITY);
    return child;
  }
  private async socialObjects(): Promise<ObjectStore> {
    const child = new ObjectStore(resolve(this.directory, 'social-media'));
    await child.initialize();
    return child;
  }
  async socialAttachment(id: string): Promise<ObjectStore> {
    return (await this.socialObjects()).attachment(id);
  }
  async readSocialAttachment(id: string): Promise<ObjectStore> {
    return (await this.socialObjects()).readAttachment(id);
  }
  async discardSocialAttachment(id: string): Promise<void> {
    return (await this.socialObjects()).discardAttachment(id);
  }
  /** Distinct from personal media even when a caller repeats an attachment UUID. */
  async groupMedia(groupId: string): Promise<ObjectStore> {
    if (!validUuid.test(groupId)) throw new Error('Invalid object group.');
    const child = new ObjectStore(resolve(this.directory, `group-${groupId}`));
    await child.initialize();
    return child;
  }
  async readGroupMedia(groupId: string): Promise<ObjectStore> {
    if (!validUuid.test(groupId)) throw new Error('Invalid object group.');
    const path = resolve(this.directory, `group-${groupId}`);
    const stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path)
      throw new Error('Invalid group directory.');
    return new ObjectStore(path);
  }
  async discardGroupMedia(
    groupId: string,
    attachmentId: string,
  ): Promise<void> {
    try {
      await (
        await this.readGroupMedia(groupId)
      ).discardAttachment(attachmentId);
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
  async statusMedia(statusId: string): Promise<ObjectStore> {
    if (!validUuid.test(statusId))
      throw new Error('Invalid object publication.');
    const child = new ObjectStore(
      resolve(this.directory, `status-${statusId}`),
    );
    await child.initialize();
    return child;
  }
  async readStatusMedia(statusId: string): Promise<ObjectStore> {
    if (!validUuid.test(statusId))
      throw new Error('Invalid object publication.');
    const path = resolve(this.directory, `status-${statusId}`),
      stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path)
      throw new Error('Invalid status directory.');
    return new ObjectStore(path);
  }
  async discardStatusMedia(
    statusId: string,
    attachmentId: string,
  ): Promise<void> {
    try {
      await (
        await this.readStatusMedia(statusId)
      ).discardAttachment(attachmentId);
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
  /** Called only after every writer/media row of an irreversibly retired scope has been collected. */
  async discardEmptyMediaScope(
    kind: 'group' | 'status',
    id: string,
  ): Promise<void> {
    if (!validUuid.test(id)) throw new Error('Invalid object scope.');
    const path = resolve(this.directory, `${kind}-${id}`);
    try {
      const stat = await lstat(path);
      if (!stat.isDirectory() || (await realpath(path)) !== path)
        throw new Error('Invalid object directory.');
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return;
      throw error;
    }
    const entries = await opendir(path);
    for await (const entry of entries)
      if (entry.name !== '.staging')
        throw new Error('Scope still contains objects.');
    await this.removeAttachmentFiles(path, false);
    await rmdir(path);
    await this.synchronizeDirectory();
  }
  async readAttachment(id: string): Promise<ObjectStore> {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        id,
      )
    )
      throw new Error('Invalid attachment identifier.');
    const path = resolve(this.directory, `attachment-${id}`);
    const stat = await lstat(path);
    if (!stat.isDirectory() || (await realpath(path)) !== path)
      throw new Error('Invalid attachment directory.');
    return new ObjectStore(path);
  }
  async discardAttachment(id: string): Promise<void> {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        id,
      )
    )
      throw new Error('Invalid attachment identifier.');
    const path = resolve(this.directory, `attachment-${id}`);
    try {
      const stat = await lstat(path);
      if (!stat.isDirectory() || (await realpath(path)) !== path)
        throw new Error('Invalid attachment directory.');
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // A previous unlink may have completed before directory sync failed.
        // Reconfirm durable absence before SQL can release retained bytes.
        await this.synchronizeDirectory();
        return;
      }
      throw error;
    }
    await this.removeAttachmentFiles(path, false);
    await rmdir(path).catch(requireMissing);
    await this.synchronizeDirectory();
  }
  private async removeAttachmentFiles(
    path: string,
    staging: boolean,
  ): Promise<void> {
    const entries = await opendir(path).catch(requireMissing);
    if (!entries) return;
    let count = 0;
    for await (const entry of entries) {
      count++;
      const file = resolve(path, entry.name);
      if (!staging && entry.name === '.staging' && entry.isDirectory()) {
        await this.removeAttachmentFiles(file, true);
        await rmdir(file).catch(requireMissing);
      } else {
        const valid = staging
          ? /^pending-[a-f0-9-]{36}$/u.test(entry.name)
          : validIdentifier.test(entry.name);
        if (!valid || !entry.isFile())
          throw new Error('Invalid attachment object.');
        await unlink(file).catch(requireMissing);
      }
      if (count % 32 === 0) await setImmediate();
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
    if (!validIdentifier.test(identifier)) throw new Error('Invalid object.');
    const file = await open(
      resolve(this.directory, identifier),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > maximumBytes)
        throw new Error('Invalid object.');
      // Bound allocation even if another process changes the file after stat.
      const bytes = Buffer.alloc(stat.size);
      const read = await file.read(bytes, 0, stat.size, 0);
      const after = await file.stat();
      if (read.bytesRead !== stat.size || after.size !== stat.size)
        throw new Error('Object changed while reading.');
      if (createHash('sha256').update(bytes).digest('hex') !== identifier)
        throw new Error('Invalid object integrity.');
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
      throw new Error('Invalid object size.');
    // The caller already holds its input. Reserve the immutable snapshot,
    // collision-verification read and filesystem bookkeeping before copying.
    const release = reserveOperationMemory(ciphertext.byteLength * 2 + 65_536);
    if (!release) throw new Error('Storage busy.');
    try {
      return await this.writeObject(Uint8Array.from(ciphertext));
    } finally {
      release();
    }
  }

  /** Caller owns an exclusively reserved, unaccepted object. Never expire accepted files. */
  async discardUnaccepted(identifier: string): Promise<void> {
    return this.discardObject(identifier);
  }

  /** Caller has committed an authenticated personal removal; its retained bytes
   * stay charged until this durable unlink and the corresponding collection receipt. */
  async discardPersonal(identifier: string): Promise<void> {
    return this.discardObject(identifier);
  }
  private async discardObject(identifier: string): Promise<void> {
    if (!validIdentifier.test(identifier)) throw new Error('Invalid object.');
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
