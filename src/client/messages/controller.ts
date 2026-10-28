import { ConversationReader } from './conversation-reader.ts';
import type { MessageWindowRead } from './conversation-reader.ts';
import type {
  MessageView,
  ConversationProjection,
  MessageReaderEvents,
} from './message-view.ts';
import {
  WorkInterruption,
  expectedInterruption,
} from '../synchronization-work/index.ts';
import { PrivateAudiences } from '../message-crypto/index.ts';
import { syncMessageApi as messageApi } from './sync-transport.ts';
import { MessageReceiveTurn } from './receive-turn.ts';
import { MessageRecoveryWakeup } from './recovery-wakeup.ts';
import { interruptedMessageRead } from './read-target.ts';
import type { MessageWorkResult } from './continuation.ts';
import { MessageSyncReceiver } from './sync-receiver.ts';
import { archiveStart, archiveToken, searchPosition } from './search-cursor.ts';
import { loadSyncProgress, saveSyncProgress } from './sync-progress.ts';
import { retainedMessageView } from './cache-projection.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { retrySnapshotRead } from './snapshot-retry.ts';
import { MessageOutbox } from './outbox.ts';
import { sealProfileChunks } from './profile-chunks.ts';
import { t } from '../../shared/i18n/index.ts';
import { messageStates } from '../message-state/index.ts';
import { readDirectoryPreviews } from './directory-previews.ts';
import { optionalSentAt } from '../../shared/message-presentation/index.ts';
import { knownPeerProfile } from './known-profile.ts';
import { readBackupWindow } from './backup-window.ts';
import {
  historyRecord,
  historyPeers,
  searchHistory,
} from '../local-history/index.ts';
import { base64 } from '../../shared/account/index.ts';
import { openStoredAttachment } from '../attachments/index.ts';
import { searchMessages } from '../message-search/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { personalRemoval, verifyRemoval } from '../../shared/backups/index.ts';
import {
  attachmentContent,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import {
  downloadAttachment,
  downloadSealedAttachment,
  forgetAttachment,
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
import type { HistoryUpdate } from '../message-visibility/index.ts';
import {
  localGet,
  localPut,
  localDelete,
  sealLocal,
  openLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { TextDraft } from '../text-send/index.ts';
import { profileCard } from '../message-profile/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
import {
  MegolmDecryptionError,
  DecryptionErrorCode,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { backupMessageApi } from '../message-api/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import {
  messagePeer,
  verifiedReceipt,
  verifiedReceiptHash,
} from './index-sync.ts';
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
export type {
  MessageView,
  ConversationProjection,
  ReceiptCommit,
} from './message-view.ts';
interface MessageControllerEvents extends MessageReaderEvents {
  recovery?: () => void;
  published?: (value: { id: string; peer: string }) => void;
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
  transportPending = false;
  private readonly receiver = new MessageSyncReceiver();
  private readonly recoveryAlarm: MessageRecoveryWakeup;
  private recoveryWake = 0;
  private recoveryHandled = 0;
  private readonly audiences = new PrivateAudiences();
  synchronizationIssues: readonly import('./sync-progress.ts').PendingConversation[] =
    [];
  private prefetchAbort: AbortController | null = null;
  private readonly outbox: MessageOutbox;
  private readonly reader: ConversationReader;
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    publish: (
      rows: readonly MessageView[] | null,
      update: HistoryUpdate,
      projection: ConversationProjection,
    ) => void,
    events:
      | MessageControllerEvents
      | ((value: { id: string; peer: string }) => void) = {},
  ) {
    this.access = access;
    this.sync = sync;
    this.identities = new PeerIdentity(sync);
    this.recoveryAlarm = new MessageRecoveryWakeup(
      typeof events === 'function' ? () => {} : (events.recovery ?? (() => {})),
    );
    const published =
      typeof events === 'function' ? events : (events.published ?? (() => {}));
    this.reader = new ConversationReader({
      access,
      publish,
      events: typeof events === 'function' ? {} : events,
      authority: {
        session: () => this.session,
        current: () => this.generation,
        guard: (generation) => this.guard(generation),
        savePins: (options) => this.savePins(options),
      },
      packets: {
        cached: (a, snapshot, item) => this.readCached(a, snapshot, item),
        missing: (read) => this.readMissing(read),
        remove: (read, item) => this.indexItem(read, item),
        offlineProfiles: (a, peer) => this.offlineProfiles(a, peer),
      },
    });
    this.outbox = new MessageOutbox({
      access,
      published,
      authority: {
        session: () => this.session,
        current: () => this.generation,
        guard: (generation) => this.guard(generation),
        pinsLoaded: (generation) => this.pinsGeneration === generation,
        loadPins: (options) => this.loadPins(options),
        savePins: (options) => this.savePins(options),
        history: (a, generation, peer) =>
          this.history({ a, generation }, peer, null),
        encryption: async (a, generation) => {
          const own = await this.recoverable(a, generation);
          const machine = await this.machine(a, generation);
          return { own, machine };
        },
      },
    });
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
      await measureWork(this, 'sdk/prepare', () => machine.prepare(c.a));
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
    this.reader.setProfile(session);
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
    this.synchronizationIssues = [];
    this.recoveryAlarm.clear();
    this.previewGeneration++;
    this.pinsGeneration = -1;
    this.pauseSynchronization();
    this.audiences.clear();
    this.generation++;
    this.reader.close();
  }
  pause(scope: 'account' | 'conversation' = 'account'): void {
    if (scope === 'account') {
      this.previewGeneration++;
      this.audiences.clear();
    }
    this.pinsGeneration = -1;
    if (scope === 'account') this.pauseSynchronization();
    this.reader.pause(scope);
  }
  removed(): void {
    this.previewGeneration++;
    this.pauseSynchronization();
    this.reader.removed();
  }
  hideFailedRead(error: unknown): void {
    if (expectedInterruption(error)) return;
    if (interruptedMessageRead(error)) this.pause('conversation');
    else this.hide();
  }
  hide(): void {
    this.audiences.clear();
    this.generation++;
    this.recoveryAlarm.clear();
    this.previewGeneration++;
    this.pinsGeneration = -1;
    this.pauseSynchronization();
    this.reader.hide();
  }
  hint(): void {
    this.recoveryWake++;
    this.reader.hint();
  }
  appended(): void {
    this.recoveryWake++;
    this.reader.appended();
  }
  handOffAdvance(): boolean {
    return this.reader.handOffAdvance();
  }
  setLiveConnected(connected: boolean): void {
    if (connected) this.recoveryWake++;
    if (!connected) this.previewGeneration++;
    this.reader.setLiveConnected(connected);
  }
  canRestore(peer: string): boolean {
    return this.reader.canRestore(peer);
  }
  restoreSelected(): boolean {
    return this.reader.restoreSelected();
  }
  select(peer: string | null): void {
    this.pinsGeneration = -1;
    this.reader.select(peer);
  }
  /** The next open or sync of the selected conversation reaches one page
   * further back, without hiding what is shown meanwhile. */
  requestOlder(): void {
    this.reader.requestOlder();
  }
  olderAvailable(shown: number): boolean {
    return this.reader.olderAvailable(shown);
  }

  private guard(generation: number): void {
    if (generation !== this.generation) throw new WorkInterruption('session');
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
    return measureWork(this, 'sdk/open', () =>
      openMessageMachine(a, api, this.audiences),
    );
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
          await measureWork(this, 'sdk/prepare', () => machine.prepare(a));
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
  /** Startup refreshes the vault first so the contact list can render from its
   * verified heads; identity pins are opened afterwards from that same state,
   * still before any history read or send can use them. */
  async synchronizeIdentities(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    await this.identities.synchronize(options);
    this.guard(generation);
  }
  async loadSynchronizedPins(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    await this.identities.loadCurrent(options);
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
  compose(
    peer: string,
    text: string,
    kind: MessagePacket['kind'] = 'text',
    provided?: string | { id: string; relation: MessageRelation },
  ): Promise<void> {
    return this.outbox.compose(peer, text, kind, provided);
  }
  queueText(input: TextDraft): Promise<void> {
    return this.outbox.queueText(input);
  }
  composeAttachment(
    peer: string,
    selection: AttachmentSelection,
    caption: string,
  ): Promise<void> {
    return this.outbox.composeAttachment(peer, selection, caption);
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
      reading = this.reader.captureMedia(view);
    const guard = () => {
      this.guard(generation);
      reading.guard();
    };
    guard();
    const content = attachmentContent(JSON.parse(view.text) as unknown),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Thumbnail missing.');
    if (view.archived) return this.historicalMedia(view, thumbnail, guard);
    const work = async (a: VaultAuthority) => {
      const snapshot = reading.snapshot();
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
  shareProfile(peer: string, card: ProfileCard): Promise<void> {
    return this.outbox.shareProfile(peer, card);
  }
  sendPending(options: VaultWorkOptions = {}): Promise<void> {
    return this.outbox.sendPending(options);
  }
  synchronize(options: VaultWorkOptions = {}): Promise<MessageWorkResult> {
    return this.reader.synchronize(options);
  }
  private async readMissing(
    c: MessageWindowRead,
  ): Promise<Map<string, MessageView>> {
    const items = c.items;
    const machine = c.turn
      ? await c.turn.sdk()
      : await this.machine(c.a, c.generation, c.api);
    try {
      if (!c.turn) {
        await measureWork(this, 'sdk/prepare', () => machine.prepare(c.a));
        await this.receive(c.a, machine, c.generation, c.api);
      }
      return await this.readBatch({
        ...c,
        items,
        machine,
        skipUnavailable: false,
      });
    } finally {
      if (!c.turn) machine.close();
    }
  }

  async archivedPeers(after: string | null, work: VaultWorkOptions = {}) {
    if (this.session && navigator.onLine)
      return this.access.withVault(false, (a) => historyPeers(a, after), work);
    const locator = await localLocator();
    if (!locator) return { items: [], next: null };
    return this.access.withLocalVault(locator, (a) => historyPeers(a, after));
  }
  openArchive(peer: string): Promise<void> {
    return this.reader.openArchive(peer);
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
      await this.outbox.forgetDeleted(c.a.session.accountId, item.id);
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
      const draft = await sealProfileChunks(a, text);
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
    await measureWork(this, 'sdk/key-inbox', () =>
      this.drainKeyInbox(a, machine, api),
    );
  }
  /** Up to 16 Olm batches of 16; ACK only after the SDK persisted each event. */
  private async drainKeyInbox(
    a: VaultAuthority,
    machine: MessageCrypto,
    api: (op: string, data: Record<string, unknown>) => Promise<unknown>,
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
    this.prefetchAbort?.abort(new WorkInterruption('scheduler'));
  }
  /** One global page per idle turn; user actions abort its network requests.
   * No views/read receipts are published, and the SDK lock is released each turn. */
  async synchronizeAll(
    signal: AbortSignal,
    work: VaultWorkOptions = {},
  ): Promise<boolean> {
    const generation = this.generation,
      abort = new AbortController();
    this.prefetchAbort = abort;
    const combined = AbortSignal.any([signal, abort.signal]);
    const guard = () => {
      combined.throwIfAborted();
      this.guard(generation);
    };
    try {
      return await this.access.withVault(
        false,
        async (a) => {
          guard();
          const api = (op: string, data: Record<string, unknown>) =>
            messageApi(a, op, data, { guard, signal: combined });
          const hints = this.reader.hintVersion,
            recoveryWake = this.recoveryWake;
          const turn = new MessageReceiveTurn<MessageView>({
            api,
            guard,
            cache: async (snapshot, item) => {
              const view = await this.readCached(a, snapshot, item);
              return view ? retainedMessageView(view) : null;
            },
            open: async () => {
              const machine = await this.machine(a, generation, api);
              try {
                await measureWork(this, 'sdk/prepare', () =>
                  machine.prepare(a),
                );
                await this.receive(a, machine, generation, api);
                return machine;
              } catch (error: unknown) {
                machine.close();
                throw error;
              }
            },
          });
          try {
            const more = await this.receiver.step({
              account: a.session.accountId,
              device: a.session.deviceId,
              wakeRecovery: recoveryWake !== this.recoveryHandled,
              invalidate: () => this.reader.invalidateReceiver(),
              status: (pending) => {
                this.synchronizationIssues = pending;
              },
              observed: (discovered) =>
                this.reader.observeDurableCut(discovered),
              failureReason: (error) =>
                error instanceof MegolmDecryptionError &&
                error.code === DecryptionErrorCode.MissingRoomKey
                  ? 'key'
                  : 'verification',
              api,
              guard,
              load: () => loadSyncProgress(a),
              save: (state) => saveSyncProgress(a, state),
              remove: (item) =>
                this.indexItem({ a, generation, selected: null, api }, item),
              prepare: (snapshot, items) => turn.prepare(snapshot, items),
              finish: () => turn.flush(),
              read: (snapshot, items) =>
                this.reader
                  .readWindow({
                    a,
                    generation,
                    api: turn.api,
                    snapshot,
                    items,
                    turn,
                  })
                  .then((views) => views.map(retainedMessageView)),
              commit: (batch) => {
                this.synchronizationIssues = batch.pending;
                this.recoveryAlarm.wait(batch.pending);
                this.reader.commitInboxBatch(batch, hints);
              },
              suspendedState: messageStates.suspended,
            });
            this.recoveryHandled = recoveryWake;
            return more;
          } finally {
            turn.close();
          }
        },
        work,
      );
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
  probe(options: VaultWorkOptions = {}): Promise<boolean> {
    return this.reader.probe(options);
  }

  openOffline(peer: string | null): Promise<void> {
    return this.reader.openOffline(peer);
  }
  private async offlineProfiles(
    a: VaultAuthority,
    peer: string,
  ): Promise<MessageView[]> {
    const views: MessageView[] = [];
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
    return views;
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
      snapshot = this.reader.searchSnapshot();
    const guard = () => this.guard(generation);
    const work = async (a: VaultAuthority) => {
      const check = async () => {
        guard();
        if (!a.offline && snapshot() !== 'local')
          await messageApi(
            a,
            'confirm',
            { snapshot: JSON.parse(snapshot()!) as unknown },
            guard,
          );
      };
      await check();
      const position = searchPosition(after);
      if (position.archived || snapshot() === 'local') {
        const archived = await searchHistory(
          a,
          query,
          position.archived ? position.after : null,
          guard,
        );
        return { ...archived, next: archiveToken(archived.next) };
      }
      const result = await searchMessages({ a, query, after, guard });
      if (result.next === null) result.next = archiveStart;
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
    await this.outbox.discard(id);
    notifyMessageControls();
  }
  pendingTexts(peer: string, ids: readonly string[]): Promise<TextDraft[]> {
    return this.outbox.pendingTexts(peer, ids);
  }
  pending(): Promise<{ id: string; peer: string; text?: boolean }[]> {
    return this.outbox.pending();
  }
}
