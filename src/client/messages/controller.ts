import type { ConversationPreview } from '../conversation-preview/index.ts';
import { retrySnapshotRead } from './snapshot-retry.ts';
import { t } from '../../shared/i18n/index.ts';
import { messageStates } from '../message-state/index.ts';
import { readPrefetchPage } from './prefetch-page.ts';
import { ConfirmedConversations } from './confirmed-conversations.ts';
import {
  traceChatSync,
  traceChatSyncFailure,
} from '../chat-sync-diagnostics/index.ts';
import { probeConfirmed } from './confirmed-probe.ts';
import { readDelivery } from './delivery.ts';
import { readDirectoryPreviews } from './directory-previews.ts';
import { optionalSentAt } from '../../shared/message-presentation/index.ts';
import { knownPeerProfile } from './known-profile.ts';
import { readBackupWindow } from './backup-window.ts';
import { RemovalIndex } from '../personal-removals/index.ts';
import {
  conversationHistory,
  relatedHistory,
  historyRecord,
  historyPeers,
  mergeHistory,
  searchHistory,
} from '../local-history/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { base64 } from '../../shared/account/index.ts';
import { openStoredAttachment } from '../attachments/index.ts';
import { indexSearch, searchMessages } from '../message-search/index.ts';
import type { DeliveryState } from '../message-status/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { personalRemoval, verifyRemoval } from '../../shared/backups/index.ts';
import {
  attachmentContent,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import {
  stageAttachment,
  uploadAttachments,
  downloadAttachment,
  downloadSealedAttachment,
  forgetAttachment,
  retainAttachment,
} from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { prepareMessageRuntime } from '../message-runtime/index.ts';
import { openMessageMachine } from '../message-session/index.ts';
import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  verifyHistory,
} from '../../shared/devices/index.ts';
import { recoveryKey, verifyRecoveryKey } from '../../shared/messages/index.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { localLocator } from '../vault-storage/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../message-recovery/index.ts';
import { MessageCrypto } from '../message-crypto/index.ts';
import { MessageVisibility } from '../message-visibility/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import {
  localGet,
  localPut,
  localDelete,
  localPage,
  sealLocal,
  openLocal,
  enqueueOutbox,
  outboxPage,
  removeOutbox,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { TextDraft } from './text-send.ts';
