import { AccountError } from '../account/index.ts';
import { reservedCommunitySlug } from '../app-routes/index.ts';
export function communitySlug(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(value) ||
    value.length > 96 ||
    reservedCommunitySlug(value)
  )
    throw new AccountError(400, 'Link de comunidade inválido.');
  return value;
}
/** Stable address assigned once at creation; display-name edits do not rename it. */
export function communitySlugBase(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'community';
  const bounded = boundedSlug(base).replace(/-+$/u, '');
  return reservedCommunitySlug(bounded) ? `${bounded}-community` : bounded;
}

function boundedSlug(value: string): string {
  let result = '';
  for (const character of value) {
    if (result.length + character.length > 60) break;
    result += character;
  }
  return result;
}
