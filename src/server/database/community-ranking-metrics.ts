import { visiblePost } from './community-post-visibility.ts';
import type pg from 'pg';
import {
  emptyRankingMetrics,
  rankingPeriods,
} from '../../shared/community-ranking/index.ts';
import type { RankingComparison } from '../../shared/community-ranking/index.ts';
import { measurePostSignals } from './post-ranking-signals.ts';

export interface CommunityRankingMeasurement {
  community_id: string;
  revision: string;
  created_at: Date | null;
  archived: boolean;
  followers: number;
  due_at: Date | null;
  day: RankingComparison;
  week: RankingComparison;
  month: RankingComparison;
}

/** Counts current-window public activity, with no preceding-window dependency. */
export async function measureRanking(
  client: Pick<pg.PoolClient, 'query'>,
  ids: string[],
  cutoff: Date,
): Promise<CommunityRankingMeasurement[]> {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query('SET LOCAL jit = off');
    const result = await readRanking(client, ids, cutoff);
    const signals = await measurePostSignals(client, {
      ids,
      cutoff,
      target: 'community_id',
    });
    for (const row of result) mergeSignals(row, signals);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function mergeSignals(
  row: CommunityRankingMeasurement,
  signals: Awaited<ReturnType<typeof measurePostSignals>>,
): void {
  for (const period of rankingPeriods) {
    const signal = signals.find(
      (s) => s.id === row.community_id && s.period === period,
    )!;
    row[period].current = {
      ...emptyRankingMetrics(),
      ...row[period].current,
      ...signal,
    };
    if (signal.due_at && (!row.due_at || signal.due_at < row.due_at))
      row.due_at = signal.due_at;
  }
}

async function readRanking(
  client: Pick<pg.PoolClient, 'query'>,
  ids: string[],
  cutoff: Date,
): Promise<CommunityRankingMeasurement[]> {
  const result = await client.query<CommunityRankingMeasurement>(
    `WITH targets AS (
      SELECT c.id,c.created_at,c.archived,s.revision::text,
        (SELECT count(*)::integer FROM hash_talk.community_follows f WHERE f.community_id=c.id) AS followers
      FROM hash_talk.communities c JOIN hash_talk.community_ranking_state s ON s.community_id=c.id WHERE c.id=ANY($1::uuid[])
    ), periods(period,span,bucket,intervals) AS (
      VALUES ('day',interval '24 hours',interval '1 hour',24),
        ('week',interval '168 hours',interval '24 hours',7),('month',interval '720 hours',interval '24 hours',30)
    ), eligible AS (
      SELECT p.* FROM hash_talk.community_posts p JOIN targets t ON t.id=p.community_id
      LEFT JOIN hash_talk.community_posts root ON root.id=p.root_id
      WHERE p.created_at>=$2::timestamptz-interval '720 hours' AND ${visiblePost('p')}
      AND (p.root_id IS NULL OR (${visiblePost('root')}))
    ), voters AS (
      SELECT p.community_id,v.profile_id AS actor,v.voted_at AS at FROM hash_talk.community_votes v
      JOIN hash_talk.community_posts p ON p.id=v.post_id JOIN targets t ON t.id=p.community_id
      LEFT JOIN hash_talk.community_posts root ON root.id=p.root_id
      WHERE v.position<>0 AND v.voted_at>=$2::timestamptz-interval '720 hours' AND ${visiblePost('p')}
      AND (p.root_id IS NULL OR (${visiblePost('root')}))
    ), sources AS (
      SELECT community_id,author AS actor,created_at AS at FROM eligible
      UNION ALL SELECT community_id,actor,at FROM voters
    ), active AS (
      SELECT a.community_id,p.period,count(DISTINCT a.actor)::integer AS n
      FROM sources a CROSS JOIN periods p WHERE a.at>=$2::timestamptz-p.span AND a.at<$2
      GROUP BY a.community_id,p.period
    ), activity AS (
      SELECT e.*,p.* FROM eligible e CROSS JOIN periods p
      WHERE e.created_at>=$2::timestamptz-p.span AND e.created_at<$2
    ), counts AS (
      SELECT community_id,period,count(*)::integer AS contributions,
        count(DISTINCT (ceil(extract(epoch FROM ($2::timestamptz-created_at))/extract(epoch FROM bucket))-1))::integer AS occupied,
        count(*) FILTER(WHERE parent_id IS NULL)::integer AS originals,
        count(DISTINCT author) FILTER(WHERE parent_id IS NULL)::integer AS authors
      FROM activity GROUP BY community_id,period
    ), authors AS (
      SELECT community_id,period,author,count(*)::double precision AS n FROM activity
      WHERE parent_id IS NULL AND author IS NOT NULL GROUP BY community_id,period,author
    ), concentration AS (
      SELECT community_id,period,sum(n*n) AS squares FROM authors GROUP BY community_id,period
    ), returners AS (
      SELECT community_id,period,count(*)::integer AS n FROM (
        SELECT community_id,period,author FROM activity WHERE author IS NOT NULL
        GROUP BY community_id,period,author
        HAVING count(DISTINCT ceil(extract(epoch FROM ($2::timestamptz-created_at))/extract(epoch FROM bucket)))>1
      ) people GROUP BY community_id,period
    ), metrics AS (
      SELECT t.id,p.period,jsonb_build_object('current',jsonb_build_object(
        'participants',coalesce(a.n,0),'contributions',coalesce(c.contributions,0),
        'returning',coalesce(r.n,0),'occupied',coalesce(c.occupied,0),'intervals',p.intervals,
        'authors',coalesce(c.authors,0),'originals',coalesce(c.originals,0),'authorSquares',coalesce(h.squares,0)),
        'previous',jsonb_build_object('participants',0),
        'historyComplete',$2::timestamptz>=s.engagement_observed_since+p.span) AS value
      FROM targets t CROSS JOIN periods p CROSS JOIN hash_talk.community_ranking_settings s
      LEFT JOIN active a ON a.community_id=t.id AND a.period=p.period
      LEFT JOIN counts c ON c.community_id=t.id AND c.period=p.period
      LEFT JOIN concentration h ON h.community_id=t.id AND h.period=p.period
      LEFT JOIN returners r ON r.community_id=t.id AND r.period=p.period
    ), deadlines AS (
      SELECT community_id,min(at) AS at FROM (
        SELECT a.community_id,a.at+p.span+interval '1 millisecond' AS at FROM sources a CROSS JOIN periods p
          WHERE a.at+p.span >= $2 AND a.at<$2
        UNION ALL SELECT community_id,at+interval '1 millisecond' FROM sources WHERE at >= $2
        UNION ALL SELECT a.community_id,
          a.created_at+ceil(extract(epoch FROM ($2::timestamptz-a.created_at))/extract(epoch FROM p.bucket))*p.bucket+interval '1 millisecond'
          FROM eligible a CROSS JOIN periods p WHERE a.created_at+p.span >= $2 AND a.created_at<$2
        UNION ALL SELECT id,created_at+interval '168 hours' FROM targets WHERE created_at+interval '168 hours'>$2
        UNION ALL SELECT t.id,s.engagement_observed_since+p.span FROM targets t CROSS JOIN periods p
          CROSS JOIN hash_talk.community_ranking_settings s WHERE s.engagement_observed_since+p.span>$2
      ) due GROUP BY community_id
    ) SELECT t.id AS community_id,t.revision,t.created_at,t.archived,t.followers,d.at AS due_at,
      (SELECT value FROM metrics WHERE id=t.id AND period='day') AS day,
      (SELECT value FROM metrics WHERE id=t.id AND period='week') AS week,
      (SELECT value FROM metrics WHERE id=t.id AND period='month') AS month
      FROM targets t LEFT JOIN deadlines d ON d.community_id=t.id ORDER BY t.id`,
    [ids, cutoff],
  );
  return result.rows;
}
