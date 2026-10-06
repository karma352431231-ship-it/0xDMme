import {
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
import { MessageCrypto } from '../message-crypto/index.ts';
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
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import {
  readSocialDirectory,
  socialAuthority,
  pinSocialHistory,
} from './authority.ts';
import type { SocialApi, SocialDirectoryPage } from './authority.ts';

export interface SocialContext {
  authority: VaultAuthority;
  privateAuthority: VaultAuthority;
  api: SocialApi;
  machine: MessageCrypto;
}
export function dmMediaScope(account: string): string {
  return `dm-media:${account}`;
}
export class SocialDms {
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private generation = 0;
  private session: AccountSession | null = null;
  private readonly removals = new RemovalIndex();
  private machine: MessageCrypto | null = null;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.sync = sync;
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId &&
      session?.csrf === this.session?.csrf
    )
      return;
    this.generation++;
    this.session = session;
    this.removals.reset();
    this.close();
  }
  cancel(): void {
    this.generation++;
    this.close();
  }
  close(): void {
    this.machine?.close();
    this.machine = null;
  }
  private guard(generation: number): void {
    if (generation !== this.generation || !this.session)
      throw new Error('Sessão das DMs alterada.');
  }
  private privateApi(authority: VaultAuthority, generation: number): SocialApi {
    if (
      authority.session.accountId !== this.session?.accountId ||
      authority.session.deviceId !== this.session.deviceId
    )
      throw new Error('Autoridade de outra conta ou aparelho.');
    return (operation, payload) =>
      messageApi(authority, `dm-${operation}`, payload, () =>
        this.guard(generation),
      );
  }
  async request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const generation = this.generation;
    this.guard(generation);
    return this.access.withVault(false, (authority) =>
      this.privateApi(authority, generation)(operation, payload),
    );
  }
  async list(after: string | null) {
    return socialPage(await this.request('list', { after }));
  }
  async state(peer: string): Promise<SocialRelation | null> {
    const value = await this.request('state', { peer });
    return value === null ? null : socialRelation(value);
  }
  async initialize(): Promise<string> {
    return this.withCrypto(({ authority }) =>
      Promise.resolve(authority.session.accountId),
    );
  }
  private async secret(
    directory: SocialDirectoryPage,
    generation: number,
  ): Promise<string> {
    const wrapped = await this.request('secret-get', {});
    if (wrapped !== null)
      return this.access.withVault(false, (a) => this.openSecret(a, wrapped));
    const restored = await this.access.withVault(false, (a) =>
      historyRecord(a, 'dm-identity', directory.profile),
    );
    if (restored?.type === 'dm-identity') {
      const recovered = await this.access.withVault(false, (a) =>
        this.openSecret(a, JSON.parse(restored.value) as unknown),
      );
      return this.preserveSecret(recovered);
    }
    const deadline = Date.now() + 60_000;
    do {
      if (Date.now() > deadline)
        throw new Error('Sincronização do cofre das DMs não terminou.');
      await this.sync.refresh();
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
        'Recuperação das DMs tem versões concorrentes. Preserve as cópias antes de resolver.',
      );
    if (entries[0]) {
      const data = object(
        JSON.parse(await this.sync.open(entries[0].commit.id)) as unknown,
      );
      this.guard(generation);
      keys(data, ['secret']);
      if (base64(data['secret'], 32).length !== 32)
        throw new Error('Segredo das DMs inválido.');
      return this.preserveSecret(data['secret'] as string);
    }
    if (directory.events.length)
      throw new Error(
        'Segredo das DMs ausente do cofre. Restaure seu cofre antes de continuar.',
      );
    const secret = newSecret();
    await this.sync.save({
      change: {
        version: 1,
        entity: directory.profile,
        kind: 'contact',
        parents: [],
        label: 'Recuperação das DMs pelo @',
      },
      value: JSON.stringify({ secret }),
    });
    this.guard(generation);
    return this.preserveSecret(secret);
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
    if (base64(secret, 32).length !== 32)
      throw new Error('Segredo das DMs inválido.');
    return secret;
  }
  private async preserveSecret(secret: string): Promise<string> {
    const generation = this.generation;
    return this.access.withVault(false, async (a) => {
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
    });
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
  async withCrypto<T>(
    work: (input: {
      authority: VaultAuthority;
      privateAuthority: VaultAuthority;
      api: SocialApi;
      machine: MessageCrypto;
    }) => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    this.guard(generation);
    const directory = await readSocialDirectory(
      (op, data) => this.request(op, data),
      null,
    );
    const secret = await this.secret(directory, generation);
    this.guard(generation);
    return this.access.withVault(false, (privateAuthority) =>
      exclusive(`dm:${directory.profile}`, async () => {
        const api = this.privateApi(privateAuthority, generation);
        const current = await readSocialDirectory(api, null);
        const authority = await socialAuthority({
          privateAuthority,
          directory: current,
          secret,
          api,
          alias: await this.alias(privateAuthority, current),
        });
        this.guard(generation);
        this.close();
        const machine = await openMessageMachine(authority, (op, data) =>
          api(op, data),
        );
        try {
          this.guard(generation);
          this.machine = machine;
          await ensureMessageRecovery(authority, api);
          await machine.prepare(authority);
          await receiveSocialInbox(api, machine);
          return await work({ authority, privateAuthority, api, machine });
        } finally {
          machine.close();
          if (this.machine === machine) this.machine = null;
        }
      }),
    );
  }
  async send(peer: string, text: string, id: string): Promise<void> {
    if (!text.trim() || new TextEncoder().encode(text).length > 3_000_000)
      throw new Error('Texto vazio ou excedido.');
    await this.withCrypto(async (input) => {
      const { authority, privateAuthority, api } = input;
      const scope = `${privateAuthority.session.accountId}:${privateAuthority.session.deviceId}`,
        name = `dm-send:${peer}`;
      const hash = await digest(
          canonical([authority.session.accountId, peer, text]),
        ),
        old = await localGet<LocalCipher>(scope, name);
      let packet;
      if (old) {
        const held = object(
          JSON.parse(await openLocal(privateAuthority, old)) as unknown,
        );
        if (held['hash'] !== hash)
          throw new Error(
            'Há um envio pendente com outro texto. Retome o texto original antes de enviar uma alteração.',
          );
        packet = socialPacket(held['packet']);
      } else {
        packet = await this.encrypt({ ...input, peer, text, id });
        const row = await sealLocal(
          privateAuthority,
          crypto.randomUUID(),
          JSON.stringify({ hash, packet, text }),
        );
        await localPut(scope, name, row, row.bytes.length + 512);
      }
      if (
        !(await api('accepted', {
          id: packet.id,
          hash: await digest(canonical(packet)),
        }))
      ) {
        const recipient = await readSocialDirectory(api, peer);
        if (
          packet.senderRevision !== authority.events.length ||
          packet.recipientRevision !== recipient.events.length
        ) {
          packet = await this.encrypt({ ...input, peer, text, id: packet.id });
          const renewed = await sealLocal(
            privateAuthority,
            crypto.randomUUID(),
            JSON.stringify({ hash, packet, text }),
          );
          await localPut(scope, name, renewed, renewed.bytes.length + 512);
        }
        await api('publish', { packet });
      }
      await localDelete(scope, name);
    });
  }
  private async encrypt(input: {
    authority: VaultAuthority;
    api: SocialApi;
    machine: MessageCrypto;
    peer: string;
    text: string;
    id: string;
  }) {
    const { authority, api, machine, peer, id, text } = input;
    const peerDirectory = await readSocialDirectory(api, peer),
      own = await ensureMessageRecovery(authority, api),
      raw = await api('recovery-peer', { accountId: peer });
    if (raw === null)
      throw new Error(
        'O destinatário precisa abrir Mensagens pelo @ neste app para preparar sua recuperação E2EE.',
      );
    return machine.encrypt({
      authority,
      peerHistory: peerDirectory.events,
      recovery: [own, recoveryKey(raw)],
      id,
      text,
    });
  }
  async pending(peer: string): Promise<{ id: string; text: string } | null> {
    const generation = this.generation;
    this.guard(generation);
    return this.access.withVault(false, async (authority) => {
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
        throw new Error('Rascunho de DM inválido.');
      return { id: packet.id, text: held['text'] };
    });
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
  async historyPage(snapshot: unknown, after: number) {
    return this.withCrypto(async (context) => {
      const raw = personalPage(
        await context.api('personal-page', { snapshot, after }),
      );
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
        if (item['packet'] === undefined) {
          unavailable.push(`dm-message:${id} indisponível`);
          continue;
        }
        const packet = socialPacket(item['packet']);
        if (packet.id !== id)
          throw new Error('Mensagem histórica de outra DM.');
        const peer = profiles.get(
          packet.sender === context.authority.session.accountId
            ? packet.recipient
            : packet.sender,
        );
        if (!peer) throw new Error('Perfil público histórico da DM ausente.');
        const record = await this.decode(context, {
          packet,
          hash: String(item['hash']),
          sequence: socialRevision(item['sequence']),
          peer,
          recovery: raw['recovery'],
        });
        await cacheDmRecord(context.privateAuthority, record);
        result.push(record);
      }
      if (result.length)
        await context.api('received', {
          items: result.map((row) => ({ id: row.id, hash: row.hash })),
        });
      return {
        items: result,
        unavailable,
        next: raw['next'] === null ? null : socialRevision(raw['next']),
      };
    });
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
      throw new Error('Mensagem de DM adulterada ou de outro contexto.');
    const archive = packet.archives.find(
      (a) => a.accountId === context.authority.session.accountId,
    );
    if (!archive) throw new Error('Recuperação da DM ausente.');
    const events = await this.senderHistory(context, packet);
    const event = events[packet.senderRevision - 1];
    if (!event) throw new Error('Autoridade histórica da DM ausente.');
    const raw =
      input.recovery.find((value) => object(value)['id'] === archive.keyId) ??
      (await context.api('recovery-key', { id: archive.keyId }));
    const key = await openRecoveryKey(raw, context.authority);
    try {
      const text = await context.machine.decrypt({
        packet,
        senderEvent: event,
        exported: openRoomKey(key, archive),
      });
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
      };
    } finally {
      key.free();
    }
  }
  private async senderHistory(
    context: SocialContext,
    packet: ReturnType<typeof socialPacket>,
  ) {
    let events = context.authority.events;
    if (packet.sender !== context.authority.session.accountId) {
      events = [];
      for (let page = 0; page < 16; page++) {
        const row = object(
          await context.api('message-history', {
            message: packet.id,
            after: events.length,
          }),
        );
        if (!Array.isArray(row['events']) || row['events'].length > 8)
          throw new Error('Histórico da identidade de DM inválido.');
        events.push(...row['events'].map(socialDirectory));
        if (events.length === row['through']) break;
        if (!row['events'].length || page === 15)
          throw new Error('Histórico de identidade de DM incompleto.');
      }
      await pinSocialHistory(packet.sender, events);
    }
    return events;
  }
  async read(peer: string, before: number | null) {
    if (navigator.onLine) {
      const snapshot = await this.request('personal-snapshot', {}),
        state = object(snapshot);
      let after = await this.access.withVault(false, async (a) => {
        const held = await localGet<LocalCipher>(
          `${a.session.accountId}:${a.session.deviceId}`,
          'dm-sync-state',
        );
        if (!held) return 0;
        const value = object(JSON.parse(await openLocal(a, held)) as unknown);
        return value['removals'] === state['removals']
          ? socialRevision(value['after'])
          : 0;
      });
      let blockedGap = false;
      for (let pages = 0; pages < 64; pages++) {
        const page = await this.historyPage(snapshot, after);
        blockedGap ||= page.unavailable.length > 0;
        if (page.next === null) break;
        after = page.next;
        if (!blockedGap)
          await this.access.withVault(false, async (a) => {
            const row = await sealLocal(
              a,
              crypto.randomUUID(),
              JSON.stringify({ after, removals: state['removals'] }),
            );
            await localPut(
              `${a.session.accountId}:${a.session.deviceId}`,
              'dm-sync-state',
              row,
              row.bytes.length + 512,
            );
          });
        if (pages === 63)
          throw new Error('Continue sincronizando o histórico de DMs.');
      }
    }
    if (navigator.onLine)
      await this.access.withVault(false, (a) =>
        this.removals.load(a, () => this.guard(this.generation)),
      );
    return this.cached(peer, before);
  }
  async copies(after: string | null) {
    const generation = this.generation;
    return this.access.withVault(true, async (a) => {
      const page = await dmHistoryPeers(a, after);
      this.guard(generation);
      return page;
    });
  }
  async cached(peer: string, before: number | null) {
    const generation = this.generation;
    return this.access.withVault(true, async (a) => {
      await this.removals.load(a, () => this.guard(generation));
      const liveSource = await bytesHash(
        new TextEncoder().encode(`0xdmme-dm-cache:${a.session.accountId}`),
      );
      const items = await dmConversationHistory(
        a,
        peer,
        before,
        (id, source) =>
          source !== liveSource || !this.removals.has('dm-message', id),
      );
      this.guard(generation);
      return {
        items: items.map((row) => ({
          ...row,
          sender: row.own ? row.self : row.peer.id,
        })),
        next: items.length === 16 ? (items[0]?.sequence ?? null) : null,
        self: items[0]?.self ?? '',
      };
    });
  }
  async stageMedia(
    peer: string,
    selection: AttachmentSelection,
    media: SocialMedia,
    caption: string,
  ): Promise<void> {
    const generation = this.generation;
    await this.access.withVault(false, async (a) => {
      const scope = dmMediaScope(a.session.accountId),
        id = crypto.randomUUID();
      if (
        await localGet(
          `${a.session.accountId}:${a.session.deviceId}`,
          `dm-media-draft:${peer}`,
        )
      )
        throw new Error(
          'Há mídia pendente. Envie ou cancele antes de escolher outra.',
        );
      await localPut(scope, `outbox:${id}`, { pending: true }, 512);
      try {
        const content = await stageAttachment({
          account: scope,
          id,
          selection,
          caption,
        });
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
    });
  }
  async sendMedia(peer: string): Promise<void> {
    await this.withCrypto(async (context) => {
      const { privateAuthority: a, api, authority, machine } = context,
        scope = `${a.session.accountId}:${a.session.deviceId}`;
      const row = await localGet<LocalCipher>(scope, `dm-media-draft:${peer}`);
      if (!row) throw new Error('Escolha mídia para enviar.');
      const draft = object(JSON.parse(await openLocal(a, row)) as unknown),
        media = socialMedia(draft['media']),
        id = uuid(draft['id']),
        text = String(draft['text']),
        content = socialAttachment(JSON.parse(text) as unknown, media);
      let packet =
        draft['packet'] === undefined ? null : socialPacket(draft['packet']);
      if (
        packet &&
        (await api('accepted', { id, hash: await digest(canonical(packet)) }))
      ) {
        await localDelete(scope, `dm-media-draft:${peer}`);
        await localDelete(dmMediaScope(a.session.accountId), `outbox:${id}`);
        return;
      }
      await uploadAttachments({
        account: dmMediaScope(a.session.accountId),
        message: id,
        peer,
        content,
        api: (op, data) =>
          api(op, {
            ...data,
            ...(op === 'attachment-reserve' ? { media } : {}),
          }),
      });
      const recipient = await readSocialDirectory(api, peer);
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
      await api('publish', { packet });
      await localDelete(scope, `dm-media-draft:${peer}`);
      await localDelete(dmMediaScope(a.session.accountId), `outbox:${id}`);
    });
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
    return this.access.withVault(false, async (a) =>
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
    if (!row.media) throw new Error('Mensagem sem mídia.');
    const content = socialAttachment(
        JSON.parse(row.text) as unknown,
        row.media,
      ),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Miniatura ausente.');
    const generation = this.generation;
    return this.access.withVault(localOnly || !navigator.onLine, async (a) => {
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
    });
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
        throw new Error('Mídia importada de outra DM.');
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
    throw new Error('Página pessoal de DMs inválida.');
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
    throw new Error('Caixa de chaves de DMs inválida.');
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
