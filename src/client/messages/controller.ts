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
import { attachmentContent } from '../../shared/attachments/index.ts';
import {
  stageAttachment,
  uploadAttachments,
  downloadAttachment,
  downloadSealedAttachment,
  forgetAttachment,
  retainAttachment,
} from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
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
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
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
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import { encodeProfileCard, profileCard } from '../message-profile/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
import {
  MegolmDecryptionError,
  DecryptionErrorCode,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { messageApi, backupMessageApi } from '../message-api/index.ts';
import {
  MessageIndex,
  VerifiedWindow,
  MessagePrefetch,
  assertMessagePage,
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
export interface MessageView {
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
  private readonly identities: PeerIdentity;
  private initializedDirectory = '';
  private readonly histories = new Map<
    string,
    import('../../shared/devices/index.ts').DirectoryEvent[]
  >();
  private selected: string | null = null;
  private before: number | null = null;
  private oldest: number | null = null;
  transportPending = false;
  private confirmed: { snapshot: string; views: MessageView[] } | null = null;
  private readonly index = new MessageIndex();
  private readonly prefetch = new MessagePrefetch();
  private prefetchAbort: AbortController | null = null;
  private readonly verified = new VerifiedWindow<MessageView>();
  private readonly offlineIndex = new OfflineIndex();
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    publish: (
      rows: readonly MessageView[] | null,
      update: HistoryUpdate,
    ) => void,
  ) {
    this.access = access;
    this.sync = sync;
    this.identities = new PeerIdentity(sync);
    this.visibility = new MessageVisibility(publish);
  }
  setSession(session: AccountSession | null): void {
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
    this.pauseSynchronization();
    this.prefetch.reset();
    this.confirmed = null;
    this.verified.clear();
    this.generation++;
    this.visibility.close();
    this.index.reset();
    this.offlineIndex.reset();
  }
  hide(): void {
    this.pauseSynchronization();
    this.index.reset();
    this.confirmed = null;
    this.verified.clear();
    this.visibility.close();
  }
  /** A normal wakeup retains the last verified view, but cannot publish new rows. */
  hint(): void {
    this.visibility.hint();
  }
  select(peer: string | null, older = false): void {
    this.pauseSynchronization();
    this.confirmed = null;
    this.verified.clear();
    this.generation++;
    this.visibility.close();
    this.offlineIndex.reset();
    this.selected = peer;
    this.before = older ? this.oldest : null;
  }
  private guard(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Sessão ou sincronização alterada.');
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
    if (!event) throw new Error('Autoridade da recuperação ausente.');
    await verifyRecoveryKey(key, event);
    const secret = await openRecoveryKey(key, a);
    secret.free();
    return key;
  }
  async initialize(): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(false, async (a) => {
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
    });
  }
  async loadPins(): Promise<void> {
    await this.identities.load();
  }
  async savePins(): Promise<void> {
    await this.identities.save();
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
    if (!session) throw new Error('Sessão encerrada.');
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
        throw new Error('Sincronize antes de abrir o anexo.');
    };
    guard();
    const content = attachmentContent(JSON.parse(view.text) as unknown),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Miniatura ausente.');
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
      if (!locator) throw new Error('Cópia local não autorizada.');
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
    if (!file) throw new Error('Miniatura ausente.');

    const work = async (a: VaultAuthority) => {
      const row = await historyRecord(a, 'media', file.ref.id);
      guard();
      if (
        !row ||
        row.type !== 'media' ||
        row.hash !== file.ref.hash ||
        row.message !== view.id
      )
        throw new Error('Mídia não está disponível no histórico importado.');
      return openStoredAttachment(
        file,
        base64(row.bytes, 3_000_000),
        thumbnail,
        thumbnail || content.image,
      );
    };
    if (navigator.onLine) return this.access.withVault(false, work);
    const locator = await localLocator();
    if (!locator) throw new Error('Histórico local não autorizado.');
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
    const session = this.session;
    if (!session) return;
    const serialized = encodeProfileCard(card),
      hash = await digest(serialized),
      name = `profile-sent:${peer}`;
    if ((await localGet<string>(session.accountId, name)) === hash) return;
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
    const generation = this.generation;
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

  async sendPending(): Promise<void> {
    if (!(await this.pending()).length) return;
    const generation = this.generation;
    // Persist the first trusted identity before distributing a room key or
    // accepting ciphertext. VaultSync owns a separate lock, so save outside it.
    await this.access.withVault(false, async (a) => {
      const page = await localPage<Outbox>(
        a.session.accountId,
        'outbox:',
        null,
      );
      for (const peer of new Set(page.items.map((row) => row.value.peer)))
        await this.history({ a, generation }, peer, null);
    });
    await this.savePins();
    this.guard(generation);
    await this.access.withVault(false, async (a) => {
      this.guard(generation);
      const api = (op: string, d: Record<string, unknown>) =>
        messageApi(a, op, d, () => this.guard(generation));
      const own = await this.recoverable(a, generation),
        machine = await this.machine(a, generation);
      try {
        const page = await localPage<Outbox>(
          a.session.accountId,
          'outbox:',
          null,
        );
        for (const { name, value } of page.items)
          await this.sendOne({ a, api, own, machine, generation, name, value });
      } finally {
        machine.close();
      }
    });
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
      await localDelete(a.session.accountId, name);
      await this.retainOutbox(a, value);
      return;
    }
    const history = await this.history({ a, generation }, value.peer, null),
      last = history.at(-1);
    if (!last) throw new Error('Diretório do contato ausente.');
    if (
      !value.packet ||
      value.packet.deviceId !== a.session.deviceId ||
      value.packet.senderDirectory !== a.directory ||
      value.packet.recipientRevision !== last.revision
    ) {
      const raw = await api('recovery-peer', { accountId: value.peer });
      if (raw === null)
        throw new Error(
          'O contato precisa abrir o aplicativo para preparar sua recuperação antes da primeira mensagem.',
        );
      const peer = recoveryKey(raw),
        event = history[peer.authorityRevision - 1];
      if (!event) throw new Error('Recuperação do contato divergente.');
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
    await this.retainOutbox(a, value);
    await localDelete(a.session.accountId, name);
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
  async synchronize(): Promise<void> {
    this.confirmed = null;
    const token = this.visibility.refresh(),
      generation = this.generation,
      selected = this.selected;
    try {
      const staged = await this.access.withVault(false, async (a) => {
        const api = (op: string, d: Record<string, unknown>) =>
            messageApi(a, op, d, () => this.guard(generation)),
          snapshot = await api('snapshot', {});
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
        return { views: ordered, snapshot, items, window };
      });
      await this.savePins();
      this.guard(generation);
      this.oldest =
        staged.items.filter((item) => item.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.confirmed = {
        snapshot: JSON.stringify(staged.snapshot),
        views: staged.views,
      };
      await this.refreshDelivery(staged.snapshot, generation);
      await this.access.withVault(false, async (a) => {
        if (!this.confirmed) throw new Error('Histórico alterado.');
        this.confirmed.views = await this.includeHistory(
          a,
          this.confirmed.views,
          generation,
        );
      });
      this.oldest =
        this.confirmed.views.filter(
          (v) => !v.relation && v.kind !== 'profile',
        )[0]?.sequence ?? this.before;
      this.visibility.stage(token, this.confirmed.views);
      await this.confirmVisible(token, staged.snapshot, generation);
      this.guard(generation);
      this.verified.remember(staged.snapshot, staged.window, staged.views);
    } catch (error: unknown) {
      this.index.reset();
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
  ): Promise<void> {
    await this.visibility.confirm(token, async () => {
      await this.access.withVault(false, (a) =>
        messageApi(a, 'confirm', { snapshot }, () => this.guard(generation)),
      );
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
      state: 'Histórico local',
    };
  }
  async archivedPeers(after: string | null) {
    if (this.session && navigator.onLine)
      return this.access.withVault(false, (a) => historyPeers(a, after));
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
        if (!locator) throw new Error('Histórico local indisponível.');
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
      await localDelete(c.a.session.accountId, `outbox:${item.id}`);
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
        text: 'Entrega suspensa: é necessário novo consentimento.',
        state: 'Suspensa',
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
    if (!event) throw new Error('Mensagem divergente do índice.');
    const archive = packet.archives.find(
      (x) => x.accountId === a.session.accountId,
    );
    if (!archive) throw new Error('Arquivo recuperável ausente.');
    let rawKey = c.keys.get(archive.keyId);
    if (!rawKey) {
      rawKey = recoveryKey(await api('recovery-key', { id: archive.keyId }));
      c.keys.set(archive.keyId, rawKey);
    }
    const text = await this.decryptPacket({
      a,
      machine,
      packet,
      event,
      key: rawKey,
    });
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
    });
    if (c.acknowledge) await c.acknowledge(packet.id, item.hash);
    else await api('acknowledge', { id: packet.id, hash: item.hash });
    return this.viewFromItem(a, item, text);
  }
  private viewFromItem(
    a: VaultAuthority,
    item: MessageItem,
    text: string,
  ): MessageView {
    return {
      kind: item.kind,
      ...(item.relation ? { relation: item.relation } : {}),
      id: item.id,
      hash: item.hash,
      author: item.sender,
      sequence: item.sequence,
      peer: messagePeer(a.session.accountId, item),
      own: item.sender === a.session.accountId,
      text,
      state: item.queue_active
        ? 'Aceita · entrega por aparelho pendente'
        : 'Recebida e preservada',
    };
  }
  private async decryptPacket(c: {
    a: VaultAuthority;
    machine: MessageCrypto;
    packet: MessagePacket;
    event: import('../../shared/devices/index.ts').DirectoryEvent;
    key: RecoveryKey;
  }): Promise<string> {
    const { a, machine, packet, event } = c,
      archive = packet.archives.find(
        (x) => x.accountId === a.session.accountId,
      );
    if (!archive) throw new Error('Arquivo recuperável ausente.');
    try {
      return await machine.decrypt({ packet, senderEvent: event });
    } catch (error: unknown) {
      if (
        !(error instanceof MegolmDecryptionError) ||
        error.code !== DecryptionErrorCode.MissingRoomKey
      )
        throw error;
      const key = await openRecoveryKey(c.key, a);
      try {
        return await machine.decrypt({
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
  }): Promise<void> {
    const { a, packet, text, peer, own, item } = c;
    const verification = await sealLocal(
      a,
      packet.id,
      verifiedReceipt(c.snapshot, item, await digest(text)),
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
        throw new Error('Caixa Olm inválida.');
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
    const hash = verifiedReceiptHash(
      await openLocal(a, cached.verification),
      snapshot,
      item,
    );
    if (hash === null) return null;
    if ((await digest(cached.text)) !== hash)
      throw new Error('Conteúdo local divergente do pacote verificado.');
    return this.viewFromItem(a, item, cached.text);
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
    const views = new Map<string, MessageView>(),
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
        c.guard?.();
        this.guard(c.generation);
        if (op !== 'object') return c.api(op, data);
        const id = String(data['id']);
        if (response.packets.has(id))
          return Promise.resolve(response.packets.get(id));
        const status = response.unavailable.get(id);
        return Promise.reject(
          new AccountError(
            status ?? 410,
            'Mensagem indisponível sob a autorização atual.',
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
        c.guard?.();
        this.guard(c.generation);
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
    if (items.length > 32) throw new Error('Lote de backup excedido.');
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
          throw new Error('Conta alterada.');
        const api = (op: string, data: Record<string, unknown>) =>
          messageApi(a, op, data, { guard, signal: combined });
        const snapshot = await api('snapshot', {}),
          after = this.prefetch.cursor(snapshot);
        if (after === null) return false;
        const page = messageItems(await api('page', { snapshot, after }));
        assertMessagePage(page, after);
        const missing: MessageItem[] = [];
        for (const item of page.items) {
          guard();
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
      if (!file) throw new Error('Miniatura ausente.');
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
  async probe(): Promise<boolean> {
    const token = this.visibility.refresh(
        this.confirmed ? 'delivery' : 'history',
      ),
      generation = this.generation;
    try {
      const snapshot = await this.access.withVault(false, (a) =>
        messageApi(a, 'snapshot', {}, () => this.guard(generation)),
      );
      this.guard(generation);
      if (this.confirmed?.snapshot === JSON.stringify(snapshot)) {
        await this.refreshDelivery(snapshot, generation);
        this.visibility.stage(token, this.confirmed.views);
        await this.confirmVisible(token, snapshot, generation);
        return false;
      }
      this.confirmed = null;
      this.visibility.discard(token);
      return true;
    } catch (error: unknown) {
      this.confirmed = null;
      this.verified.clear();
      this.visibility.fail(token);
      throw error;
    }
  }
  private async refreshDelivery(
    snapshot: unknown,
    generation: number,
  ): Promise<void> {
    const confirmed = this.confirmed;
    if (!confirmed) return;
    const raw = await this.access.withVault(false, async (a) => {
      const result: unknown[] = [];
      const onlineViews = confirmed.views.filter((v) => !v.archived);
      for (let offset = 0; offset < onlineViews.length; offset += 18) {
        const batch = await messageApi(
          a,
          'delivery',
          {
            snapshot,
            ids: onlineViews.slice(offset, offset + 18).map((view) => view.id),
          },
          () => this.guard(generation),
        );
        if (!Array.isArray(batch))
          throw new Error('Estado de entrega inválido.');
        const values: unknown[] = batch;
        result.push(...values);
      }
      return result;
    });
    if (!Array.isArray(raw)) throw new Error('Estado de entrega inválido.');
    const states = new Map(
      raw.map((value) => {
        const row = object(value);
        if (
          typeof row['queue_active'] !== 'boolean' ||
          typeof row['recipient_received'] !== 'boolean'
        )
          throw new Error('Estado de entrega inválido.');
        return [
          String(row['id']),
          {
            hash: String(row['hash']),
            pending: row['queue_active'],
            received: row['recipient_received'],
          },
        ] as const;
      }),
    );
    confirmed.views = confirmed.views.map((view) => {
      if (view.archived) return view;
      const state = states.get(view.id);
      if (!state || state.hash !== view.hash)
        throw new Error('Estado de entrega divergente.');
      return {
        ...view,
        ...(view.state === 'Suspensa'
          ? {}
          : {
              delivery: state.received
                ? ('received' as const)
                : ('accepted' as const),
            }),
        state:
          view.state === 'Suspensa'
            ? view.state
            : state.pending
              ? 'Aceita · entrega por aparelho pendente'
              : 'Recebida e preservada',
      };
    });
  }
  async openOffline(peer: string | null): Promise<void> {
    if (navigator.onLine)
      throw new Error('Conectado: sincronize antes de abrir o histórico.');
    const token = this.visibility.begin(),
      generation = this.generation,
      locator = await localLocator();
    if (!locator)
      throw new Error('Não há cópia local autorizada neste aparelho.');
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
            text: await openLocal(a, value),
            hash: value.hash,
            state: 'Cópia local offline · estado remoto ainda não conferido',
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
        state: 'Perfil recebido · cópia local offline',
      });
    }
  }
  async remove(view: MessageView): Promise<void> {
    this.close();
    notifyMessageControls();
    const generation = this.generation;
    await this.access.withVault(false, (a) =>
      messageApi(
        a,
        'delete',
        { id: view.id, hash: view.hash, revision: a.events.length },
        () => this.guard(generation),
      ),
    );
    notifyMessageControls();
  }
  async search(query: string, after: string | null) {
    const generation = this.generation,
      confirmed = this.confirmed;
    if (navigator.onLine && !confirmed)
      throw new Error('Sincronize antes de buscar; o histórico está oculto.');
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
    if (!locator) throw new Error('Histórico local indisponível.');
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
          'Reconecte para cancelar a reserva remota deste anexo.',
        );
      const accepted = await this.discardRemote(a, row, generation);
      if (row.kind === 'attachment') {
        if (!a.offline && !accepted)
          await messageApi(a, 'attachment-cancel', { message: id }, () =>
            this.guard(generation),
          );
        await forgetAttachment(a.session.accountId, id);
      }
      await localDelete(a.session.accountId, `outbox:${id}`);
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
          'Reconecte para confirmar a exclusão de um envio que pode ter sido aceito.',
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
  async pending(): Promise<{ id: string; peer: string }[]> {
    const session = this.session;
    if (!session) return [];
    return (
      await localPage<Outbox>(session.accountId, 'outbox:', null)
    ).items.map((x) => ({ id: x.value.id, peer: x.value.peer }));
  }
}
