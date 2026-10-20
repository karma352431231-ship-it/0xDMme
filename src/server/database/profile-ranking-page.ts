import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { communityPageSize } from '../../shared/communities/index.ts';
import { exploreCursor } from '../../shared/community-discovery/index.ts';
import {
  rankingVersion,
  rankingMetricVersion,
} from '../../shared/community-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
import type {
  AccountRankingOrder,
  AccountRankingPage,
} from '../../shared/account-ranking/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { readFollowerCounts } from './profile-follower-counts.ts';
type Reader = Pick<pg.PoolClient, 'query'>;
export interface ProfileRankingSelection {
  order?: AccountRankingOrder;
  actor?: string;
  client?: Reader;
}
interface Entry {
  profile_id: string;
  handle: string;
  rank: string;
  score: string;
  metrics: {
    views: number;
    upvotes: number;
    shares: number;
    comments: number;
    previousScore: number;
  };
}
/** Filters select indexed generation entries; requests never recompute whole-directory totals. */
export async function readProfileRankingPage(
  input: ProfileRankingSelection & {
    client: Reader;
    profiles: PublicProfileStore | null;
    period: RankingPeriod;
    after: string | null;
  },
): Promise<AccountRankingPage> {
  const { order, key, cursor, rank, condition, following } = selection(input);
  const found = await input.client.query<{
    id: string;
    cutoff: Date;
    expires_at: Date;
    entries: Entry[];
  }>(
    `WITH head AS (SELECT id,cutoff,expires_at FROM hash_talk.community_ranking_generations
      WHERE published AND version=$2 AND metrics_version=$3 AND expires_at>clock_timestamp()
      AND ($1::uuid IS NULL OR id=$1) ORDER BY sequence DESC LIMIT 1), ranked AS (
      SELECT e.profile_id,p.handle,e.score::text,e.metrics,${rank}::text AS rank FROM head g JOIN hash_talk.profile_ranking_entries e ON e.generation=g.id
      JOIN hash_talk.public_profiles p ON p.id=e.profile_id WHERE e.period=$4 AND ${condition} ${following}
      AND ($5::bigint IS NULL OR (${rank},e.profile_id)<($5,$6::uuid))
      ORDER BY ${rank} DESC,e.profile_id DESC LIMIT $7)
      SELECT g.*,coalesce((SELECT jsonb_agg(r ORDER BY r.rank::bigint DESC,r.profile_id DESC) FROM ranked r),'[]'::jsonb) AS entries FROM head g`,
    parameters(input, cursor, order),
  );
  const head = found.rows[0];
  if (!head)
    throw new AccountError(
      cursor ? 409 : 503,
      cursor
        ? 'Ranking updated; reload the list.'
        : 'Ranking being prepared. Try again.',
    );
  const rows = head.entries.slice(0, communityPageSize);
  const items = await project(input, rows);
  return {
    generation: head.id,
    cutoff: head.cutoff.toISOString(),
    expiresAt: head.expires_at.toISOString(),
    items,
    next: continuation(head, rows, key),
  };
}
async function project(
  input: { client: Reader; profiles: PublicProfileStore | null },
  rows: Entry[],
) {
  const ids = rows.map((r) => r.profile_id);
  const profiles = input.profiles
    ? await input.profiles.readMany(input.client, ids)
    : [];
  const descriptions = input.profiles
    ? await input.profiles.descriptions.readMany(input.client, ids)
    : new Map<string, string>();
  const followers = input.profiles
    ? await readFollowerCounts(input.client, ids)
    : new Map<string, number>();
  return rows.map((row) => ({
    profile: profiles.find((p) => p.id === row.profile_id) ?? {
      id: row.profile_id,
      handle: row.handle,
      avatar: null,
    },
    description: descriptions.get(row.profile_id) ?? '',
    followers: followers.get(row.profile_id) ?? 0,
    score: Number(row.score),
    previousScore: row.metrics.previousScore,
    views: row.metrics.views,
    upvotes: row.metrics.upvotes,
    shares: row.metrics.shares,
    comments: row.metrics.comments,
  }));
}

function selection(input: {
  order?: AccountRankingOrder;
  actor?: string;
  period: RankingPeriod;
  after: string | null;
}) {
  const order = input.order ?? 'trending';
  if (order === 'following' && !input.actor)
    throw new AccountError(403, 'Feed restricted to your own account.');
  const key =
    order === 'trending'
      ? `accounts/${input.period}`
      : `accounts/${order}/${input.period}${order === 'following' ? `/${input.actor}` : ''}`;
  const cursor = exploreCursor(input.after, key);
  const rank = {
    trending: 'e.score',
    size: 'e.followers',
    following: 'e.followers',
  }[order];
  const condition = order === 'trending' ? 'e.score>0' : 'true';
  const following =
    order === 'following'
      ? `AND EXISTS(SELECT 1 FROM hash_talk.public_profile_follows f WHERE f.follower=$8 AND f.target=e.profile_id AND f.following)
    AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$8 AND b.target=e.profile_id) OR (b.target=$8 AND b.actor=e.profile_id)))`
      : '';
  return { order, key, cursor, rank, condition, following };
}
function parameters(
  input: { period: RankingPeriod; actor?: string },
  cursor: ReturnType<typeof exploreCursor>,
  order: AccountRankingOrder,
) {
  return [
    cursor?.generation ?? null,
    rankingVersion,
    rankingMetricVersion,
    input.period,
    cursor?.rank ?? null,
    cursor?.id ?? null,
    communityPageSize + 1,
    ...(order === 'following' ? [input.actor] : []),
  ];
}
function continuation(
  head: { entries: Entry[]; id: string },
  rows: Entry[],
  key: string,
): string | null {
  const last = rows.at(-1);
  return head.entries.length > communityPageSize && last
    ? JSON.stringify({
        filter: key,
        generation: head.id,
        rank: Number(last.rank),
        id: last.profile_id,
      })
    : null;
}
