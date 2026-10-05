import { searchTerm } from '../message-search/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { object } from '../../shared/account/index.ts';
import type { GroupView } from './reader.ts';
interface Cursor {
  group: string;
  before: number | null;
}
export async function searchGroupCopies(c: {
  query: string;
  after: string | null;
  groups: readonly string[];
  read: (
    group: string,
    before: number | null,
  ) => Promise<{ views: GroupView[]; before: number | null }>;
  guard: () => void;
}) {
  const term = searchTerm(c.query);
  let cursor = readCursor(c.after, c.groups);
  const items: {
    id: string;
    peer: string;
    sequence: number;
    excerpt: string;
  }[] = [];
  for (let page = 0; page < 4 && cursor; page++) {
    c.guard();
    const group = cursor.group;
    const result = await c.read(group, cursor.before);
    c.guard();
    for (const view of result.views) {
      const text = searchableText(view);
      if (text.normalize('NFKC').toLocaleLowerCase('pt-BR').includes(term))
        items.push({
          id: view.id,
          peer: group,
          sequence: view.sequence,
          excerpt: text.slice(0, 160),
        });
    }
    const nextGroup = c.groups[c.groups.indexOf(group) + 1];
    cursor =
      result.before !== null
        ? { group, before: result.before }
        : nextGroup
          ? { group: nextGroup, before: null }
          : null;
    if (items.length >= 16) break;
  }
  return { items, next: cursor ? JSON.stringify(cursor) : null };
}
function searchableText(view: GroupView): string {
  if (view.kind !== 'attachment') return view.text;
  const attachment = attachmentContent(JSON.parse(view.text) as unknown);
  return attachment.name + ' ' + attachment.caption;
}
function readCursor(
  after: string | null,
  groups: readonly string[],
): Cursor | null {
  if (after === null)
    return groups[0] ? { group: groups[0], before: null } : null;
  if (after.length > 256) throw new Error('Página de busca inválida.');
  const data = object(JSON.parse(after) as unknown),
    group = data['group'],
    before = data['before'];
  if (typeof group !== 'string' || !groups.includes(group))
    throw new Error('Grupo da busca mudou. Inicie novamente.');
  return { group, before: searchBefore(before) };
}
function searchBefore(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('Página de busca inválida.');
  return value;
}
