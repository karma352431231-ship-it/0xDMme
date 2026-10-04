import { AttachmentService } from '../attachments/index.ts';
import type { NotificationService } from '../notifications/index.ts';
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
} from './matrix.ts';
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
  >;
  private readonly devices: DeviceStore;
  private readonly actions: Record<string, Action>;
  private readonly attachments: AttachmentService | null;
  private readonly objects: ObjectStore | null;
  private readonly notifications: NotificationService | null;
  constructor(
    db: Pick<
      Database,
      | 'messages'
      | 'messageRecovery'
      | 'matrix'
      | 'contacts'
      | 'attachments'
      | 'backups'
    >,
    devices: DeviceStore,
    objects?: ObjectStore,
    notifications?: NotificationService,
  ) {
    this.db = db;
    this.notifications = notifications ?? null;
    this.objects = objects ?? null;
    this.devices = devices;
    this.attachments = objects
      ? new AttachmentService(db.attachments, db.messages, objects)
      : null;
    this.actions = {
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
    };
    for (const operation of [
      'daily-config',
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
    this.checkDeletionRevision(operation, proof, current.revision);
    const result = await action(
      { session, directory: proof.directory },
      proof.payload,
      proof,
    );
    return result === undefined ? { status: 'saved' } : result;
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
    if (await this.db.messages.accepted(a, packet.id, hash))
      return { status: 'accepted', hash };
    const current = await this.devices.current(a.session.accountId);
    if (!current) throw new AccountError(403, 'Diretório ausente.');
    await verifyPacket(packet, directoryEvent(current.event));
    return this.db.messages.admit(a, packet, hash);
  }
}
