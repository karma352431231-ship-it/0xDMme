import { object, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import {
  statusPacket,
  statusEnvelope,
  statusIsActive,
  statusExpiresAt,
} from '../../shared/status/index.ts';
import type { StatusPacket } from '../../shared/status/index.ts';
import { messageApi, backupMessageApi } from '../message-api/index.ts';
import {
  ensureMessageRecovery,
  openRecoveryKey,
  openRoomKey,
} from '../message-recovery/index.ts';
import { PeerIdentity } from '../peer-identity/index.ts';
import { openStatus } from '../status-crypto/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { StatusPublication } from './publication.ts';
import { StatusPreferences } from './preferences.ts';
import { downloadStatusPhoto } from './media.ts';
export interface StatusItem {
  id: string;
  author: string;
  publishedAt: number;
  expiresAt: number;
  kind: 'text' | 'photo';
}
export interface StatusView {
  item: StatusItem;
  text: string;
  packet: StatusPacket;
}
export class StatusController {
  private readonly access: VaultAccess;
  private readonly identities: PeerIdentity;
  readonly preferences: StatusPreferences;
  private session: AccountSession | null = null;
  private generation = 0;
  private draft: StatusPublication | null = null;
  private opened: StatusView | null = null;
  items: StatusItem[] = [];
  next: string | null = null;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.identities = new PeerIdentity(sync);
    this.preferences = new StatusPreferences(sync);
  }
  setSession(session: AccountSession | null): void {
    if (sessionIdentity(this.session) !== sessionIdentity(session)) {
      this.hide();
      this.draft?.close();
      this.draft = null;
      this.identities.clear();
      this.preferences.clear();
      this.items = [];
      this.next = null;
    }
    this.session = session;
  }
  hide(): void {
    this.generation++;
    this.opened = null;
  }
  get pending(): boolean {
    return this.draft !== null;
  }
  guard(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Sessão ou tela de status alterada.');
  }
  private async withAuthority<T>(
    generation: number,
    work: (a: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    if (!this.session || !navigator.onLine)
      throw new Error('Entre e conecte-se para abrir os status.');
    return this.access.withVault(false, async (a) => {
      this.guard(generation);
      if (
        a.session.accountId !== this.session?.accountId ||
        a.session.deviceId !== this.session.deviceId
      )
        throw new Error('Sessão alterada.');
      const value = await work(a);
      this.guard(generation);
      return value;
    });
  }
  async refresh(more = false): Promise<void> {
    const generation = this.generation;
    if (!more) {
      await this.identities.load();
      await this.preferences.load();
      this.guard(generation);
    }
    const data = object(
      await this.withAuthority(generation, (a) =>
        messageApi(a, 'status-list', { after: more ? this.next : null }, () =>
          this.guard(generation),
        ),
      ),
    );
    const items = parseStatusItems(data['items']);
    this.items = more
      ? [
          ...this.items,
          ...items.filter(
            (item) => !this.items.some((old) => old.id === item.id),
          ),
        ]
      : items;
    this.next = data['next'] === null ? null : uuid(data['next']);
  }
  async publish(
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    const generation = this.generation;
    await this.identities.load();
    await this.preferences.load();
    this.guard(generation);
    await this.withAuthority(generation, async (a) => {
      const api = (op: string, payload: Record<string, unknown>) =>
        backupMessageApi(a, op, payload, () => this.guard(generation));
      await ensureMessageRecovery(a, api);
      this.draft ??= await StatusPublication.create({
        authority: a,
        text,
        selection,
        excluded: this.preferences.excluded,
      });
      await this.draft.publish({
        authority: a,
        identities: this.identities,
        api,
      });
    });
    this.draft?.close();
    this.draft = null;
    await this.identities.save();
    this.guard(generation);
  }
  async cancel(): Promise<void> {
    const draft = this.draft;
    if (!draft) return;
    const generation = this.generation;
    await this.withAuthority(generation, (a) =>
      messageApi(a, 'status-remove', { id: draft.id }, () =>
        this.guard(generation),
      ),
    );
    draft.close();
    this.draft = null;
  }
  async remove(id: string): Promise<void> {
    const generation = this.generation;
    await this.withAuthority(generation, (a) =>
      messageApi(a, 'status-remove', { id }, () => this.guard(generation)),
    );
    if (this.opened?.item.id === id) this.opened = null;
    this.items = this.items.filter((item) => item.id !== id);
  }
  async open(id: string): Promise<StatusView> {
    this.opened = null;
    const generation = this.generation;
    await this.identities.load();
    this.guard(generation);
    const view = await this.withAuthority(generation, async (a) => {
      const api = (op: string, payload: Record<string, unknown>) =>
        messageApi(a, op, payload, () => this.guard(generation));
      const raw = object(await api('status-read', { id })),
        packet = statusPacket(raw['packet']),
        envelope = statusEnvelope(raw['envelope']);
      if (packet.id !== id) throw new Error('Publicação divergente.');
      const history = await this.origin({ id, author: packet.author, api });
      const origin = history[packet.authorityRevision - 1];
      if (!origin) throw new Error('Origem do status incompleta.');
      const key = recoveryKey(
        await api('recovery-key', { id: envelope.recipient.archive.keyId }),
      );
      const secret = await openRecoveryKey(key, a);
      let text: string;
      try {
        text = await openStatus({
          authority: a,
          packet,
          envelope,
          origin,
          exported: openRoomKey(secret, envelope.recipient.archive),
          now: Date.now(),
        });
      } finally {
        secret.free();
      }
      await confirmStatus({ id, packet, api });
      return {
        item: {
          id,
          author: packet.author,
          kind: packet.kind,
          publishedAt: packet.publishedAt,
          expiresAt: statusExpiresAt(packet.publishedAt),
        },
        text,
        packet,
      };
    });
    await this.identities.save();
    this.guard(generation);
    this.opened = view;
    return view;
  }
  private async origin(input: {
    id: string;
    author: string;
    api: (op: string, payload: Record<string, unknown>) => Promise<unknown>;
  }) {
    const events: unknown[] = [];
    let head: string | null = null;
    for (let page = 0; page < 16; page++) {
      const data = object(
        await input.api('status-origin', {
          id: input.id,
          after: events.length,
        }),
      );
      const revision = integer(data['revision'], 128),
        current = fingerprint(data['head']),
        raw = data['events'];
      if (head && head !== current)
        throw new Error('Os aparelhos do autor mudaram. Tente novamente.');
      if (!Array.isArray(raw) || !raw.length || raw.length > 8)
        throw new Error('Origem do status incompleta.');
      head = current;
      const values: unknown[] = raw;
      events.push(...values);
      if (events.length === revision)
        return this.identities.verify({
          account: input.author,
          events,
          expected: head,
          current: true,
        });
    }
    throw new Error('Diretório do autor excedido.');
  }
  async photo(thumbnail: boolean): Promise<Uint8Array<ArrayBuffer>> {
    const view = this.opened;
    if (!view || view.packet.kind !== 'photo')
      throw new Error('Abra uma foto primeiro.');
    const generation = this.generation,
      content = attachmentContent(JSON.parse(view.text) as unknown),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Prévia da foto ausente.');
    return this.withAuthority(generation, async (a) => {
      const api = (op: string, payload: Record<string, unknown>) =>
        messageApi(a, op, payload, () => this.guard(generation));
      await confirmStatus({ id: view.item.id, packet: view.packet, api });
      const bytes = await downloadStatusPhoto({
        id: view.item.id,
        file,
        thumbnail,
        api,
        guard: () => this.guard(generation),
      });
      try {
        await confirmStatus({ id: view.item.id, packet: view.packet, api });
        return bytes;
      } catch (error: unknown) {
        bytes.fill(0);
        throw error;
      }
    });
  }
}
async function confirmStatus(input: {
  id: string;
  packet: StatusPacket;
  api: (op: string, payload: Record<string, unknown>) => Promise<unknown>;
}): Promise<void> {
  const data = object(await input.api('status-read', { id: input.id }));
  if (
    canonical(statusPacket(data['packet'])) !== canonical(input.packet) ||
    !statusIsActive({ publishedAt: input.packet.publishedAt, now: Date.now() })
  )
    throw new Error('Status mudou, expirou ou está indisponível.');
}
function parseStatusItems(input: unknown): StatusItem[] {
  if (!Array.isArray(input) || input.length > 16)
    throw new Error('Lista de status inválida.');
  return input.map((value: unknown) => {
    const d = object(value),
      kind = d['kind'];
    if (kind !== 'text' && kind !== 'photo')
      throw new Error('Tipo de status inválido.');
    const publishedAt = integer(d['publishedAt'], Number.MAX_SAFE_INTEGER),
      expiresAt = integer(d['expiresAt'], Number.MAX_SAFE_INTEGER);
    if (expiresAt !== statusExpiresAt(publishedAt))
      throw new Error('Expiração de status inválida.');
    return {
      id: uuid(d['id']),
      author: uuid(d['author']),
      publishedAt,
      expiresAt,
      kind,
    };
  });
}

function sessionIdentity(session: AccountSession | null): string {
  return session
    ? [session.accountId, session.deviceId, session.csrf].join(':')
    : '';
}
