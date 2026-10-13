import { AccountError } from '../account/index.ts';
/** Names are unique across case and compatibility forms, preserving accents. */
export function communityName(value: string): string {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 100 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new AccountError(400, 'Nome da comunidade inválido.');
  return name;
}
export function communityNameKey(value: string): string {
  // Match the existing PostgreSQL ICU root locale on version 16 and later.
  return communityName(value).toLowerCase().replaceAll('ς', 'σ');
}
