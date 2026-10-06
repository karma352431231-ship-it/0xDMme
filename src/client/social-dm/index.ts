import { base64, keys, object, uuid } from '../../shared/account/index.ts';
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
import { recoveryKey } from '../../shared/messages/index.ts';
import {
  socialPacket,
  socialPage,
  socialRelation,
  socialRevision,
} from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { readSocialDirectory, socialAuthority } from './authority.ts';
import type { SocialApi, SocialDirectoryPage } from './authority.ts';

export class SocialDms {
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private generation = 0;
  private session: AccountSession | null = null;
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
      return data['secret'] as string;
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
    return secret;
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
  private async withCrypto<T>(
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
      )
        await api('publish', { packet });
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
  async read(peer: string, before: number | null) {
    return this.withCrypto(async ({ authority, api, machine }) => {
      const peerDirectory = await readSocialDirectory(api, peer);
      const raw = object(await api('page', { peer, before }));
      if (!Array.isArray(raw['items']) || raw['items'].length > 16)
        throw new Error('Página de mensagens inválida.');
      const items = [];
      for (const value of raw['items']) {
        const row = object(value),
          packet = socialPacket(row['packet']);
        if (
          ![packet.sender, packet.recipient].includes(
            authority.session.accountId,
          ) ||
          ![packet.sender, packet.recipient].includes(peer)
        )
          throw new Error('Mensagem de outra DM.');
        const history =
            packet.sender === authority.session.accountId
              ? authority.events
              : peerDirectory.events,
          event = history[packet.senderRevision - 1],
          archive = packet.archives.find(
            (a) => a.accountId === authority.session.accountId,
          );
        if (!event || !archive)
          throw new Error('Autoridade ou recuperação da mensagem ausente.');
        const key = await openRecoveryKey(
          await api('recovery-key', { id: archive.keyId }),
          authority,
        );
        try {
          items.push({
            id: packet.id,
            sender: packet.sender,
            sequence: socialRevision(row['sequence']),
            text: await machine.decrypt({
              packet,
              senderEvent: event,
              exported: openRoomKey(key, archive),
            }),
          });
        } finally {
          key.free();
        }
      }
      return {
        items,
        next: raw['next'] === null ? null : socialRevision(raw['next']),
        self: authority.session.accountId,
      };
    });
  }
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
