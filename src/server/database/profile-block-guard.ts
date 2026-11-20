import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';

type Client = Pick<pg.PoolClient, 'query'>;

/**
 * Whether any of `profiles` blocked `viewer`. A block stops every interaction
 * of the blocked profile with the one that blocked it: replies, votes,
 * follows, shares and messages (owner, 20/11/2026).
 */
export async function blockedByAny(
  client: Client,
  viewer: string,
  profiles: readonly (string | null)[],
): Promise<boolean> {
  const ids = [
    ...new Set(
      profiles.filter((id): id is string => id !== null && id !== viewer),
    ),
  ];
  if (!ids.length) return false;
  const rows = await client.query(
    'SELECT 1 FROM hash_talk.social_blocks WHERE blocked AND target=$1 AND actor=ANY($2::uuid[]) LIMIT 1',
    [viewer, ids],
  );
  return Boolean(rows.rowCount);
}

export async function requireNotBlockedBy(
  client: Client,
  viewer: string,
  profiles: readonly (string | null)[],
): Promise<void> {
  if (await blockedByAny(client, viewer, profiles))
    throw new AccountError(403, 'This profile blocked you.');
}
