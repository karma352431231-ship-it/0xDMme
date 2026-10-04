import { attachmentContent } from '../../shared/attachments/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyRow } from '../daily-text/index.ts';
import {
  localPage,
  localPut,
  localGet,
  localDelete,
  sealLocal,
  openLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
interface SearchRecord {
  peer: string;
  sequence: number;
  cipher: LocalCipher;
}
export async function indexSearch(
  a: VaultAuthority,
  rows: readonly DailyRow[],
): Promise<void> {
  for (const row of dailyViews(rows)) {
    if (row.kind === 'profile') continue;
    if (row.state === 'Suspensa') {
      await localDelete(a.session.accountId, `search:${row.id}`);
      continue;
    }
    const text =
      row.kind === 'attachment'
        ? attachmentContent(JSON.parse(row.text) as unknown).name +
          ' ' +
          row.content.text
        : row.content.text;
    const previous = await localGet<SearchRecord>(
      a.session.accountId,
      `search:${row.id}`,
    );
    if (previous && (await openLocal(a, previous.cipher)) === text) continue;
    const cipher = await sealLocal(a, row.id, text);
    await localPut(
      a.session.accountId,
      `search:${row.id}`,
      { peer: row.peer, sequence: row.sequence ?? 0, cipher },
      cipher.bytes.length + 512,
    );
  }
}
export function searchTerm(query: string): string {
  const term = query.normalize('NFKC').toLocaleLowerCase('pt-BR').trim();
  if (!term || term.length > 128)
    throw new Error('Busque entre 1 e 128 caracteres.');
  return term;
}
export async function searchMessages(c: {
  a: VaultAuthority;
  query: string;
  after: string | null;
  guard: () => void;
}): Promise<{
  items: { id: string; peer: string; sequence: number; excerpt: string }[];
  next: string | null;
}> {
  const term = searchTerm(c.query),
    items: { id: string; peer: string; sequence: number; excerpt: string }[] =
      [];
  let after = c.after;
  for (let page = 0; page < 4; page++) {
    const result = await localPage<SearchRecord>(
      c.a.session.accountId,
      'search:',
      after,
    );
    for (const row of result.items) {
      c.guard();
      const text = await openLocal(c.a, row.value.cipher);
      after = row.name;
      if (text.normalize('NFKC').toLocaleLowerCase('pt-BR').includes(term))
        items.push({
          id: row.value.cipher.id,
          peer: row.value.peer,
          sequence: row.value.sequence,
          excerpt: text.slice(0, 160),
        });
      if (items.length === 16) return { items, next: after };
    }
    after = result.next;
    if (after === null) return { items, next: null };
  }
  return { items, next: after };
}
