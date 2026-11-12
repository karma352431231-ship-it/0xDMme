import { networkAvailable } from '../connectivity/index.ts';
export type { AcceptedDmMedia, DmMediaAccepted } from './accepted-media.ts';
import { SocialListReads } from './list-reads.ts';
import type { DmMediaAccepted } from './accepted-media.ts';
import type { ViewOnceMediaBuffer } from '../view-once-media-buffer/index.ts';
import {
  timedLoad,
  chatSyncActive,
  measureSend,
  traceSend,
  traceHandleDelivery,
  traceHandleSend,
  traceHandleList,
} from '../chat-sync-diagnostics/index.ts';
import type {
  HandleDeliveryPoint,
  LoadTrace,
} from '../chat-sync-diagnostics/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { SocialTextOutbox } from './text-outbox.ts';
import { decryptViewOnce } from '../view-once/index.ts';
import type { ViewOnceMetadata } from '../view-once/index.ts';
import { messageApi as privateMessageApi } from '../message-api/index.ts';
import type { PublicTextSendOptions } from './text-outbox.ts';
import { transmitSocialText } from './text-transmission.ts';
import type { TextDraft } from '../text-send/index.ts';
import type { SocialContext } from './crypto-context.ts';
export type { SocialContext } from './crypto-context.ts';
import {
  rememberDmDeletion,
  filterDeletedDmRoots,
  filterDeletedDmResults,
} from './deletions.ts';
import {
  dmDeletionPacket,
  verifyDmDeletion,
} from '../../shared/dm-deletion/index.ts';
import { messageBody } from '../../shared/messages/index.ts';
import { optionalSentAt } from '../../shared/message-presentation/index.ts';
import {
  decodeDailyText,
  encodeDailyText,
  validReaction,
} from '../../shared/daily/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { projectDmMessages } from './presentation.ts';
import {
  DmHistorySynchronization,
  confirmDmHistory,
  readDmHistorySnapshot,
} from './history-sync.ts';
import type { DmHistorySnapshot } from './history-sync.ts';
import { WorkInterruption } from '../synchronization-work/index.ts';
import { readDmDirectoryPreviews } from './directory-previews.ts';
import { dmUnreadCursors, dmUnreadCount, markDmRead } from './unread.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { relatedDmHistory } from '../local-history/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { prepareMessageRuntime } from '../message-runtime/index.ts';
import { dmMessageStates } from './read-receipts.ts';
import {
  AccountError,
  base64,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { newSecret } from '../device-keys/index.ts';
import { exclusive } from '../device-storage/index.ts';
import { messageApi } from '../message-api/index.ts';
import { MessageCrypto, PrivateAudiences } from '../message-crypto/index.ts';
import {
  ensureMessageRecovery,
  openRecoveryKey,
  openRoomKey,
} from '../message-recovery/index.ts';
import {
  localGet,
  localDelete,
  localPut,
  openLocal,
  sealLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import { openMessageMachine } from '../message-session/index.ts';
import {
  stageAttachment,
  uploadAttachments,
  forgetAttachment,
  downloadSealedAttachment,
  retainAttachment,
  openStoredAttachment,
} from '../attachments/index.ts';
import type { PrivateFile } from '../../shared/attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import {
  socialAttachment,
  socialMedia,
  checkSocialBytes,
} from '../../shared/social-media/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
import {
  cacheDmRecord,
  dmConversationHistory,
  dmHistoryPeers,
  searchDmHistory,
  historyRecord,
} from '../local-history/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { RemovalIndex } from '../personal-removals/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import {
  socialDirectory,
  socialPacket,
  socialPage,
  socialRelation,
  socialRevision,
} from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
  SigningAuthority,
} from '../vault-authority/index.ts';
import { withSigner } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import {
  readSocialDirectory,
  socialAuthority,
  pinSocialHistory,
} from './authority.ts';
import type { SocialApi, SocialDirectoryPage } from './authority.ts';

