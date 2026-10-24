import { MessageAuthority } from './authority.ts';
import type { MessageAction } from './operation.ts';
import { directMessageOperations } from './direct-operations.ts';
import { backupMessageOperations } from './backup-operations.ts';
import { matrixMessageOperations } from './matrix-operations.ts';
import { messageSnapshot as snapshot } from './operation-input.ts';
import { collectPersonalBackups } from '../personal-backup-collection/index.ts';
import { callContext } from '../call-context/index.ts';

import { SocialDmService, socialDmOperations } from '../social-dm/index.ts';
import { AttachmentService } from '../attachments/index.ts';
import { representativeOperations } from '../representatives/index.ts';
import type { RepresentativeService } from '../representatives/index.ts';
import type { NotificationService } from '../notifications/index.ts';
import { GroupService, groupOperations } from '../groups/index.ts';
import { GroupMediaService, groupMediaOperations } from '../groups/index.ts';
import { StatusService, statusOperations } from '../status/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
import { AccountError, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';

import { chatFileLimit } from '../../shared/attachments/index.ts';

import type { Database, DeviceStore } from '../database/index.ts';

export class MessageService {
  private readonly db: Pick<
    Database,
    | 'attachments'
    | 'backups'
    | 'groups'
    | 'groupDaily'
    | 'groupMessages'
    | 'groupMedia'
    | 'groupRetention'
    | 'statuses'
    | 'statusMedia'
  >;
  private readonly devices: DeviceStore;
  private readonly actions: Record<string, MessageAction>;
  private readonly authority: MessageAuthority;
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
      | 'vault'
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
    this.authority = new MessageAuthority(devices);
    this.attachments = objects
      ? new AttachmentService(
          db.attachments,
          db.messages,
          objects,
          chatFileLimit,
        )
      : null;
    this.groupMedia = this.mediaService(objects);
    this.statuses = this.statusService(objects);
    this.actions = {
      'call-context': callContext(db),
      ...directMessageOperations({
        messages: db.messages,
        contacts: db.contacts,
        devices,
        attachments: this.attachments,
      }),
      ...backupMessageOperations({
        messages: db.messages,
        recovery: db.messageRecovery,
        backups: db.backups,
        devices,
        collectRemoved: async () => {
          await this.cleanPersonal();
          await this.attachments?.clean();
          await this.social.clean();
        },
      }),
      ...matrixMessageOperations({ store: db.matrix, devices }),
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
          throw new AccountError(503, 'Authorizations unavailable.');
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
          throw new AccountError(503, 'Notifications unavailable.');
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
          throw new AccountError(503, 'Attachment storage unavailable.');
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
    await collectPersonalBackups(this.db.backups, this.objects);
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
      this.actions[operation] = (a, d, p) => groups.operate(a, operation, d, p);
    for (const operation of groupMediaOperations)
      this.actions[operation] = (a, d) => {
        if (!this.groupMedia)
          throw new AccountError(503, 'Media storage unavailable.');
        return this.groupMedia.operate(a, operation, d);
      };
  }
  private installStatusOperations(): void {
    for (const operation of statusOperations)
      this.actions[operation] = (a, d) => {
        if (!this.statuses)
          throw new AccountError(503, 'Status storage unavailable.');
        return this.statuses.operate(a, operation, d);
      };
  }
  async preflightSocialAttachment(
    session: AccountSession,
    id: unknown,
  ): Promise<void> {
    const current = await this.devices.current(session.accountId);
    if (!current) throw new AccountError(403, 'Device not authorized.');
    await this.social.preflight({ session, directory: current.head }, uuid(id));
  }
  async preflightAttachment(
    session: AccountSession,
    id: unknown,
  ): Promise<void> {
    const current = await this.devices.current(session.accountId);
    if (!current) throw new AccountError(403, 'Device not authorized.');
    await this.db.attachments.preflight(
      { session, directory: current.head },
      uuid(id),
    );
  }
  liveCurrent(session: AccountSession, head: string): Promise<boolean> {
    return this.authority.liveCurrent(session, head);
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action) throw new AccountError(404, 'Message operation unavailable.');
    const { proof, current } = await this.authenticate(
      operation,
      session,
      input,
    );
    this.authority.checkDeletionRevision(operation, proof, current.revision);
    const result = await action(
      { session, directory: proof.directory },
      proof.payload,
      proof,
    );
    return result === undefined ? { status: 'saved' } : result;
  }
  authenticate(operation: string, session: AccountSession, input: unknown) {
    return this.authority.authenticate(operation, session, input);
  }
}
