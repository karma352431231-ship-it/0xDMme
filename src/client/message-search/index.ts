import { currentLanguage } from '../../shared/i18n/index.ts';
import { messageStates } from '../message-state/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
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
  /** The signed send time, sealed like the text; older records lack it. */
  sent?: LocalCipher;
}
export interface MessageSearchItem {
  id: string;
  peer: string;
  sequence: number;
  excerpt: string;
  sentAt?: number;
}
type SearchRow = DailyRow & { sentAt?: number };
export async function indexSearch(
  a: VaultAuthority,
  rows: readonly SearchRow[],
): Promise<void> {
  for (const row of dailyViews(rows)) {
    if (row.kind === 'profile') continue;
    if (row.state === messageStates.suspended) {
      await localDelete(a.session.accountId, `search:${row.id}`);
      continue;
    }
    await indexRow(a, row);
  }
}
/** The words a message is found by: its text, and an attachment's name. */
function searchableText(row: DailyView<SearchRow>): string {
  return row.kind === 'attachment'
    ? attachmentContent(JSON.parse(row.text) as unknown).name +
        ' ' +
        row.content.text
    : row.content.text;
}
/** Up to date when the text matches and a known send time is already kept. */
async function indexed(
  a: VaultAuthority,
  previous: SearchRecord | null,
  row: { sentAt?: number },
  text: string,
): Promise<boolean> {
  if (!previous) return false;
  // Records indexed before send times were kept gain theirs on the next read.
  if (!previous.sent && row.sentAt !== undefined) return false;
  return (await openLocal(a, previous.cipher)) === text;
}
async function indexRow(
  a: VaultAuthority,
  row: DailyView<SearchRow>,
): Promise<void> {
  const text = searchableText(row);
  const previous = await localGet<SearchRecord>(
    a.session.accountId,
    `search:${row.id}`,
  );
  if (await indexed(a, previous, row, text)) return;
  const cipher = await sealLocal(a, row.id, text),
    sent =
      row.sentAt === undefined
        ? undefined
        : await sealLocal(a, `${row.id}:sent`, String(row.sentAt));
  await localPut(
    a.session.accountId,
    `search:${row.id}`,
    {
      peer: row.peer,
      sequence: row.sequence ?? 0,
      cipher,
      ...(sent ? { sent } : {}),
    },
    cipher.bytes.length + (sent?.bytes.length ?? 0) + 512,
  );
}
async function sentTime(
  a: VaultAuthority,
  sent: LocalCipher | undefined,
): Promise<{ sentAt?: number }> {
  if (!sent) return {};
  const value = Number(await openLocal(a, sent));
  return Number.isFinite(value) ? { sentAt: value } : {};
}
export function searchTerm(query: string): string {
  const term = query
    .normalize('NFKC')
    .toLocaleLowerCase(currentLanguage())
    .trim();
  if (!term || term.length > 128)
    throw new Error('Enter between 1 and 128 characters.');
  return term;
}
export async function searchMessages(c: {
  a: VaultAuthority;
  query: string;
  after: string | null;
  guard: () => void;
}): Promise<{ items: MessageSearchItem[]; next: string | null }> {
  const term = searchTerm(c.query),
    items: MessageSearchItem[] = [];
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
      if (
        text
          .normalize('NFKC')
          .toLocaleLowerCase(currentLanguage())
          .includes(term)
      )
        items.push({
          id: row.value.cipher.id,
          peer: row.value.peer,
          sequence: row.value.sequence,
          excerpt: text.slice(0, 160),
          ...(await sentTime(c.a, row.value.sent)),
        });
      if (items.length === 16) return { items, next: after };
    }
    after = result.next;
    if (after === null) return { items, next: null };
  }
  return { items, next: after };
}
