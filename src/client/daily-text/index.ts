import { messageStates } from '../message-state/index.ts';
import {
  decodeDailyText,
  validReaction,
  pinUntil,
} from '../../shared/daily/index.ts';
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
/** The newest pin or unpin of a message by anyone in the conversation. */
export interface MessagePin {
  /** When the pin ends; 0 after an unpin, Number.MAX_SAFE_INTEGER for none. */
  until: number;
  sequence: number;
  own: boolean;
}
export type DailyView<T> = T & {
  content: DailyText;
  edited: boolean;
  reactions: string[];
  ownReaction: string;
  pin: MessagePin | null;
};
/** A pin shows while its end is still ahead. */
export function activePin(pin: MessagePin | null, now = Date.now()): boolean {
  return !!pin && pin.until > now;
}
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
      ownReaction: '',
      reactions: [] as string[],
      pin: null as MessagePin | null,
    }));
  const byId = new Map(base.map((row) => [row.id, row])),
    reacted = new Map<string, Map<string, { text: string; own: boolean }>>();
  for (const row of [...rows].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  )) {
    applyAction(row, byId, reacted);
  }

  for (const row of base) {
    const values = [...(reacted.get(row.id)?.values() ?? [])];
    row.reactions = values.map((value) => value.text).filter(Boolean);
    row.ownReaction = values.find((value) => value.own)?.text ?? '';
  }
  return base;
}
function applyAction<T extends DailyRow>(
  row: T,
  byId: Map<string, DailyView<T>>,
  reacted: Map<string, Map<string, { text: string; own: boolean }>>,
): void {
  if (row.state === messageStates.suspended) return;
  const relation = row.relation;
  if (!relation) return;
  const target = byId.get(relation.id);
  if (!target) return;
  if (relation.hash !== target.hash || relation.author !== target.author)
    throw new Error('Change differs from the original message.');
  const content = decodeDailyText(row.text);
  if (relation.type === 'edit') updateEdit(target, row, content);
  else if (relation.type === 'pin') updatePin(target, row, content.text);
  else updateReaction(target.id, row, content.text, reacted);
}
function updateEdit<T extends DailyRow>(
  target: DailyView<T>,
  row: T,
  content: DailyText,
): void {
  if (row.author !== target.author || target.kind !== 'text')
    throw new Error('Edit by another author.');
  target.content = content;
  target.edited = true;
}
function updatePin<T extends DailyRow>(
  target: DailyView<T>,
  row: T,
  text: string,
): void {
  const until = pinUntil(text);
  if (until === null) throw new Error('Invalid pin.');
  // Rows arrive sorted by sequence, so the last action wins.
  target.pin = { until, sequence: row.sequence ?? 0, own: row.own };
}
function updateReaction(
  target: string,
  row: DailyRow,
  text: string,
  reacted: Map<string, Map<string, { text: string; own: boolean }>>,
): void {
  if (!validReaction(text)) throw new Error('Invalid reaction.');
  const values =
    reacted.get(target) ?? new Map<string, { text: string; own: boolean }>();
  values.set(row.author ?? String(row.own), { text, own: row.own });
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
