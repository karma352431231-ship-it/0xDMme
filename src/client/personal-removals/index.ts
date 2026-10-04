import { object } from '../../shared/account/index.ts';
import { personalRemoval, verifyRemoval } from '../../shared/backups/index.ts';
import type {
  BackupTarget,
  PersonalRemoval,
} from '../../shared/backups/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { forgetCachedBlock } from '../vault-storage/index.ts';
import { forgetAttachment } from '../attachments/index.ts';
import { localDelete, localPage, localPut } from '../message-storage/index.ts';
import { messageApi } from '../message-api/index.ts';
export class RemovalIndex {
  private readonly rows = new Map<string, PersonalRemoval>();
  private localAfter: string | null = null;
  private after = 0;
  private localComplete = false;
  reset(): void {
    this.rows.clear();
    this.localAfter = null;
    this.after = 0;
    this.localComplete = false;
  }
  has(kind: BackupTarget['kind'], id: string): boolean {
    return this.rows.has(`${kind}:${id}`);
  }
  async load(a: VaultAuthority, guard: () => void): Promise<void> {
    await this.loadLocal(a);
    if (a.offline) return;
    for (let round = 0; round < 8; round++) {
      guard();
      const page = object(
        await messageApi(a, 'personal-page', { after: this.after }, guard),
      );
      await this.acceptPage(a, page);
      if (page['next'] === null) return;
      if (page['next'] !== this.after)
        throw new Error('Paginação de remoções divergente.');
    }
    throw new Error(
      'Continue sincronizando as remoções pessoais antes de abrir conteúdo.',
    );
  }
  private async loadLocal(a: VaultAuthority): Promise<void> {
    const scope = `removals:${a.session.accountId}`;
    for (let round = 0; !this.localComplete && round < 8; round++) {
      const page = await localPage<PersonalRemoval>(
        scope,
        'removal:',
        this.localAfter,
      );
      for (const { value } of page.items)
        await this.accept(a, personalRemoval(value));
      this.localAfter = page.next;
      if (page.next === null) this.localComplete = true;
    }
    if (!this.localComplete)
      throw new Error('Continue carregando as remoções pessoais.');
  }
  private async acceptPage(
    a: VaultAuthority,
    page: Record<string, unknown>,
  ): Promise<void> {
    if (!Array.isArray(page['items']) || page['items'].length > 16)
      throw new Error('Página de remoções inválida.');
    for (const raw of page['items']) {
      const row = personalRemoval(raw);
      if (row.sequence <= this.after)
        throw new Error('Ordem de remoções inválida.');
      await verifyRemoval(a.session.accountId, row, a.events);
      await localPut(
        `removals:${a.session.accountId}`,
        `removal:${row.sequence.toString().padStart(16, '0')}`,
        row,
        JSON.stringify(row).length + 128,
      );
      await this.accept(a, row);
      this.after = row.sequence;
    }
  }
  private async accept(a: VaultAuthority, row: PersonalRemoval): Promise<void> {
    await verifyRemoval(a.session.accountId, row, a.events);
    await purgeRemoved(a.session.accountId, row);
    this.rows.set(`${row.kind}:${row.id}`, row);
  }
}
export async function cleanPersonal(
  a: VaultAuthority,
  items: BackupTarget[],
  backup: string,
  guard: () => void,
): Promise<{ used: number; released: number }> {
  let used = 0,
    released = 0;
  for (let start = 0; start < items.length; start += 8) {
    const data = object(
      await messageApi(
        a,
        'personal-clean',
        {
          items: items.slice(start, start + 8),
          backup,
          revision: a.events.length,
        },
        guard,
      ),
    );
    if (
      data['status'] !== 'cleaned' ||
      typeof data['used'] !== 'number' ||
      typeof data['released'] !== 'number'
    )
      throw new Error(
        'Confirmação de limpeza inválida. Confira o estado antes de repetir.',
      );
    await saveReceipts(a, data['items'], items.slice(start, start + 8));
    used = data['used'];
    released += data['released'];
  }
  return { used, released };
}

async function purgeRemoved(account: string, row: BackupTarget): Promise<void> {
  if (row.kind === 'vault') {
    await forgetCachedBlock(account, row.id);
    return;
  }
  for (const prefix of ['cache', 'profile', 'outbox', 'search'])
    await localDelete(account, `${prefix}:${row.id}`);
  await forgetAttachment(account, row.id);
}

async function saveReceipts(
  a: VaultAuthority,
  input: unknown,
  items: BackupTarget[],
): Promise<void> {
  if (!Array.isArray(input) || input.length !== items.length)
    throw new Error(
      'Comprovantes de limpeza incompletos. Confira o estado antes de continuar.',
    );
  const seen = new Set<string>();
  for (const raw of input) {
    const row = personalRemoval(raw);
    const id = `${row.kind}:${row.id}`;
    if (seen.has(id)) throw new Error('Comprovante repetido.');
    seen.add(id);
    if (
      !items.some(
        (i) => i.kind === row.kind && i.id === row.id && i.hash === row.hash,
      )
    )
      throw new Error('Comprovante divergente.');
    await verifyRemoval(a.session.accountId, row, a.events);
    await localPut(
      `removals:${a.session.accountId}`,
      `removal:${row.sequence.toString().padStart(16, '0')}`,
      row,
      JSON.stringify(row).length + 128,
    );
    await purgeRemoved(a.session.accountId, row);
  }
}
