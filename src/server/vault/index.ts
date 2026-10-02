import {
  AccountError,
  base64,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { directoryEvent, eventHash } from '../../shared/devices/index.ts';
import {
  blockLimit,
  bytesHash,
  commitHash,
  integer,
  verifyCommit,
} from '../../shared/vault/index.ts';
import type { DeviceStore, VaultStore } from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
export class VaultService {
  private readonly store: VaultStore;
  private readonly devices: DeviceStore;
  private readonly objects: ObjectStore;
  constructor(options: {
    store: VaultStore;
    devices: DeviceStore;
    objects: ObjectStore;
  }) {
    this.store = options.store;
    this.devices = options.devices;
    this.objects = options.objects;
  }
  private async authority(session: AccountSession) {
    const row = await this.devices.current(session.accountId);
    if (!row)
      throw new AccountError(
        403,
        'Configure aparelhos e recuperação antes de abrir o cofre.',
      );
    const authority = directoryEvent(row.event);
    if (!authority.devices.some((d) => d.id === session.deviceId))
      throw new AccountError(403, 'Aparelho não autorizado ao cofre.');
    return authority;
  }
  async preflight(session: AccountSession, id: unknown): Promise<void> {
    await this.authority(session);
    await this.store.preflight(session.accountId, uuid(id));
  }
  /** Bounded admission cleanup; keeps bytes charged until object deletion succeeds. */
  async cleanExpired(): Promise<void> {
    for (const item of await this.store.expiredReservations()) {
      const claimed = await this.store.claimExpired(item.account_id, item.id);
      if (!claimed) continue;
      try {
        await this.objects.discardUnaccepted(claimed.hash);
        await this.store.finishDiscard(
          item.account_id,
          item.id,
          claimed.writer,
        );
      } catch (error: unknown) {
        await this.store.releaseDiscard(
          item.account_id,
          item.id,
          claimed.writer,
        );
        throw error;
      }
    }
  }
  async operate(
    path: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const data = object(input);
    const authority = await this.authority(session);
    const directory = await eventHash(authority);
    if (path === 'read') {
      keys(data, ['after']);
      return this.store.page(session, directory, integer(data['after']));
    }
    if (path === 'object') {
      keys(data, ['id']);
      const commit = await this.store.object(
        session,
        directory,
        uuid(data['id']),
      );
      return {
        id: commit.id,
        ciphertext: encode(await this.objects.read(commit.block.hash)),
      };
    }
    if (path === 'discard') {
      keys(data, ['id']);
      const id = uuid(data['id']);
      const { hash, writer } = await this.store.beginDiscard(
        session,
        directory,
        id,
      );
      try {
        await this.objects.discardUnaccepted(hash);
        await this.store.finishDiscard(session.accountId, id, writer);
      } catch (error: unknown) {
        await this.store.releaseDiscard(session.accountId, id, writer);
        throw error;
      }
      return { status: 'discarded' };
    }
    if (path === 'reserve') {
      keys(data, ['commit']);
      const commit = await verifyCommit(data['commit'], authority);
      if (commit.deviceId !== session.deviceId)
        throw new AccountError(403, 'Operação assinada por outro aparelho.');
      await this.cleanExpired();
      return this.store.reserve(session, commit, await commitHash(commit));
    }
    if (path === 'upload') {
      return this.upload(session, data);
    }
    throw new AccountError(404, 'Operação de cofre não encontrada.');
  }
  private async upload(session: AccountSession, data: Record<string, unknown>) {
    keys(data, ['commit', 'ciphertext']);
    const commit = await verifyCommit(
      data['commit'],
      await this.authority(session),
    );
    if (commit.deviceId !== session.deviceId)
      throw new AccountError(403, 'Operação assinada por outro aparelho.');
    const bytes = base64(data['ciphertext'], blockLimit);
    if (
      bytes.length !== commit.block.bytes ||
      (await bytesHash(bytes)) !== commit.block.hash
    )
      throw new AccountError(400, 'Upload incompleto ou divergente.');
    const hash = await commitHash(commit);
    const writer = await this.store.beginUpload(session, commit, hash);
    if (writer) {
      try {
        if ((await this.objects.put(bytes)) !== commit.block.hash)
          throw new Error('Objeto divergente.');
        await this.store.finishUpload({ session, commit, hash, writer });
      } catch (error: unknown) {
        await this.store.releaseUpload(session.accountId, commit.id, writer);
        throw error;
      }
    }
    return { status: 'accepted', head: hash, sequence: commit.sequence };
  }
}
