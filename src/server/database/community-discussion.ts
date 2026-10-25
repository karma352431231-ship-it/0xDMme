import { blockedPost, visiblePost } from './community-post-visibility.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { withPostInteractions } from './community-interaction-view.ts';
import { communityPageSize } from '../../shared/communities/index.ts';
import {
  discussionCursor,
  discussionKey,
} from '../../shared/community-discussion/index.ts';
import type {
  DiscussionOrder,
  DiscussionCursor,
  DiscussionSelection,
} from '../../shared/community-discussion/index.ts';

interface DiscussionTarget {
  community: string;
  parent: string;
  actor?: string;
}
type PostProjection = (ids: string[]) => Promise<CommunityPost[]>;

/** Owns the bounded discussion projection; callers retain generic post lookups. */
export async function readDiscussionPage(
  client: Pick<pg.PoolClient, 'query'>,
  target: DiscussionTarget,
  selection: DiscussionSelection,
  project: PostProjection,
) {
  const page = await discussionRows(client, target, selection);
  const items = await readerPosts(
    client,
    target.actor,
    await orderedPosts(page.ids, project),
  );
  if (!selection.preview) return { items, next: page.next };
  const parents = items.filter(
    (post) => post.status === 'visible' && post.replies > 0,
  );
  const ids = await topReplyIds(
    client,
    target,
    parents.map((post) => post.id),
  );
  const previews = (await orderedPosts(ids, project)).filter(
    (post) => post.status === 'visible',
  );
  return {
    items,
    next: page.next,
    previews: await readerPosts(client, target.actor, previews),
  };
}
async function orderedPosts(
  ids: string[],
  project: PostProjection,
): Promise<CommunityPost[]> {
  if (!ids.length) return [];
  const posts = new Map((await project(ids)).map((post) => [post.id, post]));
  return ids.flatMap((id) => {
    const post = posts.get(id);
    return post ? [post] : [];
  });
}
async function readerPosts(
  client: Pick<pg.PoolClient, 'query'>,
  actor: string | undefined,
  posts: CommunityPost[],
): Promise<CommunityPost[]> {
  return actor && posts.length
    ? withPostInteractions(client, actor, posts)
    : posts;
}
async function topReplyIds(
  client: Pick<pg.PoolClient, 'query'>,
  target: DiscussionTarget,
  parents: string[],
): Promise<string[]> {
  if (!parents.length) return [];
  if (parents.length > communityPageSize)
    throw new AccountError(400, 'Page too large.');
  const { score, direction } = replyOrdering('votes');
  const result = await client.query<{ id: string }>(
    `SELECT chosen.id FROM unnest($2::uuid[]) WITH ORDINALITY AS parents(id,position)
     CROSS JOIN LATERAL (
       SELECT p.id FROM hash_talk.community_posts p
       WHERE p.community_id=$1 AND p.parent_id=parents.id AND ${visiblePost('p')}
         AND EXISTS(SELECT 1 FROM hash_talk.community_posts parent WHERE parent.id=parents.id AND ${visiblePost('parent')})
         AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND ${visiblePost('root')}))
         AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.actor=$3 AND b.blocked AND b.target=p.author)
       ORDER BY ${score} ${direction},p.created_at ${direction},p.id ${direction}
       LIMIT 1
     ) chosen ORDER BY parents.position`,
    [target.community, parents, target.actor ?? null],
  );
  return result.rows.map((row) => row.id);
}

/** Indexed aggregate counters; no subtree scans or per-card history queries. */
export async function discussionRows(
  client: Pick<pg.PoolClient, 'query'>,
  target: DiscussionTarget,
  selection: { order: DiscussionOrder; after: string | null },
) {
  const key = discussionKey(target.community, target.parent, selection.order),
    cursor = discussionCursor(selection.after, key),
    anchor = cursor?.anchor ?? new Date().toISOString();
  if (Date.parse(anchor) > Date.now() + 1000)
    throw new AccountError(400, 'Cursor is in the future.');
  const { activity, score, direction, compare } = replyOrdering(
    selection.order,
  );
  const position = cursor
    ? [cursor.activity, cursor.score, cursor.time, cursor.id]
    : [null, null, null, null];
  const found = await client.query<{
    id: string;
    activity: string;
    score: number;
    created_at: Date;
  }>(
    `WITH ordered AS (SELECT p.id,p.created_at,${activity} AS activity,${score} AS score
     FROM hash_talk.community_posts p WHERE p.community_id=$1 AND p.parent_id=$2 AND p.created_at<=$3
       AND NOT ${blockedPost('p')}
       AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND ${visiblePost('root')}))
       AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.actor=$9 AND b.blocked AND b.target=p.author))
     SELECT * FROM ordered WHERE ($4::bigint IS NULL OR (activity,score,created_at,id)${compare}($4,$5,$6::timestamptz,$7::uuid))
     ORDER BY activity ${direction},score ${direction},created_at ${direction},id ${direction} LIMIT $8`,
    [
      target.community,
      target.parent,
      anchor,
      ...position,
      communityPageSize + 1,
      target.actor ?? null,
    ],
  );
  const rows = found.rows.slice(0, communityPageSize),
    last = rows.at(-1);
  const next: DiscussionCursor | null =
    found.rows.length > communityPageSize && last
      ? {
          key,
          anchor,
          activity: Number(last.activity),
          score: last.score,
          time: last.created_at.toISOString(),
          id: last.id,
        }
      : null;
  return {
    ids: rows.map((row) => row.id),
    next: next ? JSON.stringify(next) : null,
  };
}

function replyOrdering(order: DiscussionOrder) {
  const activity =
    order === 'discussed'
      ? 'CASE WHEN p.deleted OR p.active_removal IS NOT NULL THEN 0 ELSE p.discussion_activity END'
      : '0::bigint';
  const score = ['discussed', 'votes'].includes(order)
    ? 'CASE WHEN p.deleted OR p.active_removal IS NOT NULL THEN 0 ELSE p.score END'
    : '0';
  const direction = order === 'oldest' ? 'ASC' : 'DESC',
    compare = order === 'oldest' ? '>' : '<';
  return { activity, score, direction, compare };
}