/** The server's readiness rule: a directory exists and lists only active devices. */
export function devicesCurrent(directory: SocialDirectoryPage): boolean {
  const current = directory.events.at(-1);
  if (!current) return false;
  return current.devices.every((device) =>
    Boolean(directory.active?.includes(device.id)),
  );
}
export function dmMediaScope(account: string): string {
  return `dm-media:${account}`;
}
export class SocialDms {
  composeViewOnce(
    peer: string,
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    return this.texts.queueViewOnce(peer, text, selection);
  }
  async openViewOnce(
    peer: string,
    id: string,
    metadata: ViewOnceMetadata,
    work: {
      signal: AbortSignal;
      diagnostic?: LoadTrace | undefined;
      media?: ViewOnceMediaBuffer | undefined;
    },
  ) {
    const { signal, diagnostic } = work;
    const generation = this.generation;
    const guard = () => {
      this.guard(generation);
      signal.throwIfAborted();
    };
    const delivery = await timedLoad(diagnostic, 'download', () =>
      withSigner(this.access, async (a) => {
        guard();
        const dmApi = this.privateApi(a, generation);
        const input = { scope: 'public', peer, id, hash: metadata.hash };
        const api = (operation: string, payload: Record<string, unknown>) =>
          privateMessageApi(a, operation, payload, {
            guard,
            signal,
          });
        const status = object(await api('view-once-status', input));
        if (status['consumed'])
          throw new AccountError(
            410,
            'This view-once message was already opened.',
          );
        const key = recoveryKey(
          await dmApi('recovery-key', { id: status['keyId'] }),
        );
        return { key, response: await api('view-once-open', input) };
      }),
    );
    guard();
    return this.identityTurn(
      async (context) => {
        guard();
        const content = await timedLoad(diagnostic, 'decrypt', () =>
          decryptViewOnce({
            authority: context.authority,
            recovery: delivery.key,
            id,
            scope: 'public',
            peer,
            metadata,
            response: delivery.response,
            diagnostic,
            media: work.media,
          }),
        );
        guard();
        return content;
      },
      { priority: 'interactive' },
    );
  }
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private generation = 0;
  private readonly history = new DmHistorySynchronization();
  private confirmedHistory: DmHistorySnapshot | null = null;
  private session: AccountSession | null = null;
  private readonly removals = new RemovalIndex();
  private machine: MessageCrypto | null = null;
  private readonly audiences = new PrivateAudiences();
  private readonly texts: SocialTextOutbox;
  private readonly lists = new SocialListReads();
  private secretReady: { profile: string; secret: string } | null = null;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.sync = sync;
    this.texts = new SocialTextOutbox({
      access,
      lifetime: {
        current: () => this.generation,
        guard: (generation) => this.guard(generation),
        locator: () => this.localLocator(),
      },
      crypto: (work, options) => this.cryptoTurn(work, options, false),
    });
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId &&
      session?.csrf === this.session?.csrf
    )
      return;
    this.generation++;
    this.lists.clear();
    this.session = session;
    this.removals.reset();
    this.secretReady = null;
    this.audiences.clear();
    this.history.reset();
    this.confirmedHistory = null;
    this.close();
  }
  cancel(): void {
    this.generation++;
    this.lists.clear();
    this.secretReady = null;
    this.audiences.clear();
    this.history.reset();
    this.confirmedHistory = null;
    this.close();
  }
  close(): void {
    this.machine?.close();
    this.machine = null;
  }
  private guard(generation: number): void {
    if (generation !== this.generation || !this.session)
      throw new WorkInterruption('session');
  }
  private localLocator(): { accountId: string; deviceId: string } {
    if (!this.session) throw new WorkInterruption('session');
    const { accountId, deviceId } = this.session;
    return { accountId, deviceId };
  }
  private localWork<T>(
    generation: number,
    work: (a: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    this.guard(generation);
    return this.access.withLocalVault(this.localLocator(), async (a) => {
      this.guard(generation);
      const result = await work(a);
      this.guard(generation);
      return result;
    });
  }
  private privateApi(
    authority: SigningAuthority,
    generation: number,
  ): SocialApi {
    if (
      authority.session.accountId !== this.session?.accountId ||
      authority.session.deviceId !== this.session.deviceId
    )
      throw new Error('Authority belongs to another account or device.');
    return (operation, payload) => {
      // A relationship/device mutation starts a new list snapshot even when a
      // previous read has not settled. Publications do not change this list.
      const changesList = [
        'block',
        'request',
        'open',
        'decide',
        'register',
      ].includes(operation);
      if (changesList) this.lists.clear();
      const work = messageApi(authority, `dm-${operation}`, payload, () =>
        this.guard(generation),
      );
      return changesList
        ? work.finally(() => {
            if (generation === this.generation) this.lists.clear();
          })
        : work;
    };
  }
  async request(
    operation: string,
    payload: Record<string, unknown>,
    options: VaultWorkOptions = {},
  ): Promise<unknown> {
    const generation = this.generation;
    this.guard(generation);
    return this.access.withVault(
      false,
      (authority) => this.privateApi(authority, generation)(operation, payload),
      {
        ...options,
        diagnosticOperation: options.diagnosticOperation ?? 'handle-request',
      },
    );
  }
  async list(after: string | null, options: VaultWorkOptions = {}) {
    const generation = this.generation;
    this.guard(generation);
    const page = await this.lists.read({
      after,
      options,
      load: async () =>
        socialPage(await this.request('list', { after }, options)),
      observed: (shared) =>
        traceHandleList(options.handleListCaller ?? 'unspecified', shared),
    });
    this.guard(generation);
    return page;
  }
  async state(
    peer: string,
    options: VaultWorkOptions = {},
  ): Promise<SocialRelation | null> {
    const value = await this.request('state', { peer }, options);
    return value === null ? null : socialRelation(value);
  }
  /**
   * Others can write to this profile only while its published DM devices are
   * current (the server refuses senders otherwise). Publishes them when they
   * are missing or stale; when current, this costs one directory read.
   */
  async publishDevices(options: VaultWorkOptions = {}): Promise<void> {
    const directory = await readSocialDirectory(
      (operation, data) => this.request(operation, data, options),
      null,
    );
    if (devicesCurrent(directory)) return;
    await this.initialize(options);
  }
  async initialize(options: VaultWorkOptions = {}): Promise<string> {
    return this.withCrypto(
      ({ authority }) => Promise.resolve(authority.session.accountId),
      options,
    );
  }
  private async secret(
    directory: SocialDirectoryPage,
    generation: number,
    options: VaultWorkOptions,
  ): Promise<string> {
    const wrapped = await this.request('secret-get', {}, options);
    if (wrapped !== null)
      return this.access.withVault(
        false,
        (a) => this.openSecret(a, wrapped),
        options,
      );
    const restored = await this.access.withVault(
      false,
      (a) => historyRecord(a, 'dm-identity', directory.profile),
      options,
    );
    if (restored?.type === 'dm-identity') {
      const recovered = await this.access.withVault(
        false,
        (a) => this.openSecret(a, JSON.parse(restored.value) as unknown),
        options,
      );
      return this.preserveSecret(recovered, options);
    }
    const deadline = Date.now() + 60_000;
    do {
      if (Date.now() > deadline)
        throw new Error('DM vault synchronization did not finish.');
      await this.sync.refresh(options);
      this.guard(generation);
    } while (!this.sync.complete);
    const entries = [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'contact' &&
          e.change.entity === directory.profile &&
          e.change.label === 'Recuperação das DMs pelo @',
      );
    if (entries.length > 1)
      throw new Error(
        'DM recovery has concurrent versions. Preserve copies before resolving.',
      );
    if (entries[0]) {
      const data = object(
        JSON.parse(
          (await this.sync.openMany([entries[0].commit.id], options))[0]!,
        ) as unknown,
      );
      this.guard(generation);
      keys(data, ['secret']);
      if (base64(data['secret'], 32).length !== 32)
        throw new Error('Invalid DM secret.');
      return this.preserveSecret(data['secret'] as string, options);
    }
    if (directory.events.length)
      throw new Error(
        'DM secret missing from the vault. Restore your vault before continuing.',
      );
    const secret = newSecret();
    await this.sync.save(
      {
        change: {
          version: 1,
          entity: directory.profile,
          kind: 'contact',
          parents: [],
          label: 'Recuperação das DMs pelo @',
        },
        value: JSON.stringify({ secret }),
      },
      options,
    );
    this.guard(generation);
    return this.preserveSecret(secret, options);
  }
  private async openSecret(a: VaultAuthority, raw: unknown): Promise<string> {
    const d = object(raw),
      bytes = base64(d['ciphertext'], 2048);
    keys(d, ['id', 'epoch', 'hash', 'bytes', 'ciphertext']);
    const secret = await openLocal(a, {
      id: uuid(d['id']),
      epoch: socialRevision(d['epoch']),
      block: { hash: String(d['hash']), bytes: socialRevision(d['bytes']) },
      bytes: Uint8Array.from(bytes),
    });
    if (base64(secret, 32).length !== 32) throw new Error('Invalid DM secret.');
    return secret;
  }
  private async preserveSecret(
    secret: string,
    options: VaultWorkOptions,
  ): Promise<string> {
    const generation = this.generation;
    return this.access.withVault(
      false,
      async (a) => {
        const sealed = await sealLocal(a, crypto.randomUUID(), secret);
        const capsule = {
          id: sealed.id,
          epoch: sealed.epoch,
          hash: sealed.block.hash,
          bytes: sealed.block.bytes,
          ciphertext: encode(sealed.bytes),
        };
        const accepted = await this.privateApi(a, generation)('secret-save', {
          capsule,
        });
        return this.openSecret(a, accepted);
      },
      options,
    );
  }
  private async alias(
    privateAuthority: VaultAuthority,
    directory: SocialDirectoryPage,
  ): Promise<string> {
    if (directory.device) return directory.device;
    const scope = `${privateAuthority.session.accountId}:${privateAuthority.session.deviceId}`,
      name = `dm-alias:${directory.profile}`;
    const old = await localGet<LocalCipher>(scope, name);
    if (old) return uuid(await openLocal(privateAuthority, old));
    const alias = crypto.randomUUID(),
      row = await sealLocal(privateAuthority, crypto.randomUUID(), alias);
    await localPut(scope, name, row, row.bytes.length + 512);
    return alias;
  }
  withCrypto<T>(
    work: (input: SocialContext) => Promise<T>,
    options: VaultWorkOptions = {},
  ): Promise<T> {
    return this.cryptoTurn(work, options, true);
  }
  private async prepareSecret(
    generation: number,
    options: VaultWorkOptions,
  ): Promise<{ profile: string; secret: string }> {
    if (this.secretReady) return this.secretReady;
    const directory = await readSocialDirectory(
      (op, data) => this.request(op, data, options),
      null,
    );
    const secret = await this.secret(directory, generation, options);
    this.guard(generation);
    this.secretReady = { profile: directory.profile, secret };
    return this.secretReady;
  }
  private async cryptoTurn<T>(
    work: (input: SocialContext) => Promise<T>,
    options: VaultWorkOptions,
    receiveInbox: boolean,
  ): Promise<T> {
    const generation = this.generation;
    return this.identityTurn(async (context) => {
      const { authority, api } = context;
      this.close();
      const machine = await measureDmWork(this, 'dm/engine-open', () =>
        openMessageMachine(
          authority,
          (op, data) => api(op, data),
          this.audiences,
        ),
      );
      try {
        this.guard(generation);
        this.machine = machine;
        await measureDmWork(this, 'dm/engine-prepare', async () => {
          await ensureMessageRecovery(authority, api);
          await machine.prepare(authority);
        });
        traceHandleSend(options.handleSend, 'engine-ready');
        if (receiveInbox)
          await measureDmWork(this, 'dm/inbox', () =>
            receiveSocialInbox(api, machine),
          );
        return await work({
          ...context,
          machine,
          senderHistories: new Map(),
          sendPeers: new Map(),
        });
      } finally {
        machine.close();
        if (this.machine === machine) this.machine = null;
      }
    }, options);
  }
  /** View-once uses a recovery key, without opening or syncing the Olm store. */
  private async identityTurn<T>(
    work: (
      input: Pick<SocialContext, 'authority' | 'privateAuthority' | 'api'>,
    ) => Promise<T>,
    options: VaultWorkOptions,
  ): Promise<T> {
    const generation = this.generation;
    this.guard(generation);
    await measureDmWork(this, 'dm/runtime', prepareMessageRuntime);
    traceHandleSend(options.handleSend, 'runtime-ready');
    this.guard(generation);
    const prepared = await measureDmWork(this, 'dm/identity-secret', () =>
      this.prepareSecret(generation, options),
    );
    traceHandleSend(options.handleSend, 'identity-ready');
    traceHandleSend(options.handleSend, 'authority-request');
    return this.access.withVault(
      false,
      (privateAuthority) => {
        traceHandleSend(options.handleSend, 'authority-ready');
        return exclusive(`dm:${prepared.profile}`, async () => {
          traceHandleSend(options.handleSend, 'profile-ready');
          const api = this.privateApi(privateAuthority, generation);
          const current = await measureDmWork(this, 'dm/own-directory', () =>
            readSocialDirectory(api, null),
          );
          traceHandleSend(options.handleSend, 'own-directory-ready');
          if (current.profile !== prepared.profile) {
            this.lists.clear();
            this.secretReady = null;
            this.audiences.clear();
            throw new Error('DM identity changed during the operation.');
          }
          const authority = await socialAuthority({
            privateAuthority,
            directory: current,
            secret: prepared.secret,
            api,
            alias: await this.alias(privateAuthority, current),
          });
          traceHandleSend(options.handleSend, 'authority-assembled');
          this.guard(generation);
          return work({ authority, privateAuthority, api });
        });
      },
      {
        ...options,
        diagnosticOperation: options.diagnosticOperation ?? 'handle-crypto',
      },
    );
  }
  queueText(draft: TextDraft): Promise<void> {
    return this.texts.queueText(draft);
  }
  pendingTexts(peer: string): Promise<TextDraft[]> {
    return this.texts.pendingTexts(peer);
  }
  async sendPending(
    options: PublicTextSendOptions = {},
  ): Promise<{ more: boolean }> {
    const generation = this.generation;
    try {
      return await this.texts.sendPending(options);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 410) throw error;
      this.guard(generation);
      // A lost acceptance may have been personally removed. Only signed
      // removal receipts can retire its durable retry; 410 alone cannot.
      await this.access.withVault(
        false,
        async (a) => {
          this.guard(generation);
          await this.removals.load(a, () => this.guard(generation));
        },
        options,
      );
      this.guard(generation);
      return this.texts.sendPending(options);
    }
  }
  async send(
    peer: string,
    text: string,
    id: string,
    relation?: MessageRelation,
  ): Promise<void> {
    if (!text.trim() || new TextEncoder().encode(text).length > 3_000_000)
      throw new Error('Text empty or over the limit.');
    const name = relation
      ? `${relation.type === 'edit' ? 'dm-edit' : 'dm-react'}:${peer}:${relation.id}`
      : `dm-send:${peer}`;
    await this.cryptoTurn(
      async (context) => {
        const { authority, privateAuthority } = context;
        const scope = `${privateAuthority.session.accountId}:${privateAuthority.session.deviceId}`;
        const hash = await digest(
          canonical(
            relation
              ? [authority.session.accountId, peer, text, relation]
              : [authority.session.accountId, peer, text],
          ),
        );
        const old = await localGet<LocalCipher>(scope, name);
        const held = old
          ? object(
              JSON.parse(await openLocal(privateAuthority, old)) as unknown,
            )
          : null;
        if (held && held['hash'] !== hash)
          throw new Error(
            'A send is pending with different text. Resume the original text before sending a change.',
          );
        const packet = held ? socialPacket(held['packet']) : null;
        const message = packet?.id ?? id;
        markHandleSend(message, 'submit', relation);
        await transmitSocialText(context, {
          id: message,
          peer,
          text,
          packet,
          ...(relation ? { relation } : {}),
          preserve: async (packet) => {
            const row = await sealLocal(
              privateAuthority,
              crypto.randomUUID(),
              JSON.stringify({ hash, packet, text }),
            );
            await localPut(scope, name, row, row.bytes.length + 512);
          },
        });
        markHandleSend(message, 'accepted', relation);
        await localDelete(scope, name);
      },
      { priority: 'interactive' },
      false,
    );
  }
  async remove(
    peer: string,
    item: Extract<BackupRecord, { type: 'dm-message' }>,
  ): Promise<void> {
    if (!item.own || item.relation) throw new Error('Own message unavailable.');
    await this.withCrypto(
      async ({ authority, api }) => {
        const payload = {
          id: item.id,
          hash: item.hash,
          recipient: peer,
          revision: authority.events.length,
        };
        const proof = {
          deviceId: authority.session.deviceId,
          directory: authority.directory,
          payload,
        };
        await api('delete', {
          proof: {
            ...proof,
            signature: await authority.sign(
              messageBody(
                authority.session.accountId,
                proof.deviceId,
                'dm-delete',
                proof,
              ),
            ),
          },
        });
      },
      { priority: 'interactive' },
    );
  }
  async pending(
    peer: string,
    options: VaultWorkOptions = {},
  ): Promise<{ id: string; text: string } | null> {
    const generation = this.generation;
    this.guard(generation);
    return this.access.withVault(
      false,
      async (authority) => {
        this.privateApi(authority, generation);
        const scope = `${authority.session.accountId}:${authority.session.deviceId}`,
          row = await localGet<LocalCipher>(scope, `dm-send:${peer}`);
        if (!row) return null;
        const held = object(
            JSON.parse(await openLocal(authority, row)) as unknown,
          ),
          packet = socialPacket(held['packet']);
        this.guard(generation);
        if (typeof held['text'] !== 'string' || packet.recipient !== peer)
          throw new Error('Invalid DM draft.');
        return { id: packet.id, text: held['text'] };
      },
      options,
    );
  }
  async identityRecord(
    profile: string,
  ): Promise<Extract<BackupRecord, { type: 'dm-identity' }> | null> {
    const wrapped = await this.request('secret-get', {});
    if (wrapped === null) return null;
    await this.access.withVault(false, (a) => this.openSecret(a, wrapped));
    const value = JSON.stringify(wrapped);
    return {
      type: 'dm-identity',
      id: profile,
      hash: await bytesHash(new TextEncoder().encode(value)),
      value,
    };
  }
  async historyPage(
    snapshot: unknown,
    after: number,
    options: VaultWorkOptions = {},
    projection?: { peer: string; before: number | null },
  ) {
    const generation = this.generation;
    return this.withCrypto(async (context) => {
      const raw = personalPage(
        await context.api('personal-page', {
          snapshot,
          after,
          actions: true,
          edits: true,
          deletions: true,
        }),
      );
      markDownloaded(context, raw['items'], options);
      const profiles = new Map(
        raw['profiles'].map((value) => {
          const p = publicProfile(value);
          return [p.id, p];
        }),
      );
      const result: Extract<BackupRecord, { type: 'dm-message' }>[] = [];
      const unavailable: string[] = [];
      for (const value of raw['items']) {
        const item = object(value),
          id = uuid(item['id']);
        if (await this.applyDeletion(context, item)) continue;
        if (item['packet'] === undefined) {
          unavailable.push(t('dm-message:{0} unavailable', [id]));
          continue;
        }
        const packet = socialPacket(item['packet']);
        if (packet.id !== id)
          throw new Error('Historical message belongs to another DM.');
        const peer = profiles.get(
          packet.sender === context.authority.session.accountId
            ? packet.recipient
            : packet.sender,
        );
        if (!peer) throw new Error('Historical public DM profile missing.');
        traceIncomingHandle(context, packet, 'downloaded', options);
        traceIncomingHandle(context, packet, 'processing-start', options);
        const record = await this.decode(context, {
          packet,
          hash: String(item['hash']),
          sequence: socialRevision(item['sequence']),
          peer,
          recovery: raw['recovery'],
        });
        traceIncomingHandle(context, packet, 'verified', options);
        await cacheDmRecord(context.privateAuthority, record);
        traceIncomingHandle(context, packet, 'stored', options);
        traceIncomingHandle(context, packet, 'processing-end', options);
        result.push(record);
      }
      if (result.length)
        await context.api('received', {
          items: result.map((row) => ({ id: row.id, hash: row.hash })),
        });
      return this.finishHistoryPage(
        { api: context.api, authority: context.privateAuthority },
        {
          snapshot,
          projection,
          generation,
          result: {
            items: result,
            unavailable,
            next: raw['next'] === null ? null : socialRevision(raw['next']),
          },
        },
      );
    }, options);
  }
  /** Final confirmation and local assembly share this already-authorized turn.
   * The candidate does not become presentable until the history owner confirms
   * the same snapshot and saves its cursor successfully. */
  private async finishHistoryPage(
    context: { api: SocialApi; authority: VaultAuthority },
    input: {
      snapshot: unknown;
      generation: number;
      projection: { peer: string; before: number | null } | undefined;
      result: {
        items: Extract<BackupRecord, { type: 'dm-message' }>[];
        unavailable: string[];
        next: number | null;
      };
    },
  ) {
    if (!input.projection) return { ...input.result, pageCandidate: undefined };
    const expected = readDmHistorySnapshot(input.snapshot);
    if (input.result.next !== null && input.result.next < expected.anchor)
      return { ...input.result, pageCandidate: undefined };
    const confirmation = await measureDmWork(this, 'dm/history-confirm', () =>
      context.api('personal-snapshot', {}),
    );
    confirmDmHistory(expected, confirmation);
    const generation = input.generation;
    await this.removals.load(context.authority, () => this.guard(generation));
    const projection = input.projection;
    const pageCandidate = await measureDmWork(this, 'dm/history-cache', () =>
      this.cachedPage({
        a: context.authority,
        ...projection,
        generation,
        maximum: 16,
      }),
    );
    this.guard(generation);
    return { ...input.result, confirmation, pageCandidate };
  }
  private async applyDeletion(
    context: SocialContext,
    item: Record<string, unknown>,
  ): Promise<boolean> {
    if (item['deletion'] === undefined) return false;
    const deletion = dmDeletionPacket(item['deletion']);
    if (
      deletion.id !== item['id'] ||
      deletion.hash !== item['hash'] ||
      ![deletion.sender, deletion.recipient].includes(
        context.authority.session.accountId,
      )
    )
      throw new Error('Deletion belongs to another message.');
    const events = await this.senderHistory(context, {
      id: deletion.id,
      sender: deletion.sender,
      senderRevision: deletion.senderRevision,
    });
    await verifyDmDeletion(deletion, events);
    await rememberDmDeletion(context.privateAuthority, deletion);
    return true;
  }
  private async decode(
    context: SocialContext,
    input: {
      packet: ReturnType<typeof socialPacket>;
      hash: string;
      sequence: number;
      peer: ReturnType<typeof publicProfile>;
      recovery: unknown[];
    },
  ): Promise<Extract<BackupRecord, { type: 'dm-message' }>> {
    const { packet } = input;
    if (
      (await digest(canonical(packet))) !== input.hash ||
      ![packet.sender, packet.recipient].includes(
        context.authority.session.accountId,
      )
    )
      throw new Error('DM tampered with or from another context.');
    const archive = packet.archives.find(
      (a) => a.accountId === context.authority.session.accountId,
    );
    if (!archive) throw new Error('DM recovery missing.');
    const events = await this.senderHistory(context, packet);
    const event = events[packet.senderRevision - 1];
    if (!event) throw new Error('Historical DM authority missing.');
    const raw =
      input.recovery.find((value) => object(value)['id'] === archive.keyId) ??
      (await context.api('recovery-key', { id: archive.keyId }));
    const key = await openRecoveryKey(raw, context.authority);
    try {
      traceIncomingHandle(context, packet, 'decrypt-start');
      const content = await context.machine.decryptContent({
        packet,
        senderEvent: event,
        exported: openRoomKey(key, archive),
      });
      traceIncomingHandle(context, packet, 'decrypted');
      const text = content.text;
      if (packet.socialMedia)
        socialAttachment(JSON.parse(text) as unknown, packet.socialMedia);
      return {
        type: 'dm-message',
        id: packet.id,
        hash: input.hash,
        self: context.authority.session.accountId,
        peer: input.peer,
        sequence: input.sequence,
        own: packet.sender === context.authority.session.accountId,
        kind: packet.kind === 'attachment' ? 'attachment' : 'text',
        media: packet.socialMedia ?? null,
        text,
        ...optionalSentAt(content.sentAt),
        ...(packet.relation ? { relation: packet.relation } : {}),
      };
    } finally {
      key.free();
    }
  }
  private senderHistory(
    context: SocialContext,
    packet: Pick<
      ReturnType<typeof socialPacket>,
      'id' | 'sender' | 'senderRevision'
    >,
  ) {
    if (packet.sender === context.authority.session.accountId)
      return Promise.resolve(context.authority.events);
    const identity = `${packet.sender}:${packet.senderRevision}`;
    const held = context.senderHistories.get(identity);
    return held
      ? Promise.resolve(held)
      : this.readSenderHistory(context, packet);
  }
  private async readSenderHistory(
    context: SocialContext,
    packet: Pick<
      ReturnType<typeof socialPacket>,
      'id' | 'sender' | 'senderRevision'
    >,
  ) {
    const identity = `${packet.sender}:${packet.senderRevision}`;
    const events = [];

    for (let page = 0; page < 16; page++) {
      const row = object(
        await context.api('message-history', {
          message: packet.id,
          after: events.length,
        }),
      );
      if (!Array.isArray(row['events']) || row['events'].length > 8)
        throw new Error('Invalid DM identity history.');
      events.push(...row['events'].map(socialDirectory));
      if (events.length === row['through']) break;
      if (!row['events'].length || page === 15)
        throw new Error('DM identity history incomplete.');
    }
    if (events.length !== packet.senderRevision)
      throw new Error('Historical DM authority does not match the message.');
    await pinSocialHistory(packet.sender, events);
    context.senderHistories.set(identity, events);
    while (context.senderHistories.size > 32)
      context.senderHistories.delete(
        context.senderHistories.keys().next().value!,
      );
    return events;
  }
  async react(
    peer: string,
    target: Extract<BackupRecord, { type: 'dm-message' }>,
    reaction: string,
  ): Promise<void> {
    if (!validReaction(reaction) || target.relation || target.peer.id !== peer)
      throw new Error('Invalid message reaction.');
    await this.send(
      peer,
      encodeDailyText({ text: reaction, reply: null, forwarded: false }),
      crypto.randomUUID(),
      {
        id: target.id,
        hash: target.hash,
        author: target.own ? target.self : target.peer.id,
        type: 'reaction',
      },
    );
  }
  async edit(
    peer: string,
    target: Extract<BackupRecord, { type: 'dm-message' }>,
    text: string,
  ): Promise<void> {
    if (!text.trim()) throw new Error('Text empty or over the limit.');
    if (
      !target.own ||
      target.kind !== 'text' ||
      target.relation ||
      target.peer.id !== peer
    )
      throw new Error('Edit by another author.');
    const content = decodeDailyText(target.text);
    await this.send(
      peer,
      encodeDailyText({ ...content, text }),
      crypto.randomUUID(),
      {
        id: target.id,
        hash: target.hash,
        author: target.self,
        type: 'edit',
      },
    );
  }
  async messageStates(
    input: { peer: string; read: string[]; own: string[] },
    options: VaultWorkOptions = {},
  ) {
    return dmMessageStates(
      await this.request('message-status', input, options),
    );
  }
  async unread(peers: readonly string[]): Promise<number> {
    const generation = this.generation;
    return this.access.withVault(false, async (a) => {
      const cursors = await dmUnreadCursors({
        a,
        peers,
        guard: () => this.guard(generation),
      });
      const count = dmUnreadCount(
        await this.privateApi(a, generation)('unread', { peers }),
        cursors,
      );
      this.guard(generation);
      return count;
    });
  }
  async markRead(
    peer: string,
    sequence: number,
    options: VaultWorkOptions = {},
  ): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(
      true,
      (a) =>
        markDmRead({
          a,
          peer,
          sequence,
          guard: () => this.guard(generation),
        }),
      options,
    );
  }
  async read(
    peer: string,
    before: number | null,
    options: VaultWorkOptions = {},
  ) {
    const confirmed = await measureDmWork(this, 'dm/history-sync', () =>
      this.synchronizeHistory(options, { peer, before }),
    );
    if (confirmed.page) return confirmed.page;
    return measureDmWork(this, 'dm/history-cache', () =>
      this.cached(peer, before, options),
    );
  }
  async receive(): Promise<void> {
    await this.synchronizeHistory();
  }
  private async synchronizeHistory(
    options: VaultWorkOptions = {},
    projection?: { peer: string; before: number | null },
  ) {
    const generation = this.generation;
    let snapshot: DmHistorySnapshot | null = null;
    let page: Awaited<ReturnType<SocialDms['cached']>> | undefined;
    if (networkAvailable()) {
      snapshot = await this.history.run({
        snapshot: () => this.request('personal-snapshot', {}, options),
        guard: () => this.guard(generation),
        page: async (snapshot, after) => {
          const result = await this.historyPage(
            snapshot,
            after,
            options,
            projection,
          );
          page = result.pageCandidate;
          return result;
        },
        cursor: () =>
          this.localWork(generation, async (a) => {
            const held = await localGet<LocalCipher>(
              `${a.session.accountId}:${a.session.deviceId}`,
              'dm-sync-state',
            );
            return held
              ? (JSON.parse(await openLocal(a, held)) as unknown)
              : null;
          }),
        save: (cursor) =>
          this.localWork(generation, async (a) => {
            const row = await sealLocal(
              a,
              crypto.randomUUID(),
              JSON.stringify(cursor),
            );
            this.guard(generation);
            await localPut(
              `${a.session.accountId}:${a.session.deviceId}`,
              'dm-sync-state',
              row,
              row.bytes.length + 512,
            );
          }),
      });
    }
    this.guard(generation);
    this.confirmedHistory = snapshot;
    return { snapshot, page };
  }
  async directoryPreviews(
    peers: readonly string[],
    options: { afterReceive?: boolean } = {},
  ): Promise<Map<string, ConversationPreview>> {
    if (!peers.length) return new Map();
    const generation = this.generation;
    const snapshot = networkAvailable()
      ? ((options.afterReceive ? this.confirmedHistory : null) ??
        (await this.synchronizeHistory()).snapshot)
      : null;
    return this.access.withVault(true, async (a) => {
      await this.removals.load(a, () => this.guard(generation));
      const previews = await readDmDirectoryPreviews({
        peers,
        cached: (peer, before) =>
          this.cachedPage({ a, peer, before, generation, maximum: 1 }),
        guard: () => this.guard(generation),
        states: async (own) =>
          networkAvailable() && own.length
            ? dmMessageStates(
                await this.privateApi(a, generation)('preview-status', { own }),
              )
            : [],
      });
      if (snapshot !== null)
        confirmDmHistory(
          snapshot,
          await this.privateApi(a, generation)('personal-snapshot', {}),
        );
      this.guard(generation);
      return previews;
    });
  }
  async search(query: string, after: string | null) {
    const generation = this.generation;
    return this.access.withVault(true, async (a) => {
      const result = await searchDmHistory(a, query, after, () =>
        this.guard(generation),
      );
      return {
        ...result,
        items: await filterDeletedDmResults(a, result.items),
      };
    });
  }
  async copies(after: string | null) {
    const generation = this.generation;
    return this.access.withVault(true, async (a) => {
      const page = await dmHistoryPeers(a, after);
      this.guard(generation);
      return page;
    });
  }
  async cached(
    peer: string,
    before: number | null,
    options: VaultWorkOptions = {},
  ) {
    const generation = this.generation;
    return this.access.withVault(
      true,
      async (a) => {
        await this.removals.load(a, () => this.guard(generation));
        return this.cachedPage({ a, peer, before, generation, maximum: 16 });
      },
      options,
    );
  }
  private async cachedPage(input: {
    a: VaultAuthority;
    peer: string;
    before: number | null;
    generation: number;
    maximum: 1 | 16;
  }) {
    const { a, peer, before, generation, maximum } = input;
    const liveSource = await bytesHash(
      new TextEncoder().encode(`0xdmme-dm-cache:${a.session.accountId}`),
    );
    const items = await dmConversationHistory(a, peer, before, {
      maximum,
      visible: (id, source) =>
        source !== liveSource || !this.removals.has('dm-message', id),
    });
    this.guard(generation);
    const actions = await relatedDmHistory(
      a,
      items.map((row) => row.id),
      () => this.guard(generation),
      (id, source) =>
        source !== liveSource || !this.removals.has('dm-message', id),
    );
    this.guard(generation);
    const visible = [...items, ...actions];
    const roots = await filterDeletedDmRoots(
      a,
      visible.filter((row) => !row.relation),
    );
    return {
      items: projectDmMessages(
        roots,
        visible.filter((row) => row.relation),
        (id) => this.removals.has('dm-message', id),
      ),
      reactionReads: visible
        .filter(
          (row) =>
            row.relation &&
            !row.own &&
            !this.removals.has('dm-message', row.id) &&
            !this.removals.has('dm-message', row.relation.id),
        )
        .map((row) => row.id),
      next: items.length === 16 ? (items[0]?.sequence ?? null) : null,
      self: items[0]?.self ?? '',
    };
  }
  async stageMedia(
    peer: string,
    selection: AttachmentSelection,
    media: SocialMedia,
    caption: string,
  ): Promise<void> {
    const generation = this.generation;
    const id = crypto.randomUUID();
    markHandleSend(id, 'submit');
    await this.access.withVault(
      false,
      async (a) => {
        const scope = dmMediaScope(a.session.accountId);
        if (
          await localGet(
            `${a.session.accountId}:${a.session.deviceId}`,
            `dm-media-draft:${peer}`,
          )
        )
          throw new Error(
            'Media pending. Send or cancel it before choosing more.',
          );
        await localPut(scope, `outbox:${id}`, { pending: true }, 512);
        try {
          const content = await measureSend(
            'attachment-stage',
            () =>
              stageAttachment({
                account: scope,
                id,
                selection,
                caption,
              }),
            id,
          );
          socialAttachment(content, media);
          checkSocialBytes(content, media, selection.bytes);
          this.guard(generation);
          const row = await sealLocal(
            a,
            crypto.randomUUID(),
            JSON.stringify({ text: JSON.stringify(content), media, id }),
          );
          await localPut(
            `${a.session.accountId}:${a.session.deviceId}`,
            `dm-media-draft:${peer}`,
            row,
            row.bytes.length + 512,
          );
        } catch (error: unknown) {
          await forgetAttachment(scope, id);
          await localDelete(scope, `outbox:${id}`);
          await localDelete(
            `${a.session.accountId}:${a.session.deviceId}`,
            `dm-media-draft:${peer}`,
          );
          throw error;
        }
      },
      { diagnosticOperation: 'handle-media-stage' },
    );
  }
  async sendMedia(peer: string, accepted?: DmMediaAccepted): Promise<void> {
    await this.withCrypto(
      async (context) => {
        const { privateAuthority: a, api, authority, machine } = context,
          scope = `${a.session.accountId}:${a.session.deviceId}`;
        const row = await localGet<LocalCipher>(
          scope,
          `dm-media-draft:${peer}`,
        );
        if (!row) throw new Error('Choose media to send.');
        const draft = object(JSON.parse(await openLocal(a, row)) as unknown),
          media = socialMedia(draft['media']),
          id = uuid(draft['id']),
          text = String(draft['text']),
          content = socialAttachment(JSON.parse(text) as unknown, media);
        markHandleSend(id, 'submit');
        let packet =
          draft['packet'] === undefined ? null : socialPacket(draft['packet']);
        if (
          packet &&
          (await api('accepted', { id, hash: await digest(canonical(packet)) }))
        ) {
          markHandleSend(id, 'accepted');
          accepted?.({ id, peer, media, content });
          await localDelete(scope, `dm-media-draft:${peer}`);
          await localDelete(dmMediaScope(a.session.accountId), `outbox:${id}`);
          return;
        }
        await measureSend(
          'upload',
          () =>
            uploadAttachments({
              account: dmMediaScope(a.session.accountId),
              message: id,
              peer,
              content,
              api: (op, data) =>
                api(op, {
                  ...data,
                  ...(op === 'attachment-reserve' ? { media } : {}),
                }),
            }),
          id,
        );
        const recipient = await measureSend(
          'recipient-verify',
          () => readSocialDirectory(api, peer),
          id,
        );
        if (
          !packet ||
          packet.senderRevision !== authority.events.length ||
          packet.recipientRevision !== recipient.events.length
        ) {
          const recovery = await api('recovery-peer', { accountId: peer });
          packet = await machine.encrypt({
            authority,
            peerHistory: recipient.events,
            recovery: [
              await ensureMessageRecovery(authority, api),
              recoveryKey(recovery),
            ],
            id,
            text,
            kind: 'attachment',
            socialMedia: media,
          });
          const held = await sealLocal(
            a,
            crypto.randomUUID(),
            JSON.stringify({ ...draft, packet }),
          );
          await localPut(
            scope,
            `dm-media-draft:${peer}`,
            held,
            held.bytes.length + 512,
          );
        }
        await measureSend(
          'server-publish',
          () => api('publish', { packet }),
          id,
        );
        markHandleSend(id, 'accepted');
        accepted?.({ id, peer, media, content });
        await localDelete(scope, `dm-media-draft:${peer}`);
        await localDelete(dmMediaScope(a.session.accountId), `outbox:${id}`);
      },
      { priority: 'interactive' },
    );
  }
  async cancelMedia(peer: string): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(false, async (a) => {
      const scope = `${a.session.accountId}:${a.session.deviceId}`,
        row = await localGet<LocalCipher>(scope, `dm-media-draft:${peer}`);
      if (!row) return;
      const held = object(JSON.parse(await openLocal(a, row)) as unknown),
        id = uuid(held['id']);
      await this.privateApi(a, generation)('attachment-cancel', {
        message: id,
      });
      await forgetAttachment(dmMediaScope(a.session.accountId), id);
      await localDelete(dmMediaScope(a.session.accountId), `outbox:${id}`);
      await localDelete(scope, `dm-media-draft:${peer}`);
    });
  }
  async mediaDraft(peer: string): Promise<boolean> {
    return this.localWork(this.generation, async (a) =>
      Boolean(
        await localGet(
          `${a.session.accountId}:${a.session.deviceId}`,
          `dm-media-draft:${peer}`,
        ),
      ),
    );
  }
  async media(
    row: Extract<BackupRecord, { type: 'dm-message' }>,
    thumbnail: boolean,
    sealed = false,
    localOnly = false,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!row.media) throw new Error('Message has no media.');
    const content = socialAttachment(
        JSON.parse(row.text) as unknown,
        row.media,
      ),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Thumbnail missing.');
    const generation = this.generation;
    return this.access.withVault(
      localOnly || !networkAvailable(),
      async (a) => {
        const bytes = await this.mediaCipher(a, {
          row,
          file,
          thumbnail,
          image: content.image && row.media !== 'gif',
          generation,
        });
        this.guard(generation);
        if (sealed) return Uint8Array.from(bytes);
        const plain = await openStoredAttachment(
          file,
          Uint8Array.from(bytes),
          thumbnail,
          content.image && row.media !== 'gif',
        );
        try {
          this.guard(generation);
          if (!thumbnail) checkSocialBytes(content, row.media!, plain);
          return plain;
        } catch (error: unknown) {
          plain.fill(0);
          throw error;
        }
      },
    );
  }
  private async mediaCipher(
    a: VaultAuthority,
    input: {
      row: Extract<BackupRecord, { type: 'dm-message' }>;
      file: PrivateFile;
      thumbnail: boolean;
      image: boolean;
      generation: number;
    },
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { row, file, thumbnail } = input,
      imported = await historyRecord(a, 'dm-media', file.ref.id);
    if (imported?.type === 'dm-media') {
      if (
        imported.self !== row.self ||
        imported.message !== row.id ||
        imported.hash !== file.ref.hash ||
        imported.thumbnail !== thumbnail
      )
        throw new Error('Imported media belongs to another DM.');
      return Uint8Array.from(base64(imported.bytes, 3_000_000));
    }
    await retainAttachment(dmMediaScope(a.session.accountId), row.id);
    return downloadSealedAttachment({
      account: dmMediaScope(a.session.accountId),
      message: row.id,
      file,
      thumbnail,
      image: input.image,
      snapshot: undefined,
      guard: () => this.guard(input.generation),
      api: a.offline ? null : this.privateApi(a, input.generation),
    });
  }
}
function personalPage(value: unknown): {
  items: unknown[];
  profiles: unknown[];
  recovery: unknown[];
  next: unknown;
} {
  const raw = object(value);
  if (
    !Array.isArray(raw['items']) ||
    raw['items'].length > 16 ||
    !Array.isArray(raw['profiles']) ||
    raw['profiles'].length > 32 ||
    !Array.isArray(raw['recovery']) ||
    raw['recovery'].length > 16
  )
    throw new Error('Invalid personal DM page.');
  return {
    next: raw['next'],
    items: raw['items'],
    profiles: raw['profiles'],
    recovery: raw['recovery'],
  };
}
async function receiveSocialInbox(
  api: SocialApi,
  machine: MessageCrypto,
): Promise<void> {
  const data = object(await api('matrix-inbox', {}));
  if (!Array.isArray(data['items']) || data['items'].length > 16)
    throw new Error('Invalid DM key box.');
  const rows = data['items'].map((value) => object(value));
  const received = await machine.receive(
    rows.map((row) => row['event']),
    socialRevision(data['oneTimeKeys']),
  );
  if (received.length)
    await api('matrix-received', {
      sequences: received.map((index) =>
        socialRevision(rows[index]?.['sequence']),
      ),
    });
}

function markDownloaded(
  context: SocialContext,
  values: unknown[],
  options: VaultWorkOptions,
): void {
  if (!chatSyncActive()) return;
  for (const value of values) {
    const packet = object(value)['packet'];
    if (packet !== undefined)
      traceIncomingHandle(context, socialPacket(packet), 'downloaded', options);
  }
}

function traceIncomingHandle(
  context: SocialContext,
  packet: ReturnType<typeof socialPacket>,
  stage: HandleDeliveryPoint,
  options: VaultWorkOptions = {},
): void {
  if (
    !packet.relation &&
    packet.recipient === context.authority.session.accountId
  )
    traceHandleDelivery(packet.id, stage, options.handleRead);
}

function markHandleSend(
  id: string,
  stage: 'submit' | 'accepted',
  relation?: MessageRelation,
): void {
  if (relation) return;
  traceSend(stage, id);
  traceHandleDelivery(id, stage);
}

function measureDmWork<T>(
  owner: SocialDms,
  operation: string,
  work: () => Promise<T>,
): Promise<T> {
  return chatSyncActive() ? measureWork(owner, operation, work) : work();
}
