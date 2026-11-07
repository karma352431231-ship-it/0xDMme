import { currentLanguage } from '../../shared/i18n/index.ts';

function folded(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase(currentLanguage());
}
/** Map normalized substring matches back to original graphemes for safe, case-preserving highlights. */
export function messageSearchMatches(
  text: string,
  query: string,
  limit = 50,
): { start: number; end: number }[] {
  const term = folded(query).trim();
  if (!term) return [];
  const found = normalizedMatches(folded(text), term, limit);
  if (!found.length) return [];
  const matches: { start: number; end: number }[] = [];
  let offset = 0,
    cursor = 0,
    start = 0;
  for (const part of new Intl.Segmenter(currentLanguage(), {
    granularity: 'grapheme',
  }).segment(text)) {
    const next = offset + folded(part.segment).length;
    const match = found[cursor]!;
    if (offset <= match.start && next > match.start) start = part.index;
    if (next >= match.end) {
      matches.push({ start, end: part.index + part.segment.length });
      if (++cursor === found.length) break;
    }
    offset = next;
  }
  return matches;
}
export function messageSearchExcerpt(text: string, query: string): string {
  const match = messageSearchMatches(text, query, 1)[0];
  const start = Math.max(0, (match?.start ?? 0) - 24);
  return text.slice(start, Math.max(start + 160, match?.end ?? 0));
}

function normalizedMatches(
  normalized: string,
  term: string,
  limit: number,
): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  for (
    let at = normalized.indexOf(term);
    at !== -1 && found.length < limit;
    at = normalized.indexOf(term, at + term.length)
  )
    found.push({ start: at, end: at + term.length });
  return found;
}
