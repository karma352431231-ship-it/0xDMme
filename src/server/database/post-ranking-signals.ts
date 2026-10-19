import type pg from 'pg';
import { visiblePost } from './community-post-visibility.ts';
import type {
  RankingPeriod,
  ReceivedEngagement,
} from '../../shared/community-ranking/index.ts';

export interface PostRankingSignals extends ReceivedEngagement {
  id: string;
  period: RankingPeriod;
  due_at: Date | null;
}

/** Aggregate public receipt signals; no reader or voter identities leave SQL. */
export async function measurePostSignals(
  client: Pick<pg.PoolClient, 'query'>,
  input: { ids: string[]; cutoff: Date; target: 'community_id' | 'author' },
): Promise<PostRankingSignals[]> {
  const result = await client.query<PostRankingSignals>(
    `WITH periods(period,span) AS (
      VALUES ('day',interval '24 hours'),('week',interval '168 hours'),('month',interval '720 hours')
    ), targets AS MATERIALIZED (
      SELECT p.id,p.${input.target} AS target,p.author FROM hash_talk.community_posts p
      WHERE p.${input.target}=ANY($1::uuid[]) AND p.parent_id IS NULL AND ${visiblePost('p')}
    ), events AS (
      SELECT p.target AS id,e.post_id,e.at,e.views::double precision AS views,e.shares::double precision AS shares,
        0::double precision AS votes,NULL::uuid AS commenter FROM targets p
      JOIN hash_talk.community_post_engagement e ON e.post_id=p.id AND e.at >= $2::timestamptz-interval '720 hours'
      UNION ALL
      SELECT p.target,d.post_id,d.at,0,0,d.delta,NULL FROM targets p
      JOIN hash_talk.community_upvote_deltas d ON d.post_id=p.id AND d.at >= $2::timestamptz-interval '720 hours'
      UNION ALL
      SELECT p.target,r.root_id,r.created_at,0,0,0,r.author FROM targets p
      JOIN hash_talk.community_posts r ON r.root_id=p.id AND r.created_at >= $2::timestamptz-interval '720 hours'
      WHERE r.author<>p.author AND ${visiblePost('r')}
    ), per_post AS (
      SELECT e.id,e.post_id,p.period,sum(views) AS views,sum(shares) AS shares,
        greatest(0,sum(votes)) AS upvotes,count(commenter)::integer AS comments
      FROM events e CROSS JOIN periods p WHERE e.at >= $2::timestamptz-p.span AND e.at<$2
      GROUP BY e.id,e.post_id,p.period
    ), totals AS (
      SELECT id,period,sum(views)::bigint AS views,sum(shares)::bigint AS shares,sum(upvotes)::bigint AS upvotes,
        sum(comments)::integer AS comments,count(*) FILTER(WHERE comments>0)::integer AS conversations,
        count(*) FILTER(WHERE views+shares+upvotes+comments>0)::integer AS "engagedPosts",
        sum(ln(1+views)) AS "viewSignal",sum(ln(1+shares)) AS "shareSignal",sum(ln(1+upvotes)) AS "upvoteSignal",
        count(*) FILTER(WHERE upvotes>0)::integer AS "votedPosts"
      FROM per_post GROUP BY id,period
    ), commenters AS (
      SELECT e.id,p.period,count(DISTINCT commenter)::integer AS n FROM events e CROSS JOIN periods p
      WHERE e.at >= $2::timestamptz-p.span AND e.at<$2 GROUP BY e.id,p.period
    ), deadlines AS (
      SELECT id,min(at) AS at FROM (
        SELECT e.id,e.at+p.span+interval '1 millisecond' AS at FROM events e CROSS JOIN periods p
        WHERE e.at+p.span >= $2 AND e.at<$2
        UNION ALL SELECT id,at+interval '1 millisecond' FROM events WHERE at >= $2
      ) d GROUP BY id
    ) SELECT i.id,p.period,coalesce(t.views,0)::double precision AS views,
      coalesce(t.shares,0)::double precision AS shares,coalesce(t.upvotes,0)::double precision AS upvotes,
      coalesce(t.comments,0)::integer AS comments,coalesce(c.n,0)::integer AS commenters,
      coalesce(t.conversations,0)::integer AS conversations,coalesce(t."engagedPosts",0)::integer AS "engagedPosts",
      coalesce(t."viewSignal",0)::double precision AS "viewSignal",
      coalesce(t."shareSignal",0)::double precision AS "shareSignal",
      coalesce(t."upvoteSignal",0)::double precision AS "upvoteSignal",
      coalesce(t."votedPosts",0)::integer AS "votedPosts",d.at AS due_at
      FROM unnest($1::uuid[]) i(id) CROSS JOIN periods p
      LEFT JOIN totals t ON t.id=i.id AND t.period=p.period
      LEFT JOIN commenters c ON c.id=i.id AND c.period=p.period LEFT JOIN deadlines d ON d.id=i.id`,
    [input.ids, input.cutoff],
  );
  return result.rows;
}
