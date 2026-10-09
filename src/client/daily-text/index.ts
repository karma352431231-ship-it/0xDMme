import { decodeDailyText, validReaction } from '../../shared/daily/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { DailyText, MessageRelation } from '../../shared/daily/index.ts';
export interface DailyRow {
  archived?: boolean;
  state?: string;
  id: string;
  hash: string;
  text: string;
  own: boolean;
  kind: string;
  peer: string;
  sequence?: number;
  author?: string;
  relation?: MessageRelation;
}
export type DailyView<T> = T & {
  content: DailyText;
  edited: boolean;
  reactions: string[];
};
/** Profile cards are identity metadata; authenticated actions never become bubbles. */
export function dailyViews<T extends DailyRow>(
  rows: readonly T[],
): DailyView<T>[] {
  const base = rows
    .filter((row) => !row.relation && row.kind !== 'profile')
    .map((row) => ({
      ...row,
      content: rowContent(row),
      edited: false,
      reactions: [] as string[],
    }));
  const byId = new Map(base.map((row) => [row.id, row])),
    reacted = new Map<string, Map<string, string>>();
  for (const row of [...rows].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  )) {
    applyAction(row, byId, reacted);
  }

  for (const row of base)
    row.reactions = [...(reacted.get(row.id)?.values() ?? [])].filter(Boolean);
  return base;
}
function applyAction<T extends DailyRow>(
  row: T,
  byId: Map<string, DailyView<T>>,
  reacted: Map<string, Map<string, string>>,
): void {
  if (row.state === 'Suspensa') return;
  const relation = row.relation;
  if (!relation) return;
  const target = byId.get(relation.id);
  if (!target) return;
  if (relation.hash !== target.hash || relation.author !== target.author)
    throw new Error('Alteração divergente da mensagem original.');
  const content = decodeDailyText(row.text);
  if (relation.type === 'edit') updateEdit(target, row, content);
  else updateReaction(target.id, row, content.text, reacted);
}
function updateEdit<T extends DailyRow>(
  target: DailyView<T>,
  row: T,
  content: DailyText,
): void {
  if (row.author !== target.author || target.kind !== 'text')
    throw new Error('Edição por outro autor.');
  target.content = content;
  target.edited = true;
}
function updateReaction(
  target: string,
  row: DailyRow,
  text: string,
  reacted: Map<string, Map<string, string>>,
): void {
  if (!validReaction(text)) throw new Error('Reação inválida.');
  const values = reacted.get(target) ?? new Map<string, string>();
  values.set(row.author ?? String(row.own), text);
  reacted.set(target, values);
}
function rowContent(row: DailyRow): DailyText {
  if (row.kind === 'text') return decodeDailyText(row.text);
  if (row.kind === 'attachment')
    return decodeDailyText(
      attachmentContent(JSON.parse(row.text) as unknown).caption,
    );
  return { text: row.text, reply: null, forwarded: false };
}
