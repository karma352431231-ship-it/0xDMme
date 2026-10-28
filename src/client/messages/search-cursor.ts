/**
 * Message search pages through recent server history first, then through the
 * local archive. A page token starting with `archive:` belongs to the archive
 * phase; the bare marker means "archive, from its first page".
 */
const archivePrefix = 'archive:';

/** Token returned when recent history is exhausted and the archive is next. */
export const archiveStart = archivePrefix;

export interface SearchPosition {
  archived: boolean;
  after: string | null;
}

export function searchPosition(token: string | null): SearchPosition {
  if (!token?.startsWith(archivePrefix))
    return { archived: false, after: token };
  return { archived: true, after: token.slice(archivePrefix.length) || null };
}

export function archiveToken(next: string | null): string | null {
  return next === null ? null : archivePrefix + next;
}
