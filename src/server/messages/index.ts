import { SocialDmService, socialDmOperations } from '../social-dm/index.ts';
import { AttachmentService } from '../attachments/index.ts';
import { representativeOperations } from '../representatives/index.ts';
import type { RepresentativeService } from '../representatives/index.ts';
import type { NotificationService } from '../notifications/index.ts';
import { GroupService, groupOperations } from '../groups/index.ts';
import { GroupMediaService, groupMediaOperations } from '../groups/index.ts';
import { StatusService, statusOperations } from '../status/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  digest,
  directoryEvent,
  fingerprint,
  verify,
} from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  messageBody,
  messagePacket,
  messageProof,
  recoveryKey,
  verifyPacket,
  verifyRecoveryKey,
  verifyMatrixBinding,
} from '../../shared/messages/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type {
  ContactAuthority,
  Database,
  DeviceStore,
  MessageSnapshot,
} from '../database/index.ts';
import {
  assertBindingAccount,
  matrixClaim,
  matrixQuery,
  matrixSend,
  matrixUpload,
  groupMatrixQuery,
  groupMatrixClaim,
  groupMatrixSend,
} from '../matrix-protocol/index.ts';
type Action = (
  a: ContactAuthority,
  d: Record<string, unknown>,
  p: MessageProof,
) => Promise<unknown>;
function sequence(value: unknown): number {
  return integer(value, Number.MAX_SAFE_INTEGER);
}
function snapshot(input: unknown): MessageSnapshot {
  const data = object(input);
  keys(data, ['revision', 'directory', 'contacts']);
  return {
    revision: sequence(data['revision']),
    directory: fingerprint(data['directory']),
    contacts: sequence(data['contacts']),
  };
}
export class MessageService {
  private readonly db: Pick<
    Database,
    | 'messages'
    | 'messageRecovery'
    | 'matrix'
    | 'contacts'
    | 'attachments'
    | 'backups'
    | 'groups'
    | 'groupDaily'
    | 'groupMessages'
    | 'groupMedia'
    | 'groupRetention'
    | 'socialDm'
    | 'socialCrypto'
    | 'socialMatrix'
    | 'socialHistory'
    | 'socialMedia'
    | 'statuses'
    | 'statusMedia'
  >;
  private readonly devices: DeviceStore;
  private readonly actions: Record<string, Action>;
  private readonly attachments: AttachmentService | null;
  private readonly objects: ObjectStore | null;
  private readonly notifications: NotificationService | null;
  private readonly groupMedia: GroupMediaService | null;
  private readonly statuses: StatusService | null;
  private readonly social: SocialDmService;
  private readonly representatives: RepresentativeService | null;
  constructor(
    db: Pick<
      Database,
      | 'messages'
      | 'messageRecovery'
      | 'matrix'
      | 'contacts'
      | 'attachments'
      | 'backups'
      | 'groups'
      | 'groupDaily'
      | 'groupMessages'
      | 'groupMedia'
      | 'groupRetention'
      | 'socialDm'
      | 'socialCrypto'
      | 'socialMatrix'
      | 'socialHistory'
      | 'socialMedia'
      | 'statuses'
      | 'statusMedia'
    >,
    devices: DeviceStore,
    objects?: ObjectStore,
    services: {
      notifications?: NotificationService;
      representatives?: RepresentativeService;
    } = {},
  ) {
    this.db = db;
    this.representatives = services.representatives ?? null;
    this.notifications = services.notifications ?? null;
    this.objects = objects ?? null;
    this.devices = devices;
    this.attachments = objects
      ? new AttachmentService(db.attachments, db.messages, objects)
      : null;
    this.groupMedia = this.mediaService(objects);
    this.statuses = this.statusService(objects);
    this.actions = {
      live: (a, d) => {
        keys(d, []);
        return Promise.resolve(a.directory);
      },
      'playback-allowed': (a, d) => {
        keys(d, ['peer']);
        return db.contacts.playbackAllowed(a, uuid(d['peer']));
      },
      'recovery-current': (a, d) => {
        keys(d, []);
        return db.messageRecovery.current(a);
      },
      'recovery-key': (a, d) => {
        keys(d, ['id']);
        return db.messageRecovery.historical(a, uuid(d['id']));
      },
      'recovery-peer': (a, d) => {
        keys(d, ['accountId']);
        return db.messageRecovery.peer(a, uuid(d['accountId']));
      },
      'recovery-register': (a, d) => this.register(a, d),
      publish: (a, d) => this.publish(a, d),
      'profile-known': (a, d) => {
        keys(d, ['id', 'peer']);
        return db.messages.profileKnown(a, uuid(d['id']), uuid(d['peer']));
      },
      accepted: (a, d) => {
        keys(d, ['id', 'hash']);
        return db.messages.accepted(a, uuid(d['id']), fingerprint(d['hash']));
      },
      'personal-clean': async (a, _d, p) => {
        const result = await db.backups.clean(a, p);
        await this.cleanPersonal();
        await this.attachments?.clean();
        await this.social.clean();
        return result;
      },
      'personal-page': (a, d) => {
        keys(d, ['after']);
        return db.backups.page(a, sequence(d['after']));
      },
      snapshot: (a, d) => {
        keys(d, []);
        return db.messages.snapshot(a);
      },
      page: (a, d) => {
        keys(d, ['snapshot', 'after']);
        return db.messages.page(a, {
          snapshot: snapshot(d['snapshot']),
          after: sequence(d['after']),
        });
      },
      relations: (a, d) => {
        keys(d, ['ids', 'snapshot']);
        if (!Array.isArray(d['ids']) || d['ids'].length > 16)
          throw new AccountError(400, 'Lote inválido.');
        return db.messages.relations(
          a,
          d['ids'].map(uuid),
          snapshot(d['snapshot']),
        );
      },
      object: (a, d) => {
        keys(d, ['id', 'snapshot']);
        return db.messages.object(a, uuid(d['id']), snapshot(d['snapshot']));
      },
      'backup-window': async (a, d) => {
        keys(d, ['ids', 'snapshot']);
        if (
          !Array.isArray(d['ids']) ||
          !d['ids'].length ||
          d['ids'].length > 32
        )
          throw new AccountError(400, 'Lote inválido.');
        const ids = d['ids'].map(uuid);
        if (new Set(ids).size !== ids.length)
          throw new AccountError(400, 'Lote duplicado.');
        const rows = await db.messages.backupWindow(
          a,
          ids,
          snapshot(d['snapshot']),
        );
        const recovery = new Map<string, unknown>();
        for (const row of rows) {
          const archive = row.packet?.archives.find(
            (k) => k.accountId === a.session.accountId,
          );
          if (archive && !recovery.has(archive.keyId))
            recovery.set(
              archive.keyId,
              await db.messageRecovery.historical(a, archive.keyId),
            );
        }
        await db.messages.confirmSnapshot(a, snapshot(d['snapshot']));
        return { rows, recovery: [...recovery.values()] };
      },
      'backup-ack': async (a, d) => {
        keys(d, ['items', 'snapshot']);
        if (!Array.isArray(d['items']) || d['items'].length > 32)
          throw new AccountError(400, 'Lote inválido.');
        await db.messages.confirmSnapshot(a, snapshot(d['snapshot']));
        for (const item of d['items']) {
          const row = object(item);
          keys(row, ['id', 'hash']);
          await db.messages.acknowledge(
            a,
            uuid(row['id']),
            fingerprint(row['hash']),
          );
        }
        await db.messages.confirmSnapshot(a, snapshot(d['snapshot']));
      },
      confirm: (a, d) => {
        keys(d, ['snapshot']);
        return db.messages.confirmSnapshot(a, snapshot(d['snapshot']));
      },
      delivery: (a, d) => {
        keys(d, ['snapshot', 'ids']);
        if (!Array.isArray(d['ids']) || d['ids'].length > 18)
          throw new AccountError(400, 'Lote inválido.');
        return db.messages.delivery(a, {
          snapshot: snapshot(d['snapshot']),
          ids: d['ids'].map(uuid),
        });
      },
      acknowledge: (a, d) => {
        keys(d, ['id', 'hash']);
        return db.messages.acknowledge(
          a,
          uuid(d['id']),
          fingerprint(d['hash']),
        );
      },
      delete: async (a, d, p) => {
        keys(d, ['id', 'hash', 'revision']);
        integer(d['revision'], 128);
        await db.messages.remove(a, uuid(d['id']), fingerprint(d['hash']), p);
        await this.attachments?.clean();
        return { status: 'saved' };
      },
      'peer-directory': (a, d) => {
        keys(d, ['accountId', 'after']);
        return db.contacts.directory(
          a,
          uuid(d['accountId']),
          integer(d['after'], 128),
        );
      },
      history: (a, d) => {
        keys(d, ['accountId', 'after', 'through']);
        return db.messages.history(a, {
          accountId: uuid(d['accountId']),
          after: integer(d['after'], 128),
          through: integer(d['through'], 128),
        });
      },
      'matrix-upload': (a, d) => this.upload(a, d),
      'matrix-query': async (a, d) => db.matrix.query(a, matrixQuery(d)),
      'matrix-claim': async (a, d) => ({
        response: await db.matrix.claim(a, matrixClaim(d)),
      }),
      'matrix-send': async (a, d) => {
        const value = matrixSend(d);
        return { response: await db.matrix.send(a, value.id, value.envelopes) };
      },
      'matrix-inbox': (a, d) => {
        keys(d, []);
        return db.matrix.inbox(a);
      },
      'matrix-received': (a, d) => {
        keys(d, ['sequences']);
        const values = d['sequences'];
        if (!Array.isArray(values) || values.length > 16)
          throw new AccountError(400, 'Lote inválido.');
        return db.matrix.received(a, values.map(sequence));
      },
      'group-matrix-query': (a, d) => {
        const { scope, payload } = groupMatrixInput(d);
        return db.matrix.groupQuery(a, {
          ...scope,
          accounts: groupMatrixQuery(payload),
        });
      },
      'group-matrix-claim': async (a, d) => {
        const { scope, payload } = groupMatrixInput(d);
        return {
          response: await db.matrix.groupClaim(a, {
            ...scope,
            requests: groupMatrixClaim(payload),
          }),
        };
      },
      'group-matrix-send': async (a, d) => {
        const { scope, payload } = groupMatrixInput(d);
        return {
          response: await db.matrix.groupSend(a, {
            ...scope,
            ...groupMatrixSend(payload),
          }),
        };
      },
      'group-matrix-inbox': (a, d) => {
        keys(d, ['after']);
        return db.matrix.groupInbox(a, sequence(d['after']));
      },
      'group-matrix-received': (a, d) => {
        keys(d, ['sequences']);
        const values = d['sequences'];
        if (!Array.isArray(values) || values.length > 16)
          throw new AccountError(400, 'Lote inválido.');
        return db.matrix.groupReceived(a, values.map(sequence));
      },
    };
    const social = new SocialDmService(db, objects);
    this.social = social;
    for (const operation of socialDmOperations)
      this.actions[operation] = (a, d) => social.operate(a, operation, d);
    this.installGroupOperations();
    this.installStatusOperations();
    for (const operation of representativeOperations)
      this.actions[operation] = (a, d) => {
        if (!this.representatives)
          throw new AccountError(503, 'Autorizações indisponíveis.');
        return this.representatives.operate(a, operation, d);
      };
    for (const operation of [
      'daily-config',
      'daily-push-state',
      'daily-push-configure',
      'daily-state',
      'daily-states',
      'daily-configure',
      'daily-mute',
      'daily-heartbeat',
      'daily-read',
      'daily-receipts',
      'daily-subscribe',
    ])
      this.actions[operation] = (a, d) => {
        if (!this.notifications)
          throw new AccountError(503, 'Notificações indisponíveis.');
        return this.notifications.operate(a, operation, d);
      };
    for (const operation of [
      'attachment-reserve',
      'attachment-part',
      'attachment-finish',
      'attachment-cancel',
      'attachment-get',
    ])
      this.actions[operation] = (a, d) => {
        if (!this.attachments)
          throw new AccountError(503, 'Armazenamento de anexos indisponível.');
        return this.attachments.operate(
          a,
          operation,
          d,
          operation === 'attachment-get' ? snapshot(d['snapshot']) : undefined,
        );
      };
  }
  async cleanPersonal(): Promise<void> {
    if (!this.objects) return;
    for (const item of await this.db.backups.garbage()) {
      await this.objects.discardPersonal(item.object_hash);
      await this.db.backups.collected(item.account_id, item.id);
    }
  }
  async cleanAttachments(): Promise<void> {
    await this.cleanPersonal();
    await this.attachments?.clean();
    await this.social.clean();
    await this.groupMedia?.clean();
    await this.db.groupDaily.clean();
    await this.statuses?.clean();
  }
  private mediaService(
    objects: ObjectStore | undefined,
  ): GroupMediaService | null {
    return objects
      ? new GroupMediaService(
          this.db.groupMedia,
          this.db.groupRetention,
          objects,
        )
      : null;
  }
  async close(): Promise<void> {
    await this.statuses?.close();
  }
  private statusService(
    objects: ObjectStore | undefined,
  ): StatusService | null {
    return objects
      ? new StatusService(this.db.statuses, this.db.statusMedia, objects)
      : null;
  }
  private installGroupOperations(): void {
    const groups = new GroupService(
      this.db.groups,
      this.db.groupMessages,
      this.db.groupDaily,
    );
    for (const operation of groupOperations)
      this.actions[operation] = (a, d) => groups.operate(a, operation, d);
    for (const operation of groupMediaOperations)
      this.actions[operation] = (a, d) => {
        if (!this.groupMedia)
          throw new AccountError(503, 'Armazenamento de mídia indisponível.');
        return this.groupMedia.operate(a, operation, d);
      };
  }
  private installStatusOperations(): void {
    for (const operation of statusOperations)
      this.actions[operation] = (a, d) => {
        if (!this.statuses)
          throw new AccountError(503, 'Armazenamento de status indisponível.');
        return this.statuses.operate(a, operation, d);
      };
  }
  async preflightSocialAttachment(
    session: AccountSession,
    id: unknown,
  ): Promise<void> {
    const current = await this.devices.current(session.accountId);
    if (!current) throw new AccountError(403, 'Aparelho não autorizado.');
    await this.social.preflight({ session, directory: current.head }, uuid(id));
  }
  async preflightAttachment(
    session: AccountSession,
    id: unknown,
  ): Promise<void> {
    const current = await this.devices.current(session.accountId);
    if (!current) throw new AccountError(403, 'Aparelho não autorizado.');
    await this.db.attachments.preflight(
      { session, directory: current.head },
      uuid(id),
    );
  }
  async liveCurrent(session: AccountSession, head: string): Promise<boolean> {
    const current = await this.devices.current(session.accountId);
    return (
      current?.head === head &&
      directoryEvent(current.event).devices.some(
        (device) => device.id === session.deviceId,
      )
    );
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action)
      throw new AccountError(404, 'Operação de mensagem indisponível.');
    const { proof, current } = await this.authenticate(
      operation,
      session,
      input,
    );
    this.checkDeletionRevision(operation, proof, current.revision);
    const result = await action(
      { session, directory: proof.directory },
      proof.payload,
      proof,
    );
    return result === undefined ? { status: 'saved' } : result;
  }
  /** Shared device signature boundary; callers still enforce their own operation ACL. */
  async authenticate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ) {
    const proof = messageProof(input),
      current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (d) => d.id === session.deviceId,
      );
    if (
      !signer ||
      proof.deviceId !== session.deviceId ||
      current?.head !== proof.directory
    )
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    await verify(
      signer.signing,
      proof.signature,
      messageBody(session.accountId, session.deviceId, operation, proof),
    );
    if (!current)
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    return { proof, current };
  }
  private checkDeletionRevision(
    operation: string,
    proof: MessageProof,
    revision: number,
  ): void {
    if (operation === 'delete' && proof.payload['revision'] !== revision)
      throw new AccountError(409, 'Autoridade da exclusão divergente.');
  }
  private async register(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['key']);
    const key = recoveryKey(d['key']),
      current = await this.devices.current(a.session.accountId);
    if (!current) throw new AccountError(403, 'Diretório ausente.');
    await verifyRecoveryKey(key, directoryEvent(current.event));
    return this.db.messageRecovery.register(a, key);
  }
  private async upload(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    const value = matrixUpload(d),
      current = await this.devices.current(a.session.accountId);
    if (!current) throw new AccountError(403, 'Diretório ausente.');
    assertBindingAccount(
      value.binding,
      a.session.accountId,
      a.session.deviceId,
    );
    await verifyMatrixBinding(value.binding, directoryEvent(current.event));
    return { response: await this.db.matrix.upload(a, value) };
  }
  private async publish(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['packet']);
    const packet = messagePacket(d['packet']),
      hash = await digest(JSON.stringify(packet));
    if (packet.socialMedia)
      throw new AccountError(400, 'Formato de DM pelo @ fora deste contexto.');
    if (await this.db.messages.accepted(a, packet.id, hash))
      return { status: 'accepted', hash };
    const current = await this.devices.current(a.session.accountId);
    if (!current) throw new AccountError(403, 'Diretório ausente.');
    await verifyPacket(packet, directoryEvent(current.event));
    return this.db.messages.admit(a, packet, hash);
  }
}
function groupMatrixInput(data: Record<string, unknown>): {
  scope: { groupId: string; head: string };
  payload: Record<string, unknown>;
} {
  keys(data, ['groupId', 'head', 'payload']);
  return {
    scope: { groupId: uuid(data['groupId']), head: fingerprint(data['head']) },
    payload: object(data['payload']),
  };
}
