import type pg from 'pg';
import type { ModeratedPostContext } from '../../shared/moderation-details/index.ts';

/** This post-module contract projects current text only to the verified author. */
export async function postReviewContext(
  client: pg.PoolClient,
  input: { owner: string; media: string },
): Promise<ModeratedPostContext | null> {
  const result = await client.query<{
    id: string;
    community: string;
    communityName: string;
    title: string;
    text: string;
    reply: boolean;
    deleted: boolean;
  }>(
    `SELECT p.id,p.community_id AS community,c.name AS "communityName",p.title,p.text,
      p.parent_id IS NOT NULL AS reply,p.deleted
     FROM hash_talk.community_posts p JOIN hash_talk.communities c ON c.id=p.community_id
     WHERE p.author=$1 AND cardinality(p.media_ids)>0 AND p.media_ids @> ARRAY[$2::uuid]
     ORDER BY p.id LIMIT 1`,
    [input.owner, input.media],
  );
  return result.rows[0] ?? null;
}
