import type { AccountSession } from '../../shared/account/index.ts';
import { encode } from '../../shared/account/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { backupItemLimit } from '../../shared/backups/index.ts';
import { bytesHash, commitHash } from '../../shared/vault/index.ts';
import { Contacts } from '../contacts/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import { localLocator } from '../vault-storage/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Messages } from '../messages/index.ts';
import type { MessageView, MessageItem } from '../messages/index.ts';
import { BackupReader, BackupWriter } from '../backup-archive/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { cleanPersonal } from '../personal-removals/index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
import { historyPage, importHistory } from '../local-history/index.ts';
import { localGet, localPut } from '../message-storage/index.ts';
import { SocialBackups } from '../social-backups/index.ts';
import { GroupBackups } from '../groups/index.ts';
export interface BackupChoice {
  type: 'vault' | 'message';
  id: string;
  label: string;
  bytes: number;
  hash: string;
  item?: MessageItem;
}
export class Backups {
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private readonly messages: Messages;
  private readonly groups: GroupBackups;
  private readonly social: SocialBackups;
  private session: AccountSession | null = null;
  private generation = 0;
  private after: number | null = 0;
  private readonly choices = new Map<string, BackupChoice>();
  private reader: BackupReader | null = null;
  private generated: Blob | null = null;
  private writer: BackupWriter | null = null;
  private readonly exported = new Map<string, string>();
  private readonly priorCleanup = new Set<string>();
  private discoverySnapshot: unknown = undefined;
  private readonly profile: () => string | null;
  private readonly peers = new Map<string, Peer>();
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    profile: () => string | null = () => null,
  ) {
    this.access = access;
    this.sync = sync;
    this.profile = profile;
    this.messages = new Messages(access, sync, () => {});
    this.groups = new GroupBackups(access, sync);
    this.social = new SocialBackups(access, sync);
  }
  private sameIdentity(session: AccountSession | null): boolean {
    return (
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId
    );
  }
  setSession(session: AccountSession | null): void {
    if (!this.sameIdentity(session)) {
      this.cancel();
      this.choices.clear();
      this.after = 0;
      this.priorCleanup.clear();
    } else if (session?.csrf !== this.session?.csrf) this.generation++;
    this.session = session;
    this.messages.setSession(session);
    this.groups.setSession(session);
    this.social.setSession(session);
  }
  cancel(): void {
    this.social.cancel();
    this.generation++;
    this.reader?.close();
    this.reader = null;
    this.generated = null;
    this.writer?.abort();
    this.writer = null;
    this.exported.clear();
  }
  guard(token = this.generation): () => void {
    const deadline = Date.now() + 7200_000;
    return () => {
      if (token !== this.generation || Date.now() > deadline)
        throw new Error(
          'Operação interrompida. Se uma limpeza foi enviada, confira o estado remoto.',
        );
    };
  }
  list(): BackupChoice[] {
    return [...this.choices.values()];
  }
  get more(): boolean {
    return this.after !== null || !this.sync.complete;
  }
  get file(): Blob | null {
    return this.generated;
  }
  get opened(): BackupReader | null {
    return this.reader;
  }
  get cleanupCount(): number {
    if (!this.reader?.complete) return 0;
    return (
      this.reader?.targets.filter(
        (t) =>
          this.exported.get(`${t.kind}:${t.id}`) === t.hash &&
          !this.priorCleanup.has(`${t.kind}:${t.id}`),
      ).length ?? 0
    );
  }
  private async authority<T>(
    work: (a: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    if (this.session && navigator.onLine)
      return this.access.withVault(false, work);
    const locator = await localLocator();
    if (!locator)
      throw new Error(
        'Entre com a wallet original e autorize ou recupere as chaves deste aparelho.',
      );
    return this.access.withLocalVault(locator, work);
  }
  async discover(): Promise<void> {
    if (!navigator.onLine || !this.session)
      throw new Error(
        'Conecte e autorize este aparelho para selecionar conteúdo remoto.',
      );
    const guard = this.guard();
    await this.sync.refresh();
    guard();
    for (const entry of this.sync.entries.values()) {
      if (this.sync.isRemoved(entry.commit.id)) {
        this.choices.delete(`vault:${entry.commit.id}`);
        continue;
      }
      this.choose({
        type: 'vault',
        id: entry.commit.id,
        label: `${entry.change.label} · versão ${entry.commit.sequence}`,
        bytes: entry.commit.block.bytes,
        hash: await commitHash(entry.commit),
      });
    }
    if (this.after === null) return;
    const page = await this.messages.backupPage(
      this.after,
      this.discoverySnapshot,
    );
    guard();
    for (const item of page.items)
      this.choose(this.messageChoice(item, this.session.accountId));
    this.after = page.next;
  }
  private messageChoice(item: MessageItem, account: string): BackupChoice {
    const names = {
      attachment: 'Foto/arquivo',
      profile: 'Perfil compartilhado',
      text: 'Mensagem',
    };
    return {
      type: 'message',
      id: item.id,
      hash: item.hash,
      item,
      label: `${item.relation ? (item.relation.type === 'edit' ? 'Edição' : 'Reação') : names[item.kind]} · #${item.sequence} · ${item.sender === account ? 'enviada' : 'recebida'}`,
      bytes: item.kind === 'profile' ? 4_100_000 : 16_384,
    };
  }
  private choose(choice: BackupChoice): void {
    if (
      !this.choices.has(`${choice.type}:${choice.id}`) &&
      this.choices.size >= backupItemLimit
    )
      throw new Error('O histórico excede o limite de registros por arquivo.');
    this.choices.set(`${choice.type}:${choice.id}`, choice);
  }
  async generate(
    ids: ReadonlySet<string>,
    media: boolean,
    groups = false,
  ): Promise<{ included: number; omitted: string[] }> {
    this.cancel();
    const guard = this.guard();
    const selected = this.list().filter((row) =>
      ids.has(`${row.type}:${row.id}`),
    );
    const writer = await this.authority((a) => BackupWriter.create(a));
    this.writer = writer;
    const omitted: string[] = [];
    let included: number;
    try {
      const saved = await this.preserveHistorical(writer, guard);
      included = saved.included;
      const historical = saved.historical;
      await this.addProfile(writer, historical, guard);
      for (const choices of this.windows(selected))
        included += await this.writeWindow({
          choices,
          writer,
          historical,
          guard,
          omitted,
          media,
          total: selected.length,
          done: included,
        });
      if (groups)
        included += await this.groups.export({
          append: (row) => writer.add(row, guard),
          known: historical,
          guard,
          omitted,
        });
      if (groups)
        included += await this.social.export({
          append: (row) => writer.add(row, guard),
          known: historical,
          guard,
          omitted,
          exported: this.exported,
        });
      this.generated = await writer.finish(omitted, guard);
      guard();
      return { included, omitted };
    } catch (error: unknown) {
      writer.abort();
      this.cancel();
      throw error;
    }
  }
  private async writeWindow(c: {
    choices: BackupChoice[];
    writer: BackupWriter;
    historical: ReadonlyMap<string, string>;
    guard: () => void;
    omitted: string[];
    media: boolean;
    total: number;
    done: number;
  }): Promise<number> {
    const views = await this.messages.backupBatch(
      c.choices.flatMap((choice) => (choice.item ? [choice.item] : [])),
    );
    let included = c.done;
    for (const choice of c.choices) {
      c.guard();
      let row: BackupRecord;
      try {
        row = await this.record(choice, views.get(choice.id));
        c.guard();
      } catch {
        c.guard();
        c.omitted.push(`${choice.type}:${choice.id} indisponível`);
        continue;
      }
      const existing = c.historical.get(`${row.type}:${row.id}`);
      if (existing && existing !== row.hash)
        throw new Error('Histórico diverge da cópia remota.');
      if (!existing) {
        await c.writer.add(row, c.guard);
        included++;
      }
      this.exported.set(`${choice.type}:${choice.id}`, choice.hash);
      if (row.type === 'message' && row.kind === 'attachment')
        await this.addMedia({
          writer: c.writer,
          row,
          choice,
          media: c.media,
          omitted: c.omitted,
          guard: c.guard,
          historical: c.historical,
        });
      window.dispatchEvent(
        new CustomEvent('0xdmme-backup-progress', {
          detail: { done: included, total: c.total },
        }),
      );
    }
    return included - c.done;
  }
  private *windows(selected: BackupChoice[]): Generator<BackupChoice[]> {
    let window: BackupChoice[] = [],
      bytes = 0;
    for (const choice of selected) {
      if (
        window.length &&
        (window.length === 32 || bytes + choice.bytes > 8_200_000)
      ) {
        yield window;
        window = [];
        bytes = 0;
      }
      window.push(choice);
      bytes += choice.bytes;
    }
    if (window.length) yield window;
  }
  private async preserveHistorical(writer: BackupWriter, guard: () => void) {
    let included = 0;
    let after: IDBValidKey | null = null;
    const historical = new Map<string, string>();
    do {
      const page = await this.authority((a) => historyPage(a, after, 1));
      guard();
      for (const row of page.rows) {
        const identity = `${row.type}:${row.id}`;
        const previous = historical.get(identity);
        if (previous === row.hash) continue;
        if (previous !== undefined)
          throw new Error(
            'Cópias históricas divergentes. Preserve os arquivos originais antes de resolver.',
          );
        historical.set(identity, row.hash);
        await writer.add(row, guard);
        included++;
      }
      after = page.next;
    } while (after !== null);
    return { included, historical };
  }
  private async addProfile(
    writer: BackupWriter,
    historical: ReadonlyMap<string, string>,
    guard: () => void,
  ): Promise<void> {
    const value = this.profile();
    if (value === null)
      throw new Error(
        'Aguarde a abertura do perfil antes de salvar o backup completo.',
      );
    const hash = await bytesHash(new TextEncoder().encode(value));
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    if (!historical.has(`account:${id}`))
      await writer.add({ type: 'account', id, hash, value }, guard);
  }
  private async discoverPeers(guard: () => void): Promise<void> {
    this.peers.clear();
    const contacts = new Contacts(this.access);
    contacts.setSession(this.session);
    let more = false;
    for (;;) {
      const page = await contacts.list('approved', more);
      guard();
      for (const row of page.items)
        this.peers.set(row.accountId, {
          accountId: row.accountId,
          name: row.name,
          address: row.address,
          ecosystem: row.ecosystem,
        });
      if (!page.next) return;
      if (this.peers.size >= backupItemLimit)
        throw new Error('Contatos excedem o limite do backup.');
      more = true;
    }
  }
  async generateComplete(): Promise<{ included: number; omitted: string[] }> {
    const guard = this.guard();
    this.choices.clear();
    this.after = 0;
    await this.discoverPeers(guard);
    this.discoverySnapshot = await this.messages.backupSnapshot();
    do {
      guard();
      await this.discover();
    } while (this.more);
    return this.generate(
      new Set(this.list().map((r) => `${r.type}:${r.id}`)),
      true,
      true,
    );
  }
  private async record(
    choice: BackupChoice,
    view?: MessageView,
  ): Promise<BackupRecord> {
    if (choice.type === 'vault') {
      const entry = this.sync.entries.get(choice.id);
      if (!entry) throw new Error('Versão ausente.');
      return {
        type: 'vault',
        id: choice.id,
        hash: choice.hash,
        change: entry.change,
        value: await this.sync.open(choice.id),
      };
    }
    if (!choice.item) throw new Error('Mensagem ausente.');
    if (!view) throw new Error('Mensagem indisponível.');
    return {
      type: 'message',
      id: view.id,
      hash: view.hash,
      peer: view.peer,
      own: view.own,
      kind: view.kind,
      sequence: view.sequence ?? choice.item.sequence,
      ...(this.peers.has(view.peer)
        ? { participant: this.peers.get(view.peer)! }
        : {}),
      ...(view.relation ? { relation: view.relation } : {}),
      text: view.text,
    };
  }
  private async addMedia(c: {
    writer: BackupWriter;
    row: Extract<BackupRecord, { type: 'message' }>;
    choice: BackupChoice;
    media: boolean;
    omitted: string[];
    guard: () => void;
    historical: ReadonlyMap<string, string>;
  }): Promise<void> {
    const content = attachmentContent(JSON.parse(c.row.text) as unknown);
    for (const thumbnail of [false, true]) {
      const file = thumbnail ? content.thumbnail : content.file;
      if (!file) continue;
      const preserved = c.historical.get(`media:${file.ref.id}`);
      if (preserved) {
        if (preserved !== file.ref.hash)
          throw new Error('Mídia histórica divergente.');
        continue;
      }
      const omission = `media:${file.ref.id} ${c.media ? 'indisponível' : 'não selecionada'}`;
      if (!c.media) {
        c.omitted.push(omission);
        continue;
      }
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await this.messages.backupMedia(
          { ...c.row, state: 'Exportação' },
          thumbnail,
        );
        c.guard();
      } catch {
        c.guard();
        c.omitted.push(omission);
        continue;
      }
      try {
        await c.writer.add(
          {
            type: 'media',
            id: file.ref.id,
            hash: file.ref.hash,
            message: c.row.id,
            thumbnail,
            bytes: encode(bytes),
          },
          c.guard,
        );
      } finally {
        bytes.fill(0);
      }
    }
  }
  async open(file: Blob): Promise<BackupReader> {
    this.reader?.close();
    this.reader = null;
    const guard = this.guard();
    const reader = await this.authority((a) =>
      BackupReader.open(a, file, guard),
    );
    guard();
    try {
      await this.authority(async (a) => {
        await importHistory(a, reader, guard);
        await localPut(
          'backup:' + a.session.accountId,
          'validatedAt',
          Date.now(),
          32,
        );
      });
      guard();
      this.reader = reader;
      this.exported.clear();
      for (const target of reader.targets)
        this.exported.set(`${target.kind}:${target.id}`, target.hash);
    } catch (error: unknown) {
      reader.close();
      throw error;
    }
    return reader;
  }
  async cleanup(): Promise<{ used: number; released: number }> {
    const reader = this.reader;
    if (!reader || !navigator.onLine || !this.session)
      throw new Error(
        'Selecione e valide o arquivo salvo e conecte antes de limpar.',
      );
    if (!reader.complete)
      throw new Error(
        'Backup incompleto. O reset exige todas as conversas e mídias.',
      );
    const items = reader.targets.filter(
      (t) =>
        this.exported.get(`${t.kind}:${t.id}`) === t.hash &&
        !this.priorCleanup.has(`${t.kind}:${t.id}`),
    );
    if (!items.length)
      throw new Error(
        'Nenhum item desta exportação está elegível para limpeza. Anexos precisam estar completos no arquivo.',
      );
    const guard = this.guard();
    try {
      const result = await this.access.withVault(false, (a) =>
        cleanPersonal(a, items, reader.hash, guard),
      );
      guard();
      for (const item of items) {
        this.priorCleanup.add(`${item.kind}:${item.id}`);
        this.choices.delete(`${item.kind}:${item.id}`);
      }
      return result;
    } finally {
      notifyMessageControls();
      window.dispatchEvent(new Event('0xdmme-personal-cleanup'));
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('0xdmme-vault-changes');
        channel.postMessage('personal-cleanup');
        channel.close();
      }
      this.sync.clear();
    }
  }
  async reminder(): Promise<string | null> {
    if (!this.session) return null;
    const last = await localGet<number>(
      'backup:' + this.session.accountId,
      'validatedAt',
    );
    return last && Date.now() - last < 7 * 86400000
      ? null
      : 'Salve um backup completo para manter uma cópia com você.';
  }
}
