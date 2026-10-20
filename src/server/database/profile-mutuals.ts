import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityCursor,
  communityPageSize,
} from '../../shared/communities/index.ts';
import type { MutualFollowers } from '../../shared/profile-social/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type pg from 'pg';

/** Signed, bounded projection of public identities only; never private contacts/account IDs. */
export async function readProfileMutuals(input: {
  client: pg.PoolClient;
  actor: string;
  profiles: PublicProfileStore;
  data: Record<string, unknown>;
}): Promise<MutualFollowers> {
  keys(input.data, ['target', 'after']);
  const target = uuid(input.data['target']),
    after = communityCursor(input.data['after']);
  const exists = await input.client.query(
    'SELECT 1 FROM hash_talk.public_profiles WHERE id=$1',
    [target],
  );
  if (!exists.rowCount)
    throw new AccountError(404, 'Public profile unavailable.');
  const result = await input.client.query<{ total: string; ids: string[] }>(
    `WITH eligible AS (
      SELECT mine.target AS id FROM hash_talk.public_profile_follows mine
      JOIN hash_talk.public_profile_follows theirs ON theirs.follower=mine.target AND theirs.target=$2 AND theirs.following
      WHERE mine.follower=$1 AND mine.following AND mine.target<>$2
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND (
        (b.actor=$1 AND b.target IN (mine.target,$2)) OR (b.target=$1 AND b.actor IN (mine.target,$2))
        OR (b.actor=mine.target AND b.target=$2) OR (b.actor=$2 AND b.target=mine.target)))
    ) SELECT (SELECT count(*) FROM eligible)::text AS total,
      ARRAY(SELECT id FROM eligible WHERE ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4) AS ids`,
    [input.actor, target, after, communityPageSize + 1],
  );
  const row = result.rows[0]!,
    ids = row.ids.slice(0, communityPageSize);
  const identities = await input.profiles.identities(input.client, ids);
  return {
    items: ids.map((id) => identities.get(id)!).filter(Boolean),
    total: Number(row.total),
    next: row.ids.length > communityPageSize ? ids.at(-1)! : null,
  };
}
