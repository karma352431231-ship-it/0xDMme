import { AccountError } from '../account/index.ts';

/** Public post text only; the search never receives private message contents. */
export function postSearchQuery(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new AccountError(400, 'Invalid post search.');
  const query = value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  if (query.length > 100 || !/[\p{L}\p{N}]/u.test(query))
    throw new AccountError(400, 'Invalid post search.');
  return query;
}

export function postSearchWords(query: string): string[] {
  return [...new Set(query.match(/[\p{L}\p{N}_]+/gu) ?? [])];
}

export function postSearchMatches(
  text: string,
  query: string,
): { start: number; end: number }[] {
  const words = new Set(postSearchWords(query));
  return [...text.matchAll(/[\p{L}\p{N}_]+/gu)]
    .filter((match) => words.has(match[0].normalize('NFKC').toLowerCase()))
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
}
