import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';

/** Public follower totals for one bounded page of profiles; no follower identities. */
export async function readFollowerCounts(
  client: Pick<pg.PoolClient, 'query'>,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length > 24) throw new AccountError(400, 'Profile page too large.');
  const result = await client.query<{ target: string; followers: string }>(
    `SELECT target,count(*)::text AS followers FROM hash_talk.public_profile_follows
    WHERE target=ANY($1::uuid[]) AND following GROUP BY target`,
    [ids],
  );
  return new Map(result.rows.map((row) => [row.target, Number(row.followers)]));
}