import { encodeProfileCard, profileCard } from '../message-profile/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
import {
  MegolmDecryptionError,
  DecryptionErrorCode,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { messageApi, backupMessageApi } from '../message-api/index.ts';
import {
  MessageIndex,
  IncompleteMessageIndex,
  VerifiedWindow,
  MessagePrefetch,
  messagePeer,
  verifiedReceipt,
  verifiedReceiptHash,
} from './index-sync.ts';
import { OfflineIndex } from './offline-index.ts';
import type { CachedText } from './offline-index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
import {
  messageItems,
  peerHistory,
  verifyDeletion,
  indexedPacket,
  assertPacketIdentity,
  assertRemovalIdentity,
} from './history.ts';
import type { MessageItem } from './history.ts';
import { PeerIdentity } from '../peer-identity/index.ts';
/** Normal state of an accepted message; the bubble shows it only as a tooltip to keep the thread quiet. */
export const receivedState = messageStates.received;
export interface MessageView {
  sentAt?: number;
  archived?: boolean;
  delivery?: DeliveryState;
  relation?: MessageRelation;
  sequence?: number;
  author?: string;
  kind: MessagePacket['kind'];
  id: string;
  peer: string;
  own: boolean;
  text: string;
  state: string;
  hash: string;
}
interface Outbox {
  outboxOrder?: string;
  createdAt?: number;
  relation?: MessageRelation;
  id: string;
  peer: string;
  draft: LocalCipher[];
  kind: MessagePacket['kind'];
  packet: MessagePacket | null;
  transferStarted?: boolean;
}
interface ProfileCache {
  verification?: LocalCipher;
  id: string;
  peer: string;
  own: boolean;
  sequence: number;
  hash: string;
  draft: LocalCipher[];
}
function markReceived(
  items: MessageItem[],
  receipts: { id: string; hash: string }[],
): void {
  const received = new Set(receipts.map((receipt) => receipt.id));
  for (const item of items) if (received.has(item.id)) item.status = 'received';
}
/** Authority serializes SDK/IDB mutations across tabs; views are published only after the final server check. */
export class Messages {
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private readonly visibility: MessageVisibility<MessageView>;
  private session: AccountSession | null = null;
  private generation = 0;
  private previewGeneration = 0;
  private readonly identities: PeerIdentity;
  private initializedDirectory = '';
  private pinsGeneration = -1;
  private readonly histories = new Map<
    string,
    import('../../shared/devices/index.ts').DirectoryEvent[]
  >();
  private selected: string | null = null;
  private before: number | null = null;
  private oldest: number | null = null;
  transportPending = false;
  private confirmed: { snapshot: string; views: MessageView[] } | null = null;
  private readonly conversations = new ConfirmedConversations<MessageView>();
  private probedSnapshot: unknown = null;
  private readonly index = new MessageIndex();
  private readonly prefetch = new MessagePrefetch();
  private prefetchAbort: AbortController | null = null;
  private readonly verified = new VerifiedWindow<MessageView>();
  private readonly offlineIndex = new OfflineIndex();
  private readonly published: (value: { id: string; peer: string }) => void;
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    publish: (
      rows: readonly MessageView[] | null,
      update: HistoryUpdate,
    ) => void,
    published: (value: { id: string; peer: string }) => void = () => {},
  ) {
    this.access = access;
    this.sync = sync;
    this.identities = new PeerIdentity(sync);
    this.visibility = new MessageVisibility(publish);
    this.published = published;
  }
  async knownProfile(peer: string): Promise<ProfileCard | null> {
    const session = this.session,
      generation = this.generation;
    if (!session) return null;
    return this.access.withVault(!navigator.onLine, async (authority) => {
      this.guard(generation);
      if (
        authority.session.accountId !== session.accountId ||
        authority.session.deviceId !== session.deviceId ||
        authority.session.csrf !== session.csrf
      )
        throw new Error('Account changed.');
      const card = await knownPeerProfile(authority, peer);
      this.guard(generation);
      return card;
    });
  }
  directoryPreviews(peers: readonly string[]) {
    const generation = this.previewGeneration;
    return retrySnapshotRead(
      () => this.readDirectoryPreviews(peers),
      () => this.previewGeneration === generation,
    );
  }
  private async readDirectoryPreviews(
    peers: readonly string[],
  ): Promise<Map<string, ConversationPreview>> {
    if (!peers.length) return new Map();
    const generation = this.generation,
      previewGeneration = this.previewGeneration,
      guard = () => this.guardPreviews(previewGeneration);
    let snapshot: unknown;
    const previews = await this.access.withVault(false, async (a) => {
      const api = async (
        operation: string,
        payload: Record<string, unknown>,
      ) => {
        const value = await messageApi(a, operation, payload, guard);
        if (operation === 'snapshot') snapshot = value;
        return value;
      };
      return readDirectoryPreviews({
        peers,
        api,
        guard,
        read: (snapshot, items) =>
          this.readPreviewViews({ a, generation, api, snapshot, items, guard }),
      });
    });
    await this.savePins();
    guard();
    await this.access.withVault(false, (a) =>
      messageApi(a, 'confirm', { snapshot }, guard),
    );
    guard();
    return previews;
  }
  private async readPreviewViews(c: {
    a: VaultAuthority;
    generation: number;
    api: (
      operation: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>;
    snapshot: unknown;
    items: MessageItem[];
    guard: () => void;
  }): Promise<MessageView[]> {
    const views: MessageView[] = [],
      missing: MessageItem[] = [];
    for (const item of c.items) {
      const cached = await this.readCached(c.a, c.snapshot, item);
      if (cached) views.push(cached);
      else missing.push(item);
    }
    if (!missing.length) return views;
    const machine = await this.machine(c.a, c.generation, c.api);
    try {
      await machine.prepare(c.a);
      await this.receive(c.a, machine, c.generation, c.api);
      const fetched = await this.readBatch({
        ...c,
        items: missing,
        machine,
        skipUnavailable: true,
      });
      return [...views, ...fetched.values()];
    } finally {
      machine.close();
    }
  }
  setSession(session: AccountSession | null): void {
    this.conversations.setProfile(session);
    if (
      session?.accountId !== this.session?.accountId ||
      session?.csrf !== this.session?.csrf ||
      session?.deviceId !== this.session?.deviceId
    ) {
      this.close();
      this.identities.clear();
      this.histories.clear();
      this.initializedDirectory = '';
    }
    this.session = session;
  }
  close(): void {
    this.previewGeneration++;
    this.pinsGeneration = -1;
    this.pauseSynchronization();
    this.prefetch.reset();
    this.conversations.clear('controller-close');
    this.probedSnapshot = null;
    this.confirmed = null;
    this.verified.clear();
    this.generation++;
    this.visibility.close();
    this.index.reset();
    this.offlineIndex.reset();
  }
  /** Leaving the conversation hides its projection. Account suspension also
   * ends immediate reuse; candidates still support a fresh probe. */
  pause(scope: 'account' | 'conversation' = 'account'): void {
    if (scope === 'account') {
      this.previewGeneration++;
      this.conversations.invalidateReuse('account-pause');
    }
    this.pinsGeneration = -1;
    this.probedSnapshot = null;
    this.pauseSynchronization();
    this.visibility.close();
  }
  /** A removal hint carries no IDs. Block content access immediately while
   * retaining verified candidates for the authenticated incremental response. */
  removed(): void {
    this.previewGeneration++;
    this.conversations.clear('removal');
    this.pauseSynchronization();
    this.confirmed = null;
    this.probedSnapshot = null;
    this.visibility.close('pending');
  }
  hide(): void {
    this.previewGeneration++;
    this.pinsGeneration = -1;
    this.conversations.clear('hidden');
    this.probedSnapshot = null;
    this.pauseSynchronization();
    this.index.reset();
    this.confirmed = null;
    this.verified.clear();
    this.visibility.close();
  }
  /** A normal wakeup retains the last verified view, but cannot publish new rows. */
  hint(): void {
    this.probedSnapshot = null;
    this.conversations.hint();
    this.visibility.hint();
  }
  setLiveConnected(connected: boolean): void {
    if (!connected) this.previewGeneration++;
    this.conversations.connection(connected);
  }
  canRestore(peer: string): boolean {
    return this.session !== null && this.conversations.reusable(peer) !== null;
  }
  /** Reproject only a fully verified window from this connected session.
   * The next background probe still validates its current server snapshot. */
  restoreSelected(): boolean {
    const candidate = this.selected
      ? this.conversations.reusable(this.selected)
      : null;
    if (!candidate || candidate !== this.confirmed) {
      traceChatSync(this.conversations, this.selected, {
        event: 'projection',
        reason: !this.selected
          ? 'no-selection'
          : candidate
            ? 'projection-mismatch'
            : 'window-unavailable',
      });
      return false;
    }
    const token = this.visibility.refresh();
    this.visibility.stage(token, candidate.views);
    this.visibility.complete(token);
    traceChatSync(this.conversations, this.selected, {
      event: 'projection',
      reason: 'restored',
    });
    return true;
  }
  select(peer: string | null, older = false): void {
    this.pauseSynchronization();
    this.probedSnapshot = null;
    const candidate = peer && !older ? this.conversations.read(peer) : null;
    traceChatSync(this.conversations, peer, {
      event: 'candidate-read',
      reason: candidate ? 'candidate-present' : 'missing',
      older,
    });
    this.confirmed = candidate;
    this.verified.clear();
    this.generation++;
    this.visibility.close();
    this.offlineIndex.reset();
    this.selected = peer;
    this.before = older ? this.oldest : null;
    if (candidate) this.oldest = candidate.oldest;
  }
  private rememberConversation(): void {
    if (this.confirmed)
      this.conversations.confirm(
        JSON.parse(this.confirmed.snapshot) as unknown,
      );
    if (!this.selected || this.before !== null || !this.confirmed) return;
    this.conversations.remember(this.selected, {
      ...this.confirmed,
      oldest: this.oldest,
    });
  }
  private confirmConversationChanges(snapshot: unknown): void {
    const changes = this.index.changesFor(snapshot);
    if (changes)
      this.conversations.advance(changes.from, changes.snapshot, changes.peers);
  }
  private guard(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Session or synchronization changed.');
  }
  private guardPreviews(generation: number): void {
    if (generation !== this.previewGeneration)
      throw new Error('Account preview verification changed.');
  }
  private async machine(
    a: VaultAuthority,
    generation: number,
    api = (op: string, data: Record<string, unknown>) =>
      messageApi(a, op, data, () => this.guard(generation)),
  ): Promise<MessageCrypto> {
    return openMessageMachine(a, api);
  }
  private async recoverable(
    a: VaultAuthority,
    generation: number,
  ): Promise<RecoveryKey> {
    let raw = await messageApi(a, 'recovery-current', {}, () =>
      this.guard(generation),
    );
    if (raw === null)
      raw = await messageApi(
        a,
        'recovery-register',
        { key: await createRecoveryKey(a) },
        () => this.guard(generation),
      );
    const key = recoveryKey(raw),
      event = a.events[key.authorityRevision - 1];
    if (!event) throw new Error('Recovery authority missing.');
    await verifyRecoveryKey(key, event);
    const secret = await openRecoveryKey(key, a);
    secret.free();
    return key;
  }
  async initialize(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    await prepareMessageRuntime();
    this.guard(generation);
    await this.access.withVault(
      false,
      async (a) => {
        this.guard(generation);
        if (this.initializedDirectory === a.directory) return;
        await this.recoverable(a, generation);
        const machine = await this.machine(a, generation);
        try {
          await machine.prepare(a);
          this.guard(generation);
          this.initializedDirectory = a.directory;
        } finally {
          machine.close();
        }
      },
      options,
    );
  }
  async loadPins(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    await this.identities.load(options);
    this.guard(generation);
    this.pinsGeneration = generation;
  }
  async savePins(options: VaultWorkOptions = {}): Promise<void> {
    await this.identities.save(undefined, options);
  }
  private async history(
    c: {
      a: VaultAuthority;
      generation: number;
      api?: (op: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    account: string,
    through: number | null,
  ) {
    const { a, generation } = c;
    if (account === a.session.accountId) {
      await verifyHistory(a.events, account);
      return a.events;
    }
    const cached = this.histories.get(account);
    if (through !== null && cached && cached.length >= through)
      return cached.slice(0, through);
    const history = await peerHistory(
      c.api ?? ((op, d) => messageApi(a, op, d, () => this.guard(generation))),
      account,
      through,
      this.identities.get(account),
    );
    this.histories.set(account, history);
    if (this.histories.size > 16)
      this.histories.delete(this.histories.keys().next().value ?? '');
    await this.identities.remember(account, history);
    return history;
  }
  async compose(
    peer: string,
    text: string,
    kind: MessagePacket['kind'] = 'text',
    provided?: string | { id: string; relation: MessageRelation },
  ): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(!navigator.onLine, async (a) => {
      this.guard(generation);
      const id =
          (typeof provided === 'object' ? provided.id : provided) ??
          crypto.randomUUID(),
        draft = await this.sealDraft(a, id, text, kind),
        outbox: Outbox = {
          id,
          peer,
          draft,
          kind,
          packet: null,
          ...(typeof provided === 'object'
            ? { relation: provided.relation }
            : {}),
        };
      await localPut(
        a.session.accountId,
        `outbox:${id}`,
        outbox,
        draft.reduce((total, chunk) => total + chunk.bytes.length, 0) + 512,
      );
    });
  }
  /** Local ciphertext admission only; SDK selection/publication stay exclusive. */
  async queueText(input: TextDraft): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(
      !navigator.onLine,
      async (a) => {
        this.guard(generation);
        const draft = [await sealLocal(a, input.id, input.text)];
        this.guard(generation);
        await enqueueOutbox({
          scope: a.session.accountId,
          id: input.id,
          value: {
            id: input.id,
            peer: input.peer,
            draft,
            kind: 'text',
            packet: null,
            createdAt: input.createdAt ?? Date.now(),
          },
          size: draft[0]!.bytes.length + 512,
          current: () => generation === this.generation,
        });
      },
      { priority: 'interactive' },
    );
  }
  async composeAttachment(
    peer: string,
    selection: AttachmentSelection,
    caption: string,
  ): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(!navigator.onLine, async (a) => {
      this.guard(generation);
      const id = crypto.randomUUID();
      try {
        const content = await stageAttachment({
          account: a.session.accountId,
          id,
          selection,
          caption,
          maximum: chatFileLimit,
        });
        this.guard(generation);
        const draft = [await sealLocal(a, id, JSON.stringify(content))];
        await localPut(
          a.session.accountId,
          `outbox:${id}`,
          {
            id,
            peer,
            draft,
            kind: 'attachment',
            packet: null,
          } satisfies Outbox,
          draft[0]!.bytes.length + 512,
        );
      } catch (error: unknown) {
        await forgetAttachment(a.session.accountId, id);
        throw error;
      }
    });
  }
  async composeAction(
    view: MessageView,
    type: MessageRelation['type'],
    text: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const session = this.session;
    if (!session) throw new Error('Session ended.');
    const relation = {
      id: view.id,
      hash: view.hash,
      author: view.author ?? (view.own ? session.accountId : view.peer),
      type,
    };
    await this.compose(view.peer, text, 'text', { id, relation });
  }
  async playbackAllowed(peer: string): Promise<boolean> {
    return this.access.withVault(
      false,
      async (a) =>
        (await messageApi(a, 'playback-allowed', { peer }, () => {})) === true,
    );
  }
  async media(
    view: MessageView,
    thumbnail: boolean,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const generation = this.generation,
      confirmed = this.confirmed;
    const guard = () => {
      this.guard(generation);
      if (
        navigator.onLine &&
        (this.confirmed !== confirmed ||
          !confirmed?.views.some(
            (r) => r.id === view.id && r.hash === view.hash,
          ))
      )
        throw new Error('Sync before opening the attachment.');
    };
    guard();
    const content = attachmentContent(JSON.parse(view.text) as unknown),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Thumbnail missing.');
    if (view.archived) return this.historicalMedia(view, thumbnail, guard);
    const work = async (a: VaultAuthority) => {
      const snapshot: unknown = confirmed
        ? JSON.parse(confirmed.snapshot)
        : null;
      const api = a.offline
        ? null
        : (op: string, d: Record<string, unknown>) =>
            messageApi(a, op, d, guard);
      const bytes = await downloadAttachment({
        account: a.session.accountId,
        message: view.id,
        file,
        thumbnail,
        image: thumbnail || content.image,
        api,
        snapshot,
        guard,
      });
      try {
        if (api) await api('confirm', { snapshot });
        guard();
        return bytes;
      } catch (error: unknown) {
        bytes.fill(0);
        throw error;
      }
    };
    try {
      if (navigator.onLine) return await this.access.withVault(false, work);
      const locator = await localLocator();
      if (!locator) throw new Error('Local copy not authorized.');
      return await this.access.withLocalVault(locator, work);
    } catch (error: unknown) {
      if (
        error instanceof AccountError &&
        [403, 409, 410, 423].includes(error.status)
      )
        this.close();
      throw error;
    }
  }
  private async historicalMedia(
    view: MessageView,
    thumbnail: boolean,
    guard: () => void,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const content = attachmentContent(JSON.parse(view.text) as unknown);
    const file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Thumbnail missing.');

    const work = async (a: VaultAuthority) => {
      const row = await historyRecord(a, 'media', file.ref.id);
      guard();
      if (
        !row ||
        row.type !== 'media' ||
        row.hash !== file.ref.hash ||
        row.message !== view.id
      )
        throw new Error('Media unavailable in imported history.');
      return openStoredAttachment(
        file,
        base64(row.bytes, chatFileLimit),
        thumbnail,
        thumbnail || content.image,
      );
    };
    if (navigator.onLine) return this.access.withVault(false, work);
    const locator = await localLocator();
    if (!locator) throw new Error('Local history not authorized.');
    return this.access.withLocalVault(locator, work);
  }
  private async sealDraft(
    a: VaultAuthority,
    id: string,
    text: string,
    kind: MessagePacket['kind'],
  ): Promise<LocalCipher[]> {
    if (kind === 'attachment') attachmentContent(JSON.parse(text) as unknown);
    if (kind !== 'profile') return [await sealLocal(a, id, text)];
    profileCard(JSON.parse(text) as unknown);
    return this.sealProfileChunks(a, text);
  }
  private async sealProfileChunks(
    a: VaultAuthority,
    text: string,
  ): Promise<LocalCipher[]> {
    const chunks: LocalCipher[] = [];
    for (let after = 0; after < text.length; after += 1_500_000)
      chunks.push(
        await sealLocal(
          a,
          crypto.randomUUID(),
          text.slice(after, after + 1_500_000),
        ),
      );
    return chunks;
  }
  async shareProfile(peer: string, card: ProfileCard): Promise<void> {
    const session = this.session,
      generation = this.generation;
    if (!session) return;
    const serialized = encodeProfileCard(card),
      hash = await digest(serialized),
      name = `profile-sent:${peer}`;
    const sent = await localGet<string>(session.accountId, name);
    this.guard(generation);
    if (sent === hash) return;
    const key = await digest(
      canonical([
        '0xdmme-profile-card',
        1,
        session.accountId,
        peer,
        card.revision,
        card.name,
      ]),
    );
    const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
    await this.loadPins();
    this.guard(generation);
    const known = await this.access.withVault(false, (a) =>
      messageApi(a, 'profile-known', { id, peer }, () =>
        this.guard(generation),
      ),
    );
    if (!known) {
      await this.compose(peer, serialized, 'profile', id);
      await this.sendPending();
    }
    await localPut(session.accountId, name, hash, 512);
  }

  async sendPending(options: VaultWorkOptions = {}): Promise<void> {
    if (!(await this.pending()).length) return;
    const generation = this.generation;
    let targets: string[] = [];
    // Opening a retained window defers the vault read, not identity validation
    // before distributing keys or publishing new ciphertext.
    if (this.pinsGeneration !== generation) await this.loadPins(options);
    this.guard(generation);
    // Persist the first trusted identity before distributing a room key or
    // accepting ciphertext. VaultSync owns a separate lock, so save outside it.
    await this.access.withVault(
      false,
      async (a) => {
        const page = await outboxPage<Outbox>(a.session.accountId);
        targets = page.map((item) => item.name);
        for (const peer of new Set(page.map((row) => row.value.peer)))
          await this.history({ a, generation }, peer, null);
      },
      options,
    );
    if (!targets.length) return;
    await this.savePins(options);
    this.guard(generation);
    await this.access.withVault(
      false,
      async (a) => {
        this.guard(generation);
        const api = (op: string, d: Record<string, unknown>) =>
          messageApi(a, op, d, () => this.guard(generation));
        const own = await this.recoverable(a, generation),
          machine = await this.machine(a, generation);
        try {
          const page = await outboxPage<Outbox>(a.session.accountId, targets);
          for (const { name, value } of page)
            await this.sendOne({
              a,
              api,
              own,
              machine,
              generation,
              name,
              value,
            });
        } finally {
          machine.close();
        }
      },
      options,
    );
  }
  private async sendOne(context: {
    a: VaultAuthority;
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
    own: RecoveryKey;
    machine: MessageCrypto;
    generation: number;
    name: string;
    value: Outbox;
  }): Promise<void> {
    const { a, api, own, machine, generation, name, value } = context;
    if (await this.alreadyAccepted(api, value)) {
      this.notifyPublished(value, generation);
      await removeOutbox(a.session.accountId, name);
      await this.retainOutbox(a, value);
      return;
    }
    const history = await this.history({ a, generation }, value.peer, null),
      last = history.at(-1);
    if (!last) throw new Error('Contact directory missing.');
    if (
      !value.packet ||
      value.packet.deviceId !== a.session.deviceId ||
      value.packet.senderDirectory !== a.directory ||
      value.packet.recipientRevision !== last.revision
    ) {
      const raw = await api('recovery-peer', { accountId: value.peer });
      if (raw === null)
        throw new Error(
          'Your contact must open the app to prepare recovery before the first message.',
        );
      const peer = recoveryKey(raw),
        event = history[peer.authorityRevision - 1];
      if (!event) throw new Error('Contact recovery does not match.');
      await verifyRecoveryKey(peer, event);
      value.packet = await machine.encrypt({
        authority: a,
        peerHistory: history,
        recovery: [own, peer],
        id: value.id,
        text: (
          await Promise.all(value.draft.map((chunk) => openLocal(a, chunk)))
        ).join(''),
        kind: value.kind,
        ...(value.relation ? { relation: value.relation } : {}),
      });
      await localPut(
        a.session.accountId,
        name,
        value,
        value.draft.reduce((total, chunk) => total + chunk.bytes.length, 0) +
          new TextEncoder().encode(JSON.stringify(value.packet)).length +
          512,
      );
    }
    await this.transferOutbox(a, api, value);
    await this.publishOutbox(api, value);
    this.notifyPublished(value, generation);
    await this.retainOutbox(a, value);
    await removeOutbox(a.session.accountId, name);
  }
  private notifyPublished(value: Outbox, generation: number): void {
    if (
      generation === this.generation &&
      value.kind === 'text' &&
      !value.relation
    )
      this.published({ id: value.id, peer: value.peer });
  }
  private async retainOutbox(a: VaultAuthority, value: Outbox): Promise<void> {
    if (value.kind === 'attachment')
      await retainAttachment(a.session.accountId, value.id);
  }
  private async transferOutbox(
    a: VaultAuthority,
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: Outbox,
  ): Promise<void> {
    if (value.kind === 'attachment') {
      value.transferStarted = true;
      await localPut(
        a.session.accountId,
        `outbox:${value.id}`,
        value,
        value.draft.reduce((total, part) => total + part.bytes.length, 0) +
          JSON.stringify(value.packet).length +
          512,
      );
      const content = attachmentContent(
        JSON.parse(await openLocal(a, value.draft[0]!)) as unknown,
      );
      await uploadAttachments({
        account: a.session.accountId,
        message: value.id,
        peer: value.peer,
        content,
        api,
      });
    }
  }
  private async alreadyAccepted(
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: Outbox,
  ): Promise<boolean> {
    if (
      value.kind === 'profile' &&
      (await api('profile-known', { id: value.id, peer: value.peer }))
    )
      return true;
    return (
      value.packet !== null &&
      Boolean(
        await api('accepted', {
          id: value.id,
          hash: await digest(JSON.stringify(value.packet)),
        }),
      )
    );
  }
  private async publishOutbox(
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: Outbox,
  ): Promise<void> {
    try {
      await api('publish', { packet: value.packet });
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        error.status !== 409 ||
        value.kind !== 'profile' ||
        !(await api('profile-known', { id: value.id, peer: value.peer }))
      )
        throw error;
    }
  }
  async synchronize(options: VaultWorkOptions = {}): Promise<void> {
    const probed = this.probedSnapshot;
    this.probedSnapshot = null;
    const token = this.visibility.refresh(),
      generation = this.generation,
      selected = this.selected;
    try {
      const staged = await this.access.withVault(
        false,
        async (a) => {
          const api = (op: string, d: Record<string, unknown>) =>
              messageApi(a, op, d, () => this.guard(generation)),
            snapshot = probed ?? (await api('snapshot', {}));
          const items = await this.synchronizeIndex({
            a,
            generation,
            api,
            snapshot,
            selected,
          });
          const related = messageItems(
            await api('relations', {
              ids: items.filter((i) => i.kind !== 'profile').map((i) => i.id),
              snapshot,
            }),
            48,
          ).items;
          const window = [...items, ...related],
            views: MessageView[] = [],
            missing: MessageItem[] = [];
          for (const item of window) {
            const cached =
              this.verified.read(snapshot, item) ??
              (await this.readCached(a, snapshot, item));
            if (cached) views.push(cached);
            else missing.push(item);
          }
          if (missing.length) {
            const machine = await this.machine(a, generation);
            try {
              await machine.prepare(a);
              await this.receive(a, machine, generation);
              const fetched = await this.readBatch({
                a,
                generation,
                api,
                snapshot,
                machine,
                items: missing,
                skipUnavailable: false,
              });
              views.push(...fetched.values());
            } finally {
              machine.close();
            }
          }
          const byId = new Map(views.map((view) => [view.id, view]));
          const ordered = window.map((item) => byId.get(item.id)!);
          await indexSearch(a, ordered);
          const delivered = await this.refreshDelivery(
            snapshot,
            generation,
            ordered,
            a,
          );
          const projected = await this.includeHistory(a, delivered, generation);
          return { views: projected, liveViews: ordered, snapshot, window };
        },
        options,
      );
      await this.savePins(options);
      this.guard(generation);
      const views = staged.views;
      this.oldest =
        views.filter((v) => !v.relation && v.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.visibility.stage(token, views);
      await this.confirmVisible(token, staged.snapshot, generation, options);
      this.guard(generation);
      this.confirmed = { snapshot: JSON.stringify(staged.snapshot), views };
      this.verified.remember(staged.snapshot, staged.window, staged.liveViews);
      this.confirmConversationChanges(staged.snapshot);
      this.rememberConversation();
    } catch (error: unknown) {
      if (!(error instanceof IncompleteMessageIndex)) this.index.reset();
      this.conversations.clear('sync-failed');
      traceChatSyncFailure(this.conversations, {
        reason: 'sync-failed',
        current: generation === this.generation,
        error,
      });
      this.probedSnapshot = null;
      this.confirmed = null;
      this.verified.clear();
      this.visibility.fail(token);
      throw error;
    }
  }
  private async confirmVisible(
    token: number,
    snapshot: unknown,
    generation: number,
    options: VaultWorkOptions = {},
  ): Promise<void> {
    await this.visibility.confirm(token, async () => {
      const check = (a: VaultAuthority) =>
        messageApi(a, 'confirm', { snapshot }, () => this.guard(generation));
      await this.access.withVault(false, check, options);
      this.guard(generation);
    });
  }
  private historicalView(
    a: VaultAuthority,
    row: Extract<BackupRecord, { type: 'message' }>,
  ): MessageView {
    return {
      ...row,
      archived: true,
      author: row.own ? a.session.accountId : row.peer,
      state: messageStates.history,
    };
  }
  async archivedPeers(after: string | null, work: VaultWorkOptions = {}) {
    if (this.session && navigator.onLine)
      return this.access.withVault(false, (a) => historyPeers(a, after), work);
    const locator = await localLocator();
    if (!locator) return { items: [], next: null };
    return this.access.withLocalVault(locator, (a) => historyPeers(a, after));
  }
  async openArchive(peer: string): Promise<void> {
    this.selected = peer;
    const generation = this.generation,
      token = this.visibility.begin();
    const open = async (a: VaultAuthority) => {
      const views = await this.includeHistory(a, [], generation);
      this.guard(generation);
      this.oldest =
        views.filter((v) => !v.relation && v.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.confirmed = { snapshot: 'local', views };
      this.visibility.stage(token, views);
      this.visibility.complete(token);
    };
    try {
      if (this.session && navigator.onLine)
        await this.access.withVault(false, open);
      else {
        const locator = await localLocator();
        if (!locator) throw new Error('Local history unavailable.');
        await this.access.withLocalVault(locator, open);
      }
    } catch (error: unknown) {
      this.visibility.fail(token);
      throw error;
    }
  }
  private async includeHistory(
    a: VaultAuthority,
    remote: readonly MessageView[],
    generation: number,
  ): Promise<MessageView[]> {
    if (!this.selected) return [...remote];
    const local = await conversationHistory(a, this.selected, this.before);
    this.guard(generation);
    const merged = mergeHistory(
      remote,
      local.map((r) => this.historicalView(a, r)),
    );
    const base = merged
      .filter((r) => !r.relation && r.kind !== 'profile')
      .slice(-16);
    const ids = new Set(base.map((r) => r.id));
    const related = await relatedHistory(a, [...ids], () =>
      this.guard(generation),
    );
    const combined = mergeHistory(
      merged,
      related.map((r) => this.historicalView(a, r)),
    );
    return combined.filter(
      (r) =>
        r.kind === 'profile' ||
        ids.has(r.id) ||
        (r.relation && ids.has(r.relation.id)),
    );
  }
  private async synchronizeIndex(c: {
    a: VaultAuthority;
    generation: number;
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
    snapshot: unknown;
    selected: string | null;
  }): Promise<MessageItem[]> {
    return this.index.read({
      ...c,
      account: c.a.session.accountId,
      before: this.before,
      deleted: (item) => this.indexItem(c, item),
    });
  }
  private async indexItem(
    c: {
      a: VaultAuthority;
      generation: number;
      selected: string | null;
      api?: (op: string, data: Record<string, unknown>) => Promise<unknown>;
    },
    item: MessageItem,
  ): Promise<void> {
    if (item.deleted) {
      assertRemovalIdentity(
        item,
        await localGet<CachedText>(c.a.session.accountId, `cache:${item.id}`),
      );
      if (item.removal) {
        await verifyRemoval(
          c.a.session.accountId,
          personalRemoval({
            kind: 'message',
            id: item.removal_id ?? item.id,
            hash: item.removal_hash ?? item.hash,
            sequence: item.removal_sequence,
            proof: item.removal,
          }),
          c.a.events,
        );
      } else {
        const history = await this.history(
          c,
          item.deletion_account ?? item.sender,
          Number(item.deletion?.payload['revision']),
        );
        await verifyDeletion(item, history);
      }
      if (item.kind === 'profile') await this.preserveProfilePointer(c.a, item);
      await localDelete(c.a.session.accountId, `cache:${item.id}`);
      await localDelete(c.a.session.accountId, `search:${item.id}`);
      await localDelete(c.a.session.accountId, `profile:${item.id}`);
      await removeOutbox(c.a.session.accountId, `outbox:${item.id}`);
      await forgetAttachment(c.a.session.accountId, item.id);
      return;
    }
  }
  private async readOne(
    c: {
      a: VaultAuthority;
      generation: number;
      api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
      snapshot: unknown;
      machine: MessageCrypto;
      window: MessageItem[];
      histories: Map<string, Awaited<ReturnType<Messages['history']>>>;
      keys: Map<string, RecoveryKey>;
      acknowledge?: (id: string, hash: string) => Promise<void>;
    },
    item: MessageItem,
  ): Promise<MessageView> {
    try {
      return await this.readPacket(c, item);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 423) throw error;
      return {
        kind: 'text',
        ...(item.relation ? { relation: item.relation } : {}),
        author: item.sender,
        sequence: item.sequence,
        id: item.id,
        peer: messagePeer(c.a.session.accountId, item),
        own: item.sender === c.a.session.accountId,
        text: t('Delivery suspended: renewed consent is required.'),
        state: messageStates.suspended,
        hash: item.hash,
      };
    }
  }
  private async readPacket(
    c: {
      a: VaultAuthority;
      generation: number;
      api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
      snapshot: unknown;
      machine: MessageCrypto;
      window: MessageItem[];
      histories: Map<string, Awaited<ReturnType<Messages['history']>>>;
      keys: Map<string, RecoveryKey>;
      acknowledge?: (id: string, hash: string) => Promise<void>;
    },
    item: MessageItem,
  ): Promise<MessageView> {
    const { a, api, machine, snapshot } = c,
      packet = await indexedPacket(
        await api('object', { id: item.id, snapshot }),
        item,
      );
    assertPacketIdentity(packet, item);
    let history = c.histories.get(packet.sender);
    if (!history) {
      history = await this.history(
        c,
        packet.sender,
        Math.max(
          ...c.window
            .filter((x) => x.sender === packet.sender)
            .map((x) => x.sender_revision),
        ),
      );
      c.histories.set(packet.sender, history);
    }
    const event = history[packet.senderRevision - 1];
    if (!event) throw new Error('Message differs from index.');
    const archive = packet.archives.find(
      (x) => x.accountId === a.session.accountId,
    );
    if (!archive) throw new Error('Recoverable file missing.');
    let rawKey = c.keys.get(archive.keyId);
    if (!rawKey) {
      rawKey = recoveryKey(await api('recovery-key', { id: archive.keyId }));
      c.keys.set(archive.keyId, rawKey);
    }
    const content = await this.decryptPacket({
      a,
      machine,
      packet,
      event,
      key: rawKey,
    });
    const text = content.text;
    const peer =
        packet.sender === a.session.accountId
          ? packet.recipient
          : packet.sender,
      own = packet.sender === a.session.accountId;
    await this.cachePacket({
      a,
      packet,
      text,
      peer,
      own,
      item,
      snapshot,
      sentAt: content.sentAt,
    });
    if (c.acknowledge) await c.acknowledge(packet.id, item.hash);
    else await api('acknowledge', { id: packet.id, hash: item.hash });
    return this.viewFromItem(a, item, text, content.sentAt);
  }
  private viewFromItem(
    a: VaultAuthority,
    item: MessageItem,
    text: string,
    sentAt?: number,
  ): MessageView {
    return {
      ...optionalSentAt(sentAt),
      kind: item.kind,
      ...(item.relation ? { relation: item.relation } : {}),
      id: item.id,
      hash: item.hash,
      author: item.sender,
      sequence: item.sequence,
      peer: messagePeer(a.session.accountId, item),
      own: item.sender === a.session.accountId,
      text,
      state:
        item.sender === a.session.accountId
          ? messageStates.accepted
          : receivedState,
    };
  }
  private async decryptPacket(c: {
    a: VaultAuthority;
    machine: MessageCrypto;
    packet: MessagePacket;
    event: import('../../shared/devices/index.ts').DirectoryEvent;
    key: RecoveryKey;
  }): Promise<{ text: string; sentAt?: number }> {
    const { a, machine, packet, event } = c,
      archive = packet.archives.find(
        (x) => x.accountId === a.session.accountId,
      );
    if (!archive) throw new Error('Recoverable file missing.');
    try {
      return await machine.decryptContent({ packet, senderEvent: event });
    } catch (error: unknown) {
      if (
        !(error instanceof MegolmDecryptionError) ||
        error.code !== DecryptionErrorCode.MissingRoomKey
      )
        throw error;
      const key = await openRecoveryKey(c.key, a);
      try {
        return await machine.decryptContent({
          packet,
          senderEvent: event,
          exported: openRoomKey(key, archive),
        });
      } finally {
        key.free();
      }
    }
  }
  private async cachePacket(c: {
    a: VaultAuthority;
    packet: MessagePacket;
    text: string;
    peer: string;
    own: boolean;
    item: MessageItem;
    snapshot: unknown;
    sentAt: number | undefined;
  }): Promise<void> {
    const { a, packet, text, peer, own, item } = c;
    const verification = await sealLocal(
      a,
      packet.id,
      verifiedReceipt(c.snapshot, item, await digest(text), c.sentAt),
    );
    if (packet.kind === 'profile') {
      profileCard(JSON.parse(text) as unknown);
      const draft = await this.sealProfileChunks(a, text);
      await localPut(
        a.session.accountId,
        `profile:${packet.id}`,
        {
          verification,
          id: packet.id,
          peer,
          own,
          sequence: item.sequence,
          hash: item.hash,
          draft,
        } satisfies ProfileCache,
        draft.reduce((bytes, chunk) => bytes + chunk.bytes.length, 0) +
          verification.bytes.length +
          512,
      );
      await this.preserveProfilePointer(a, item);
      return;
    }
    if (packet.kind === 'attachment')
      attachmentContent(JSON.parse(text) as unknown);
    const cipher = await sealLocal(a, packet.id, text);
    await localPut(
      a.session.accountId,
      `cache:${packet.id}`,
      {
        ...cipher,
        verification,
        peer,
        own,
        kind: packet.kind,
        ...(packet.relation ? { relation: packet.relation } : {}),
        sequence: item.sequence,
        hash: item.hash,
      },
      cipher.bytes.length + verification.bytes.length + 512,
    );
  }
  private async preserveProfilePointer(
    a: VaultAuthority,
    item: MessageItem,
  ): Promise<void> {
    const own = item.sender === a.session.accountId,
      peer = messagePeer(a.session.accountId, item),
      name = `profile-current:${peer}:${own}`;
    const previous = await localGet<string>(a.session.accountId, name);
    const old = previous
      ? await localGet<ProfileCache>(a.session.accountId, `profile:${previous}`)
      : null;
    const tombstone = `profile-tombstone:${peer}:${own}`;
    const removed = await localGet<number>(a.session.accountId, tombstone);
    if (Math.max(old?.sequence ?? 0, removed ?? 0) >= item.sequence) return;
    if (item.deleted)
      await localPut(a.session.accountId, tombstone, item.sequence, 512);
    await localPut(a.session.accountId, name, item.id, 512);
  }
  private async receive(
    a: VaultAuthority,
    machine: MessageCrypto,
    generation: number,
    api = (op: string, data: Record<string, unknown>) =>
      messageApi(a, op, data, () => this.guard(generation)),
  ): Promise<void> {
    this.transportPending = false;
    for (let batch = 0; batch < 16; batch++) {
      const raw = object(await api('matrix-inbox', {})),
        items = raw['items'];
      if (!Array.isArray(items) || items.length > 16)
        throw new Error('Invalid Olm box.');
      const newlyReceived = await machine.receive(
        items.map((x) => object(x)['event']),
        Number(raw['oneTimeKeys']),
      );
      if (!items.length) return;
      const scope = `${a.session.accountId}:${a.session.deviceId}`;
      const received = await this.rememberReceipts(scope, items, newlyReceived);
      if (!received.length) {
        this.transportPending = true;
        return;
      }
      await api('matrix-received', {
        sequences: received.map((index) => object(items[index])['sequence']),
      });
      for (const index of received)
        await localDelete(
          scope,
          `olm-received:${String(object(items[index])['sequence'])}`,
        );
    }
    this.transportPending = true;
  }
  private async rememberReceipts(
    scope: string,
    items: unknown[],
    verified: number[],
  ): Promise<number[]> {
    const received: number[] = [];
    for (let index = 0; index < items.length; index++) {
      const row = object(items[index]);
      const sequence = integer(row['sequence'], Number.MAX_SAFE_INTEGER);
      const name = `olm-received:${sequence}`;
      const hash = await digest(canonical(row['event']));
      if (verified.includes(index)) await localPut(scope, name, hash, 512);
      if ((await localGet<string>(scope, name)) === hash) received.push(index);
    }
    return received;
  }
  async backupPage(
    after: number,
    frozen?: unknown,
  ): Promise<{ items: MessageItem[]; next: number | null }> {
    const generation = this.generation;
    return this.access.withVault(false, async (a) => {
      const guard = () => this.guard(generation);
      const snapshot =
        frozen ?? (await backupMessageApi(a, 'snapshot', {}, guard));
      const page = messageItems(
        await backupMessageApi(a, 'page', { after, snapshot }, guard),
      );
      for (const item of page.items)
        if (item.deleted)
          await this.indexItem({ a, generation, selected: null }, item);
      await backupMessageApi(a, 'confirm', { snapshot }, guard);
      return { items: page.items.filter((i) => !i.deleted), next: page.next };
    });
  }
  async backupSnapshot(): Promise<unknown> {
    return this.access.withVault(false, (a) =>
      backupMessageApi(a, 'snapshot', {}, () => {}),
    );
  }
  private async readCached(
    a: VaultAuthority,
    snapshot: unknown,
    item: MessageItem,
  ): Promise<MessageView | null> {
    if (item.deleted || item.status !== 'received') return null;
    const cached = await this.cachedCipherText(a, item);
    if (!cached) return null;
    const receipt = await openLocal(a, cached.verification);
    const hash = verifiedReceiptHash(receipt, snapshot, item);
    if (hash === null) return null;
    if ((await digest(cached.text)) !== hash)
      throw new Error('Local content differs from the verified package.');
    return this.viewFromItem(
      a,
      item,
      cached.text,
      optionalSentAt(object(JSON.parse(receipt) as unknown)['sentAt']).sentAt,
    );
  }
  private async cachedCipherText(
    a: VaultAuthority,
    item: MessageItem,
  ): Promise<{ text: string; verification: LocalCipher } | null> {
    if (item.kind === 'profile') {
      const row = await localGet<ProfileCache>(
        a.session.accountId,
        `profile:${item.id}`,
      );
      if (!row?.verification) return null;
      return {
        text: (
          await Promise.all(row.draft.map((chunk) => openLocal(a, chunk)))
        ).join(''),
        verification: row.verification,
      };
    }
    const row = await localGet<CachedText>(
      a.session.accountId,
      `cache:${item.id}`,
    );
    return row?.verification
      ? { text: await openLocal(a, row), verification: row.verification }
      : null;
  }
  private async readBatch(c: {
    a: VaultAuthority;
    generation: number;
    api: (op: string, data: Record<string, unknown>) => Promise<unknown>;
    snapshot: unknown;
    machine: MessageCrypto;
    items: MessageItem[];
    skipUnavailable: boolean;
    guard?: () => void;
    consume?: (views: MessageView[]) => Promise<void>;
  }): Promise<Map<string, MessageView>> {
    const guard = c.guard ?? (() => this.guard(c.generation)),
      views = new Map<string, MessageView>(),
      histories = new Map<string, Awaited<ReturnType<Messages['history']>>>(),
      keys = new Map<string, RecoveryKey>();
    // The existing export transport bounds both count (32) and ciphertext bytes.
    let remaining = c.items;
    while (remaining.length) {
      const ids = remaining.slice(0, 32).map((item) => item.id);
      const response = readBackupWindow(
        await c.api('backup-window', { ids, snapshot: c.snapshot }),
        ids,
      );
      for (const [id, key] of response.keys) keys.set(id, key);
      const api = (
        op: string,
        data: Record<string, unknown>,
      ): Promise<unknown> => {
        guard();
        if (op !== 'object') return c.api(op, data);
        const id = String(data['id']);
        if (response.packets.has(id))
          return Promise.resolve(response.packets.get(id));
        const status = response.unavailable.get(id);
        return Promise.reject(
          new AccountError(
            status ?? 410,
            'Message unavailable under current authorization.',
          ),
        );
      };
      const receipts: { id: string; hash: string }[] = [];
      const context = {
        ...c,
        api,
        window: c.items,
        histories,
        keys,
        acknowledge: (id: string, hash: string) => {
          receipts.push({ id, hash });
          return Promise.resolve();
        },
      };
      const batchViews: MessageView[] = [];
      for (const item of remaining.slice(0, response.count)) {
        guard();
        if (c.skipUnavailable && !response.packets.has(item.id)) continue;
        batchViews.push(await this.readOne(context, item));
      }
      if (receipts.length) {
        await c.api('backup-ack', { items: receipts, snapshot: c.snapshot });
        markReceived(c.items, receipts);
      }
      if (c.consume) await c.consume(batchViews);
      else for (const view of batchViews) views.set(view.id, view);
      remaining = remaining.slice(response.count);
    }
    return views;
  }
  async backupBatch(items: MessageItem[]): Promise<Map<string, MessageView>> {
    if (!items.length) return new Map();
    if (items.length > 32) throw new Error('Backup batch exceeds the limit.');
    const generation = this.generation;
    return this.access.withVault(false, async (a) => {
      const api = (op: string, data: Record<string, unknown>) =>
        backupMessageApi(a, op, data, () => this.guard(generation));
      const snapshot = await api('snapshot', {}),
        machine = await this.machine(a, generation, api);
      try {
        return await this.readBatch({
          a,
          generation,
          api,
          snapshot,
          machine,
          items,
          skipUnavailable: true,
        });
      } finally {
        machine.close();
      }
    });
  }
  pauseSynchronization(): void {
    this.prefetchAbort?.abort();
  }
  /** One global page per idle turn; user actions abort its network requests.
   * No views/read receipts are published, and the SDK lock is released each turn. */
  async synchronizeAll(signal: AbortSignal): Promise<boolean> {
    const generation = this.generation,
      abort = new AbortController();
    this.prefetchAbort = abort;
    const combined = AbortSignal.any([signal, abort.signal]);
    const guard = () => {
      combined.throwIfAborted();
      this.guard(generation);
    };
    try {
      const more = await this.access.withVault(false, async (a) => {
        guard();
        if (a.session.accountId !== this.session?.accountId)
          throw new Error('Account changed.');
        const api = (op: string, data: Record<string, unknown>) =>
          messageApi(a, op, data, { guard, signal: combined });
        const source = await readPrefetchPage(api, this.prefetch);
        if (!source) return false;
        const { snapshot, from, delta, page, after } = source;
        const missing: MessageItem[] = [];
        for (const item of page.items) {
          guard();
          messagePeer(a.session.accountId, item);
          if (item.deleted)
            await this.indexItem({ a, generation, selected: null, api }, item);
          else if (!(await this.readCached(a, snapshot, item)))
            missing.push(item);
        }
        if (missing.length) {
          const machine = await this.machine(a, generation, api);
          try {
            await machine.prepare(a);
            await this.receive(a, machine, generation, api);
            await this.readBatch({
              a,
              generation,
              api,
              snapshot,
              machine,
              items: missing,
              skipUnavailable: true,
              guard,
              consume: (views) => indexSearch(a, views),
            });
            guard();
          } finally {
            machine.close();
          }
        }
        await api('confirm', { snapshot });
        guard();
        if (delta) {
          this.prefetch.finish(snapshot);
          this.index.rememberChanges({
            from,
            snapshot,
            account: a.session.accountId,
            selected: this.selected,
            items: page.items,
          });
          this.confirmConversationChanges(snapshot);
          return false;
        }
        this.prefetch.commit(snapshot, page);
        this.index.rememberConfirmedPage({
          snapshot,
          account: a.session.accountId,
          selected: this.selected,
          after,
          page,
        });
        return page.next !== null;
      });
      guard();
      await this.identities.save(guard);
      guard();
      return more;
    } finally {
      if (this.prefetchAbort === abort) this.prefetchAbort = null;
    }
  }
  async backupMedia(
    view: MessageView,
    thumbnail: boolean,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const generation = this.generation;
    return this.access.withVault(false, async (a) => {
      const guard = () => this.guard(generation),
        api = (op: string, d: Record<string, unknown>) =>
          backupMessageApi(a, op, d, guard);
      const snapshot = await api('snapshot', {});
      await indexedPacket(await api('object', { id: view.id, snapshot }), view);
      const content = attachmentContent(JSON.parse(view.text) as unknown),
        file = thumbnail ? content.thumbnail : content.file;
      if (!file) throw new Error('Thumbnail missing.');
      const input = {
        account: a.session.accountId,
        message: view.id,
        file,
        thumbnail,
        image: thumbnail || content.image,
        api,
        snapshot,
        guard,
      };
      const opened = await downloadAttachment(input);
      opened.fill(0);
      const bytes = await downloadSealedAttachment(input);
      await api('confirm', { snapshot });
      return bytes;
    });
  }
  async probe(options: VaultWorkOptions = {}): Promise<boolean> {
    this.probedSnapshot = null;
    const token = this.visibility.refresh(
        this.confirmed ? 'delivery' : 'history',
      ),
      generation = this.generation;
    try {
      return await this.access.withVault(
        false,
        async (authority) => {
          const api = (operation: string, payload: Record<string, unknown>) =>
            messageApi(authority, operation, payload, () =>
              this.guard(generation),
            );
          if (this.confirmed) {
            const views = await probeConfirmed({
              candidate: this.confirmed,
              api,
              visibility: this.visibility,
              token,
            });
            this.guard(generation);
            if (views) {
              this.confirmed = { ...this.confirmed, views };
              this.rememberConversation();
              return false;
            }
          }
          const snapshot = await api('snapshot', {});
          this.guard(generation);
          this.confirmed = null;
          this.probedSnapshot = snapshot;
          this.visibility.discard(token);
          return true;
        },
        options,
      );
    } catch (error: unknown) {
      this.conversations.clear('probe-failed');
      traceChatSyncFailure(this.conversations, {
        reason: 'probe-failed',
        current: generation === this.generation,
        error,
      });
      this.probedSnapshot = null;
      this.confirmed = null;
      this.verified.clear();
      this.visibility.fail(token);
      throw error;
    }
  }
  private async refreshDelivery(
    snapshot: unknown,
    generation: number,
    views: readonly MessageView[],
    authority: VaultAuthority,
  ): Promise<MessageView[]> {
    return readDelivery({
      snapshot,
      views,
      api: (operation, payload) =>
        messageApi(authority, operation, payload, () => this.guard(generation)),
    });
  }
  async openOffline(peer: string | null): Promise<void> {
    if (navigator.onLine)
      throw new Error('Connected: sync before opening history.');
    const token = this.visibility.begin(),
      generation = this.generation,
      locator = await localLocator();
    if (!locator) throw new Error('No authorized local copy on this device.');
    try {
      await this.access.withLocalVault(locator, async (a) => {
        const removed = new RemovalIndex();
        await removed.load(a, () => this.guard(generation));
        const cached = await this.offlineIndex.read({
            account: a.session.accountId,
            peer,
            before: this.before,
            guard: () => this.guard(generation),
          }),
          views: MessageView[] = [];
        for (const value of cached) {
          this.guard(generation);
          views.push({
            kind: value.kind ?? 'text',
            ...(value.relation ? { relation: value.relation } : {}),
            sequence: value.sequence,
            author: value.own ? a.session.accountId : value.peer,
            id: value.id,
            peer: value.peer,
            own: value.own,
            ...optionalSentAt(
              value.verification
                ? object(
                    JSON.parse(
                      await openLocal(a, value.verification),
                    ) as unknown,
                  )['sentAt']
                : undefined,
            ),
            text: await openLocal(a, value),
            hash: value.hash,
            state: messageStates.offline,
          });
        }
        if (peer) await this.offlineProfiles(a, peer, views);
        this.selected = peer;
        const merged = await this.includeHistory(a, views, generation);
        this.oldest =
          merged.filter((v) => !v.relation && v.kind !== 'profile')[0]
            ?.sequence ?? this.before;
        this.guard(generation);
        this.visibility.stage(token, merged);
        this.visibility.complete(token);
        this.offlineIndex.reset();
      });
    } catch (error: unknown) {
      this.visibility.fail(token);
      throw error;
    }
  }
  private async offlineProfiles(
    a: VaultAuthority,
    peer: string,
    views: MessageView[],
  ): Promise<void> {
    for (const own of [true, false]) {
      const id = await localGet<string>(
        a.session.accountId,
        `profile-current:${peer}:${own}`,
      );
      if (!id) continue;
      const row = await localGet<ProfileCache>(
        a.session.accountId,
        `profile:${id}`,
      );
      if (!row) continue;
      const text = (
        await Promise.all(row.draft.map((chunk) => openLocal(a, chunk)))
      ).join('');
      profileCard(JSON.parse(text) as unknown);
      views.push({
        kind: 'profile',
        id,
        peer,
        own,
        hash: row.hash,
        text,
        state: messageStates.profileOffline,
      });
    }
  }
  async remove(view: MessageView): Promise<void> {
    this.removed();
    notifyMessageControls('other-tabs');
    const generation = this.generation;
    try {
      await this.access.withVault(false, (a) =>
        messageApi(
          a,
          'delete',
          { id: view.id, hash: view.hash, revision: a.events.length },
          () => this.guard(generation),
        ),
      );
    } catch (error: unknown) {
      if (generation === this.generation) this.hide();
      throw error;
    }
    notifyMessageControls('other-tabs');
  }
  async search(query: string, after: string | null) {
    const generation = this.generation,
      confirmed = this.confirmed;
    if (navigator.onLine && !confirmed)
      throw new Error('Sync before searching; history is hidden.');
    const guard = () => this.guard(generation);
    const work = async (a: VaultAuthority) => {
      const check = async () => {
        guard();
        if (!a.offline && confirmed?.snapshot !== 'local')
          await messageApi(
            a,
            'confirm',
            { snapshot: JSON.parse(confirmed!.snapshot) as unknown },
            guard,
          );
      };
      await check();
      if (after?.startsWith('archive:') || confirmed?.snapshot === 'local') {
        const archived = await searchHistory(
          a,
          query,
          after?.slice('archive:'.length) ?? null,
          guard,
        );
        return {
          ...archived,
          next: archived.next === null ? null : 'archive:' + archived.next,
        };
      }
      const result = await searchMessages({ a, query, after, guard });
      if (result.next === null) result.next = 'archive:';
      await check();
      return result;
    };
    if (this.session && navigator.onLine)
      return this.access.withVault(false, work);
    const locator = await localLocator();
    if (!locator) throw new Error('Local history unavailable.');
    return this.access.withLocalVault(locator, work);
  }
  async discard(id: string): Promise<void> {
    this.close();
    notifyMessageControls();
    const generation = this.generation;
    await this.access.withVault(!navigator.onLine, async (a) => {
      const row = await localGet<Outbox>(a.session.accountId, `outbox:${id}`);
      if (!row) return;
      if (row.kind === 'attachment' && row.transferStarted && a.offline)
        throw new Error(
          "Reconnect to cancel this attachment's remote reservation.",
        );
      const accepted = await this.discardRemote(a, row, generation);
      if (row.kind === 'attachment') {
        if (!a.offline && !accepted)
          await messageApi(a, 'attachment-cancel', { message: id }, () =>
            this.guard(generation),
          );
        await forgetAttachment(a.session.accountId, id);
      }
      await removeOutbox(a.session.accountId, `outbox:${id}`);
    });
    notifyMessageControls();
  }
  private async discardRemote(
    a: VaultAuthority,
    row: Outbox,
    generation: number,
  ): Promise<boolean> {
    let accepted = false;
    if (row.packet) {
      if (a.offline)
        throw new Error(
          'Reconnect to confirm deletion of a send that may have been accepted.',
        );
      const hash = await digest(JSON.stringify(row.packet));
      accepted = Boolean(
        await messageApi(a, 'accepted', { id: row.id, hash }, () =>
          this.guard(generation),
        ),
      );
      if (accepted)
        await messageApi(
          a,
          'delete',
          { id: row.id, hash, revision: a.events.length },
          () => this.guard(generation),
        );
    }
    return accepted;
  }
  /** Reopen only ordinary own drafts after the selected history gate has opened.
   * Fresh authority and generation checks also cover local pending plaintext. */
  async pendingTexts(
    peer: string,
    ids: readonly string[],
  ): Promise<TextDraft[]> {
    const generation = this.generation;
    return this.access.withVault(!navigator.onLine, async (a) => {
      this.guard(generation);
      const page = await outboxPage<Outbox>(
        a.session.accountId,
        ids.map((id) => `outbox:${id}`),
      );
      const drafts: TextDraft[] = [];
      for (const { value } of page) {
        if (value.peer !== peer || value.kind !== 'text' || value.relation)
          continue;
        const text = await openLocal(a, value.draft[0]!);
        this.guard(generation);
        drafts.push({
          id: value.id,
          peer,
          text,
          ...(value.createdAt === undefined
            ? {}
            : { createdAt: value.createdAt }),
          ...(value.outboxOrder ? { order: value.outboxOrder } : {}),
        });
      }
      this.guard(generation);
      return drafts;
    });
  }
  async pending(): Promise<{ id: string; peer: string; text?: boolean }[]> {
    const session = this.session;
    if (!session) return [];
    return (
      await localPage<Outbox>(session.accountId, 'outbox:', null)
    ).items.map((x) => ({
      id: x.value.id,
      peer: x.value.peer,
      text: x.value.kind === 'text' && !x.value.relation,
    }));
  }
}
