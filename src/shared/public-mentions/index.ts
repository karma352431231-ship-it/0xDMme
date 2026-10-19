import { communityNameKey } from '../community-name/index.ts';
import { AccountError, uuid } from '../account/index.ts';

export interface PublicMention {
  kind: 'user' | 'community';
  id: string;
  label: string;
}
export interface MentionSpan extends PublicMention {
  start: number;
  end: number;
}
export const mentionLimit = 32;
const pattern =
  /@\[((?:\\[\]\\]|[^\]\\\r\n]){1,200})\]\(([uc]):([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\)/gu;
function labelOf(raw: string): string | null {
  const label = raw.replace(/\\([\]\\])/gu, '$1');
  return label.length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(label) ? label : null;
}
/** Only our two explicit UUID targets are links. Other markup remains literal. */
export function mentionSpans(text: string): MentionSpan[] {
  const spans: MentionSpan[] = [];
  for (const match of text.matchAll(pattern)) {
    const label = labelOf(match[1]!);
    if (label)
      spans.push({
        kind: match[2] === 'u' ? 'user' : 'community',
        id: match[3]!,
        label,
        start: match.index,
        end: match.index + match[0].length,
      });
  }
  return spans;
}
export function mentionToken(mention: PublicMention): string {
  if (!labelOf(mention.label.replaceAll('\\', '\\\\').replaceAll(']', '\\]')))
    throw new AccountError(400, 'Invalid mention name.');
  const label = mention.label.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
  return `@[${label}](${mention.kind === 'user' ? 'u' : 'c'}:${uuid(mention.id)})`;
}
export function mentionHref(mention: PublicMention): string {
  const id = uuid(mention.id);
  return mention.kind === 'user' ? `#users?id=${id}` : `#communities?id=${id}`;
}
export function mentionPlainText(text: string): string {
  let result = '',
    end = 0;
  for (const span of mentionSpans(text)) {
    result += text.slice(end, span.start) + '@' + span.label;
    end = span.end;
  }
  return result + text.slice(end);
}
/** Visible limits stay unchanged; reference overhead has its own bounded budget. */
export function mentionText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum + mentionLimit * 250)
    throw new AccountError(400, 'Text with mentions is too long.');
  if (
    mentionSpans(value).length > mentionLimit ||
    mentionPlainText(value).length > maximum
  )
    throw new AccountError(400, 'Text or mention count exceeds the limit.');
  return value;
}
export function mentionQuery(value: unknown): string {
  if (typeof value !== 'string')
    throw new AccountError(400, 'Invalid mention search.');
  const query = communityNameKey(value);
  if (query.length < 2 || query.length > 100 || /[\p{Cc}\p{Cf}]/u.test(query))
    throw new AccountError(400, 'Enter 2–100 characters to search.');
  return query;
}
