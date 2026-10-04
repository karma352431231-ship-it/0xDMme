import type { AccountSession } from '../../shared/account/index.ts';
import { encode, object } from '../../shared/account/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { backupItemLimit } from '../../shared/backups/index.ts';
import { commitHash } from '../../shared/vault/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import { localLocator } from '../vault-storage/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Messages } from '../messages/index.ts';
import type { MessageItem } from '../messages/index.ts';
import { BackupReader, BackupWriter } from '../backup-archive/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { cleanPersonal } from '../personal-removals/index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
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
  private session: AccountSession | null = null;
  private generation = 0;
  private after: number | null = 0;
  private readonly choices = new Map<string, BackupChoice>();
  private reader: BackupReader | null = null;
  private generated: Blob | null = null;
  private readonly exported = new Map<string, string>();
  private readonly priorCleanup = new Set<string>();
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.sync = sync;
    this.messages = new Messages(access, sync, () => {});
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId !== this.session?.accountId ||
      session?.deviceId !== this.session?.deviceId ||
      session?.csrf !== this.session?.csrf
    ) {
      this.cancel();
      this.choices.clear();
      this.after = 0;
      this.priorCleanup.clear();
    }
    this.session = session;
    this.messages.setSession(session);
  }
  cancel(): void {
    this.generation++;
    this.reader?.close();
    this.reader = null;
    this.generated = null;
    this.exported.clear();
  }
  guard(token = this.generation): () => void {
    const deadline = Date.now() + 300_000;
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
    const page = await this.messages.backupPage(this.after);
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
      throw new Error(
        'Seleção de até 4096 itens por etapa. Exporte o conjunto carregado.',
      );
    this.choices.set(`${choice.type}:${choice.id}`, choice);
  }
  async generate(
    ids: ReadonlySet<string>,
    media: boolean,
  ): Promise<{ included: number; omitted: string[] }> {
    this.cancel();
    const guard = this.guard();
    const selected = this.list().filter((row) =>
      ids.has(`${row.type}:${row.id}`),
    );
    if (!selected.length) throw new Error('Selecione pelo menos um item.');
    const writer = await this.authority((a) => BackupWriter.create(a));
    const omitted: string[] = [];
    let included = 0;
    try {
      for (const choice of selected) {
        guard();
        let row: BackupRecord;
        try {
          row = await this.record(choice);
          guard();
        } catch {
          guard();
          omitted.push(`${choice.type}:${choice.id} indisponível`);
          continue;
        }
        await writer.add(row, guard);
        included++;
        this.exported.set(`${choice.type}:${choice.id}`, choice.hash);
        if (row.type === 'message' && row.kind === 'attachment')
          await this.addMedia({ writer, row, choice, media, omitted, guard });
        window.dispatchEvent(
          new CustomEvent('0xdmme-backup-progress', {
            detail: { done: included, total: selected.length },
          }),
        );
      }
      this.generated = await writer.finish(omitted, guard);
      guard();
      return { included, omitted };
    } catch (error: unknown) {
      writer.abort();
      this.cancel();
      throw error;
    }
  }
  private async record(choice: BackupChoice): Promise<BackupRecord> {
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
    const view = await this.messages.backupOne(choice.item);
    return {
      type: 'message',
      id: view.id,
      hash: view.hash,
      peer: view.peer,
      own: view.own,
      kind: view.kind,
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
  }): Promise<void> {
    const content = attachmentContent(JSON.parse(c.row.text) as unknown);
    for (const thumbnail of [false, true]) {
      const file = thumbnail ? content.thumbnail : content.file;
      if (!file) continue;
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
    this.reader = reader;
    return reader;
  }
  async cleanup(): Promise<{ used: number; released: number }> {
    const reader = this.reader;
    if (!reader || !navigator.onLine || !this.session)
      throw new Error(
        'Selecione e valide o arquivo salvo e conecte antes de limpar.',
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
  async register(remind: boolean): Promise<void> {
    const reader = this.reader;
    if (!reader) throw new Error('Valide um arquivo antes de registrar.');
    await this.sync.refresh();
    if (!this.sync.complete)
      throw new Error('Conclua o índice do cofre antes de registrar.');
    const existing = [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.label === 'Exportações independentes',
      );
    const entity = existing[0]?.change.entity ?? crypto.randomUUID();
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'settings',
        parents: existing.map((e) => e.commit.id).slice(0, 16),
        label: 'Exportações independentes',
      },
      value: JSON.stringify({
        version: 1,
        hash: reader.hash,
        id: reader.id,
        validatedAt: Date.now(),
        remind,
      }),
    });
  }
  async reminder(): Promise<string | null> {
    if (!this.sync.complete) return null;
    const records = [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'settings' &&
          e.change.label === 'Exportações independentes',
      );
    for (const e of records) {
      const value = object(
        JSON.parse(await this.sync.open(e.commit.id)) as unknown,
      );
      if (
        value['remind'] === true &&
        typeof value['validatedAt'] === 'number' &&
        Date.now() - value['validatedAt'] > 7 * 86400000
      )
        return 'Seu último backup registrado foi validado há mais de sete dias. Considere exportar as novidades.';
    }
    return null;
  }
}
