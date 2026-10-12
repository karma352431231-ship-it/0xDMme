import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { communityPageSize } from '../../shared/communities/index.ts';
import {
  discussionCursor,
  discussionKey,
} from '../../shared/community-discussion/index.ts';
import type {
  DiscussionOrder,
  DiscussionCursor,
} from '../../shared/community-discussion/index.ts';

/** Indexed aggregate counters; no subtree scans or per-card history queries. */
export async function discussionRows(
  client: Pick<pg.PoolClient, 'query'>,
  target: { community: string; parent: string },
  selection: { order: DiscussionOrder; after: string | null },
) {
  const key = discussionKey(target.community, target.parent, selection.order),
    cursor = discussionCursor(selection.after, key),
    anchor = cursor?.anchor ?? new Date().toISOString();
  if (Date.parse(anchor) > Date.now() + 1000)
    throw new AccountError(400, 'Cursor no futuro.');
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
     FROM hash_talk.community_posts p WHERE p.community_id=$1 AND p.parent_id=$2 AND p.created_at<=$3)
     SELECT * FROM ordered WHERE ($4::bigint IS NULL OR (activity,score,created_at,id)${compare}($4,$5,$6::timestamptz,$7::uuid))
     ORDER BY activity ${direction},score ${direction},created_at ${direction},id ${direction} LIMIT $8`,
    [
      target.community,
      target.parent,
      anchor,
      ...position,
      communityPageSize + 1,
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
