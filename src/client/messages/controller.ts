import { attachmentContent } from '../../shared/attachments/index.ts';
import {
  stageAttachment,
  uploadAttachments,
  downloadAttachment,
  forgetAttachment,
  retainAttachment,
} from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { initAsync, StoreHandle } from '@matrix-org/matrix-sdk-crypto-wasm';
import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  verifyHistory,
} from '../../shared/devices/index.ts';
import {
  messagePacket,
  recoveryKey,
  verifyRecoveryKey,
} from '../../shared/messages/index.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';
import { addressBookEntry } from '../../shared/contacts/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
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
import {
  localGet,
  localPut,
  localDelete,
  localPage,
  localStoreKey,
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
import { messageApi } from './transport.ts';
import { MessageIndex } from './index-sync.ts';
import { OfflineIndex } from './offline-index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
import { peerHistory, pinFor, verifyDeletion } from './history.ts';
import type { MessageItem, PeerPin } from './history.ts';
export interface MessageView {
  kind: MessagePacket['kind'];
  id: string;
  peer: string;
  own: boolean;
  text: string;
  state: string;
  hash: string;
}
interface Outbox {
  id: string;
  peer: string;
  draft: LocalCipher[];
  kind: MessagePacket['kind'];
  packet: MessagePacket | null;
  transferStarted?: boolean;
}
interface ProfileCache {
  id: string;
  peer: string;
  own: boolean;
  sequence: number;
  hash: string;
  draft: LocalCipher[];
}
/** Authority serializes SDK/IDB mutations across tabs; views are published only after the final server check. */
export class Messages {
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private readonly visibility: MessageVisibility<MessageView>;
  private session: AccountSession | null = null;
  private generation = 0;
  private readonly pins = new Map<string, PeerPin>();
  private readonly newPins = new Map<string, PeerPin>();
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
  private readonly offlineIndex = new OfflineIndex();
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    publish: (rows: readonly MessageView[] | null) => void,
  ) {
    this.access = access;
    this.sync = sync;
    this.visibility = new MessageVisibility(publish);
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId !== this.session?.accountId ||
      session?.csrf !== this.session?.csrf ||
      session?.deviceId !== this.session?.deviceId
    ) {
      this.close();
      this.pins.clear();
      this.newPins.clear();
      this.histories.clear();
    }
    this.session = session;
  }
  close(): void {
    this.confirmed = null;
    this.generation++;
    this.visibility.close();
    this.index.reset();
    this.offlineIndex.reset();
  }
  hide(): void {
    this.confirmed = null;
    this.visibility.close();
  }
  select(peer: string | null, older = false): void {
    this.close();
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
  ): Promise<MessageCrypto> {
    await initAsync('/matrix-crypto-18.9.0.wasm');
    const key = await localStoreKey(a);
    try {
      const store = await StoreHandle.openWithKey(
        `0xdmme-olm-${a.session.accountId}-${a.session.deviceId}`,
        key,
      );
      return await MessageCrypto.create({
        accountId: a.session.accountId,
        deviceId: a.session.deviceId,
        store,
        transport: (op, data) =>
          messageApi(a, op, data, () => this.guard(generation)),
      });
    } finally {
      key.fill(0);
    }
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
      await this.recoverable(a, generation);
      const machine = await this.machine(a, generation);
      try {
        await machine.prepare(a);
      } finally {
        machine.close();
      }
    });
  }
  async loadPins(): Promise<void> {
    await this.sync.refresh();
    if (!this.sync.complete)
      throw new Error(
        'Continue carregando o índice do cofre antes de conferir as identidades das mensagens.',
      );
    for (const entry of [...this.sync.currentHeads().values()].flat()) {
      await this.loadPinEntry(entry);
    }
  }
  private async loadPinEntry(
    entry: import('../vault-sync/index.ts').VaultEntry,
  ): Promise<void> {
    if (entry.change.kind === 'address-book') {
      const stored = addressBookEntry(
        JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
      );
      if (stored.accountId && stored.identity && stored.directory) {
        this.acceptPin(stored.accountId, {
          fingerprint: stored.identity,
          directory: stored.directory,
          revision: stored.identityRevision,
        });
      }
      return;
    }
    if (
      entry.change.kind !== 'contact' ||
      entry.change.label !== 'Identidade para mensagens'
    )
      return;
    const value = object(
        JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
      ),
      pin = object(value['pin']);
    const id = String(value['accountId']),
      next = {
        fingerprint: fingerprint(pin['fingerprint']),
        directory: fingerprint(pin['directory']),
        revision: integer(pin['revision'], 128),
      };
    this.acceptPin(id, next);
  }
  private acceptPin(id: string, next: PeerPin): void {
    const old = this.pins.get(id);
    if (old && old.fingerprint !== next.fingerprint)
      throw new Error('Identidades fixadas em conflito.');
    if (
      old &&
      old.revision === next.revision &&
      old.directory !== next.directory
    )
      throw new Error('Diretórios fixados divergentes.');
    if (!old || old.revision < next.revision) this.pins.set(id, next);
  }
  async savePins(): Promise<void> {
    for (const [accountId, pin] of this.newPins) {
      const previous = [...this.sync.currentHeads().values()]
        .flat()
        .filter(
          (e) =>
            e.change.kind === 'contact' &&
            e.change.entity === accountId &&
            e.change.label === 'Identidade para mensagens',
        );
      await this.sync.save({
        change: {
          version: 1,
          entity: accountId,
          kind: 'contact',
          parents: previous.map((e) => e.commit.id),
          label: 'Identidade para mensagens',
        },
        value: JSON.stringify({ accountId, pin }),
      });
      this.pins.set(accountId, pin);
      this.newPins.delete(accountId);
    }
  }
  private async history(
    a: VaultAuthority,
    generation: number,
    account: string,
    through: number | null,
  ) {
    if (account === a.session.accountId) {
      await verifyHistory(a.events, account);
      return a.events;
    }
    const cached = this.histories.get(account);
    if (through !== null && cached && cached.length >= through)
      return cached.slice(0, through);
    const history = await peerHistory(
        (op, d) => messageApi(a, op, d, () => this.guard(generation)),
        account,
        through,
        this.pins.get(account) ?? null,
      ),
      pin = await pinFor(history),
      old = this.pins.get(account);
    this.histories.set(account, history);
    if (this.histories.size > 16)
      this.histories.delete(this.histories.keys().next().value ?? '');
    if (!old || pin.revision > old.revision) {
      this.pins.set(account, pin);
      this.newPins.set(account, pin);
    }
    return history;
  }
  async compose(
    peer: string,
    text: string,
    kind: MessagePacket['kind'] = 'text',
    providedId?: string,
  ): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(!navigator.onLine, async (a) => {
      this.guard(generation);
      const id = providedId ?? crypto.randomUUID(),
        draft = await this.sealDraft(a, id, text, kind),
        outbox: Outbox = { id, peer, draft, kind, packet: null };
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
      if (api) await api('confirm', { snapshot });
      guard();
      return bytes;
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
  private async sealDraft(
    a: VaultAuthority,
    id: string,
    text: string,
    kind: MessagePacket['kind'],
  ): Promise<LocalCipher[]> {
    if (kind === 'attachment') attachmentContent(JSON.parse(text) as unknown);
    if (kind !== 'profile') return [await sealLocal(a, id, text)];
    profileCard(JSON.parse(text) as unknown);
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
        await this.history(a, generation, peer, null);
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
    const history = await this.history(a, generation, value.peer, null),
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
    const token = this.visibility.begin(),
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
        const machine = await this.machine(a, generation);
        try {
          await machine.prepare(a);
          await this.receive(a, machine, generation);
          const window = items,
            views: MessageView[] = [];
          const context = {
            a,
            generation,
            api,
            snapshot,
            machine,
            window,
            histories: new Map<
              string,
              Awaited<ReturnType<Messages['history']>>
            >(),
            keys: new Map<string, RecoveryKey>(),
          };
          for (const item of window)
            views.push(await this.readOne(context, item));
          return { views, snapshot, items };
        } finally {
          machine.close();
        }
      });
      await this.savePins();
      await this.access.withVault(false, (a) =>
        messageApi(a, 'confirm', { snapshot: staged.snapshot }, () =>
          this.guard(generation),
        ),
      );
      this.guard(generation);
      this.oldest =
        staged.items.filter((item) => item.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.confirmed = {
        snapshot: JSON.stringify(staged.snapshot),
        views: staged.views,
      };
      this.visibility.stage(token, staged.views);
      this.visibility.complete(token);
      this.index.reset();
    } catch (error: unknown) {
      this.confirmed = null;
      this.visibility.fail(token);
      throw error;
    }
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
      before: this.before,
      deleted: (item) => this.indexItem(c, item),
    });
  }
  private async indexItem(
    c: { a: VaultAuthority; generation: number; selected: string | null },
    item: MessageItem,
  ): Promise<void> {
    if (item.deleted) {
      const history = await this.history(
        c.a,
        c.generation,
        item.sender,
        Number(item.deletion?.payload['revision']),
      );
      await verifyDeletion(item, history);
      await localDelete(c.a.session.accountId, `cache:${item.id}`);
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
    },
    item: MessageItem,
  ): Promise<MessageView> {
    try {
      return await this.readPacket(c, item);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 423) throw error;
      return {
        kind: 'text',
        id: item.id,
        peer: this.selected ?? '',
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
    },
    item: MessageItem,
  ): Promise<MessageView> {
    const { a, api, machine, snapshot } = c,
      packet = messagePacket(await api('object', { id: item.id, snapshot }));
    let history = c.histories.get(packet.sender);
    if (!history) {
      history = await this.history(
        a,
        c.generation,
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
    if (!event || (await digest(JSON.stringify(packet))) !== item.hash)
      throw new Error('Mensagem divergente do índice.');
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
    });
    await api('acknowledge', { id: packet.id, hash: item.hash });
    return {
      kind: packet.kind,
      id: packet.id,
      peer,
      own,
      text,
      hash: item.hash,
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
  }): Promise<void> {
    const { a, packet, text, peer, own, item } = c;
    if (packet.kind === 'profile') {
      profileCard(JSON.parse(text) as unknown);
      const draft = await this.sealDraft(a, packet.id, text, 'profile');
      await localPut(
        a.session.accountId,
        `profile:${packet.id}`,
        {
          id: packet.id,
          peer,
          own,
          sequence: item.sequence,
          hash: item.hash,
          draft,
        } satisfies ProfileCache,
        draft.reduce((bytes, chunk) => bytes + chunk.bytes.length, 0) + 512,
      );
      await localPut(
        a.session.accountId,
        `profile-current:${peer}:${own}`,
        packet.id,
        512,
      );
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
        peer,
        own,
        kind: packet.kind,
        sequence: item.sequence,
        hash: item.hash,
      },
      cipher.bytes.length + 512,
    );
  }
  private async receive(
    a: VaultAuthority,
    machine: MessageCrypto,
    generation: number,
  ): Promise<void> {
    this.transportPending = false;
    for (let batch = 0; batch < 16; batch++) {
      const raw = object(
          await messageApi(a, 'matrix-inbox', {}, () => this.guard(generation)),
        ),
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
      await messageApi(
        a,
        'matrix-received',
        {
          sequences: received.map((index) => object(items[index])['sequence']),
        },
        () => this.guard(generation),
      );
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
  async probe(): Promise<boolean> {
    const token = this.visibility.begin(),
      generation = this.generation;
    try {
      const snapshot = await this.access.withVault(false, (a) =>
        messageApi(a, 'snapshot', {}, () => this.guard(generation)),
      );
      if (this.confirmed?.snapshot === JSON.stringify(snapshot)) {
        await this.refreshDelivery(snapshot, generation);
        this.visibility.stage(token, this.confirmed.views);
        this.visibility.complete(token);
        return false;
      }
      return true;
    } catch (error: unknown) {
      this.confirmed = null;
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
    const raw = await this.access.withVault(false, (a) =>
      messageApi(
        a,
        'delivery',
        {
          snapshot,
          ids: confirmed.views.map((view) => view.id),
        },
        () => this.guard(generation),
      ),
    );
    if (!Array.isArray(raw)) throw new Error('Estado de entrega inválido.');
    const states = new Map(
      raw.map((value) => {
        const row = object(value);
        if (typeof row['queue_active'] !== 'boolean')
          throw new Error('Estado de entrega inválido.');
        return [
          String(row['id']),
          { hash: String(row['hash']), pending: row['queue_active'] },
        ] as const;
      }),
    );
    confirmed.views = confirmed.views.map((view) => {
      const state = states.get(view.id);
      if (!state || state.hash !== view.hash)
        throw new Error('Estado de entrega divergente.');
      return {
        ...view,
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
            id: value.id,
            peer: value.peer,
            own: value.own,
            text: await openLocal(a, value),
            hash: value.hash,
            state: 'Cópia local offline · estado remoto ainda não conferido',
          });
        }
        if (peer) await this.offlineProfiles(a, peer, views);
        this.oldest = cached[0]?.sequence ?? this.before;
        this.guard(generation);
        this.visibility.stage(token, views);
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
