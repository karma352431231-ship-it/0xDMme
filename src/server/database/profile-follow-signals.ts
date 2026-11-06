import type pg from 'pg';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';

export interface FollowRankingSignals {
  id: string;
  period: RankingPeriod;
  newFollowers: number;
  /** When a counted follow leaves this window, if before the next change. */
  due_at: Date | null;
}

/**
 * New followers of each profile per ranking period (owner, 06/11/2026): live
 * follows whose start falls in the window. Follows without a date predate
 * migration 105 and never count. `window` works as in measurePostSignals.
 */
export async function measureFollowSignals(
  client: Pick<pg.PoolClient, 'query'>,
  input: { ids: string[]; cutoff: Date; window?: 'current' | 'previous' },
): Promise<FollowRankingSignals[]> {
  const result = await client.query<FollowRankingSignals>(
    `WITH periods(period,span) AS (
      VALUES ('day',interval '24 hours'),('week',interval '168 hours'),('month',interval '720 hours')
    ), follows AS (
      SELECT f.target AS id,f.followed_at AS at FROM hash_talk.public_profile_follows f
      WHERE f.target=ANY($1::uuid[]) AND f.following AND f.followed_at IS NOT NULL
      AND f.followed_at >= $2::timestamptz-interval '720 hours'*$3 AND f.followed_at<$2::timestamptz
    ) SELECT i.id,p.period,
      count(f.at) FILTER(WHERE f.at >= $2::timestamptz-p.span*$3 AND f.at<$2::timestamptz-p.span*($3-1))::integer AS "newFollowers",
      min(f.at+p.span*$3+interval '1 millisecond') FILTER(WHERE f.at >= $2::timestamptz-p.span*$3 AND f.at<$2::timestamptz-p.span*($3-1)) AS due_at
      FROM unnest($1::uuid[]) i(id) CROSS JOIN periods p LEFT JOIN follows f ON f.id=i.id
      GROUP BY i.id,p.period`,
    [input.ids, input.cutoff, input.window === 'previous' ? 2 : 1],
  );
  return result.rows;
}
