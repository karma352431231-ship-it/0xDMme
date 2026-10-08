import type pg from 'pg';
import type { RankingComparison } from '../../shared/community-ranking/index.ts';

export interface CommunityRankingMeasurement {
  community_id: string;
  revision: string;
  created_at: Date | null;
  archived: boolean;
  followers: number;
  due_at: Date | null;
  day: RankingComparison;
  week: RankingComparison;
}

/** No participant/voter lists leave SQL; all identities are used only for exact counts. */
export async function measureRanking(
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
      VALUES ('day',interval '24 hours',interval '1 hour',24),('week',interval '7 days',interval '24 hours',7)
    ), eligible AS (
      SELECT p.* FROM hash_talk.community_posts p JOIN targets t ON t.id=p.community_id
      LEFT JOIN hash_talk.community_posts root ON root.id=p.root_id
      WHERE p.created_at>=$2::timestamptz-interval '14 days' AND p.created_at<$2
      AND NOT p.deleted AND p.active_removal IS NULL
      AND (p.root_id IS NULL OR (NOT root.deleted AND root.active_removal IS NULL))
    ), activity AS (
      SELECT e.*,period,span,bucket,intervals,
        CASE WHEN e.created_at >= $2::timestamptz-span THEN 0 ELSE 1 END AS segment
      FROM eligible e CROSS JOIN periods WHERE e.created_at>=$2::timestamptz-2*span
    ), counts AS (
      SELECT community_id,period,segment,count(DISTINCT author)::integer AS participants,
        count(*)::integer AS contributions,
        count(DISTINCT (ceil(extract(epoch FROM ($2::timestamptz-created_at))/extract(epoch FROM bucket))-1))::integer AS occupied,
        count(*) FILTER(WHERE parent_id IS NULL)::integer AS originals,
        count(DISTINCT author) FILTER(WHERE parent_id IS NULL)::integer AS authors
      FROM activity GROUP BY community_id,period,segment
    ), author_counts AS (
      SELECT community_id,period,segment,author,count(*)::double precision AS n
      FROM activity WHERE parent_id IS NULL AND author IS NOT NULL GROUP BY community_id,period,segment,author
    ), concentration AS (
      SELECT community_id,period,segment,sum(n*n) AS squares FROM author_counts GROUP BY community_id,period,segment
    ), returners AS (
      SELECT community_id,period,count(*)::integer AS n FROM (
        SELECT community_id,period,author FROM activity WHERE author IS NOT NULL
        GROUP BY community_id,period,author HAVING count(DISTINCT segment)=2
      ) users GROUP BY community_id,period
    ), discussions AS (
      SELECT a.community_id,a.period,a.segment,count(DISTINCT a.root_id)::integer AS n
      FROM activity a JOIN hash_talk.community_posts root ON root.id=a.root_id
      WHERE a.author IS NOT NULL AND root.author IS NOT NULL AND a.author<>root.author
      GROUP BY a.community_id,a.period,a.segment
    ), deltas AS (
      SELECT p.community_id,d.post_id,d.at,d.delta FROM hash_talk.community_upvote_deltas d
      JOIN hash_talk.community_posts p ON p.id=d.post_id JOIN targets t ON t.id=p.community_id
      WHERE d.at>=$2::timestamptz-interval '14 days' AND d.at<$2 AND NOT p.deleted AND p.active_removal IS NULL
    ), post_votes AS (
      SELECT d.community_id,d.post_id,period,
        CASE WHEN at >= $2::timestamptz-span THEN 0 ELSE 1 END AS segment,
        greatest(0,sum(delta))::double precision AS n
      FROM deltas d CROSS JOIN periods WHERE at >= $2::timestamptz-2*span
      GROUP BY d.community_id,d.post_id,period,segment
    ), votes AS (
      SELECT community_id,period,segment,sum(n)::integer AS n,sum(ln(1+n)) AS signal,
        count(*) FILTER(WHERE n>0)::integer AS posts FROM post_votes GROUP BY community_id,period,segment
    ), metrics AS (
      SELECT t.id,p.period,w.segment,
        jsonb_build_object('participants',coalesce(c.participants,0),'contributions',coalesce(c.contributions,0),
          'conversations',coalesce(d.n,0),'returning',coalesce(r.n,0),'occupied',coalesce(c.occupied,0),
          'intervals',p.intervals,'authors',coalesce(c.authors,0),'originals',coalesce(c.originals,0),
          'authorSquares',coalesce(h.squares,0),'upvotes',coalesce(v.n,0),'upvoteSignal',coalesce(v.signal,0),'votedPosts',coalesce(v.posts,0)) AS value
      FROM targets t CROSS JOIN periods p CROSS JOIN (VALUES(0),(1)) w(segment)
      LEFT JOIN counts c ON c.community_id=t.id AND c.period=p.period AND c.segment=w.segment
      LEFT JOIN concentration h ON h.community_id=t.id AND h.period=p.period AND h.segment=w.segment
      LEFT JOIN discussions d ON d.community_id=t.id AND d.period=p.period AND d.segment=w.segment
      LEFT JOIN returners r ON r.community_id=t.id AND r.period=p.period
      LEFT JOIN votes v ON v.community_id=t.id AND v.period=p.period AND v.segment=w.segment
    ), comparisons AS (
      SELECT t.id,p.period,jsonb_build_object(
        'current',(SELECT value FROM metrics WHERE id=t.id AND period=p.period AND segment=0),
        'previous',(SELECT value FROM metrics WHERE id=t.id AND period=p.period AND segment=1),
        'historyComplete', $2::timestamptz >= greatest(coalesce(t.created_at,s.observed_since),s.observed_since)+2*p.span
      ) AS value FROM targets t CROSS JOIN periods p CROSS JOIN hash_talk.community_ranking_settings s
    ), temporal_sources AS (
      SELECT community_id,created_at AS at,true AS contribution FROM eligible
      UNION ALL SELECT community_id,at,false FROM deltas
    ), deadlines AS (
      SELECT community_id,min(due) AS at FROM (
        SELECT e.community_id,
          CASE WHEN e.at+p.span >= $2 THEN e.at+p.span+interval '1 millisecond'
            ELSE e.at+2*p.span+interval '1 millisecond' END AS due
        FROM temporal_sources e CROSS JOIN periods p WHERE e.at+2*p.span >= $2
        UNION ALL
        SELECT e.community_id,e.at+ceil(extract(epoch FROM ($2::timestamptz-e.at))/extract(epoch FROM p.bucket))*p.bucket+interval '1 millisecond'
        FROM temporal_sources e CROSS JOIN periods p WHERE contribution AND e.at+p.span >= $2
        UNION ALL SELECT p.community_id,min(p.created_at)+interval '1 millisecond' FROM hash_talk.community_posts p JOIN targets t ON t.id=p.community_id WHERE p.created_at >= $2 GROUP BY p.community_id
        UNION ALL SELECT p.community_id,min(v.at)+interval '1 millisecond' FROM hash_talk.community_upvote_deltas v JOIN hash_talk.community_posts p ON p.id=v.post_id JOIN targets t ON t.id=p.community_id WHERE v.at >= $2 GROUP BY p.community_id
        UNION ALL SELECT id,created_at+interval '7 days' FROM targets WHERE created_at+interval '7 days'>$2
        UNION ALL SELECT t.id,greatest(coalesce(t.created_at,s.observed_since),s.observed_since)+2*p.span
          FROM targets t CROSS JOIN hash_talk.community_ranking_settings s CROSS JOIN periods p
          WHERE greatest(coalesce(t.created_at,s.observed_since),s.observed_since)+2*p.span>$2
      ) all_due GROUP BY community_id
    ) SELECT t.id AS community_id,t.revision,t.created_at,t.archived,t.followers,
      d.at AS due_at,
      (SELECT value FROM comparisons WHERE id=t.id AND period='day') AS day,
      (SELECT value FROM comparisons WHERE id=t.id AND period='week') AS week
      FROM targets t LEFT JOIN deadlines d ON d.community_id=t.id ORDER BY t.id`,
    [ids, cutoff],
  );
  return result.rows;
}
