import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityArray,
  communityPageSize,
} from '../../shared/communities/index.ts';
import {
  postCount,
  postCursor,
  votePosition,
} from '../../shared/community-posts/index.ts';
import type {
  PostVote,
  ReplyNotificationPage,
} from '../../shared/community-posts/index.ts';
import type { CommunityContext } from './community-authority.ts';
import { requireCommunityParticipation } from './community-authority.ts';
import { loadPost } from './community-post-authority.ts';
import type { PostRow } from './community-post-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';

export async function postVotes(
  client: Pick<pg.PoolClient, 'query'>,
  actor: string,
  ids: string[],
): Promise<Map<string, PostVote>> {
  const rows = await client.query<PostVote & { post_id: string }>(
    `SELECT post_id,position,revision FROM hash_talk.community_votes WHERE profile_id=$1 AND post_id=ANY($2::uuid[])`,
    [actor, ids],
  );
  return new Map(
    rows.rows.map((row) => [
      row.post_id,
      { position: row.position, revision: row.revision },
    ]),
  );
}
export async function requireReplyTarget(
  context: CommunityContext,
  row: PostRow,
): Promise<void> {
  if (row.deleted || row.active_removal)
    throw new AccountError(
      409,
      'Conteúdo excluído ou oculto não aceita novas interações.',
    );
  if (row.root_id) {
    const root = await loadPost(context, row.root_id);
    if (root.deleted || root.active_removal)
      throw new AccountError(
        409,
        'Postagem excluída ou oculta não aceita novas interações.',
      );
  }
}
/** Revision plus desired position makes retries safe even after subsequent votes. */
export async function setPostVote(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'post', 'position', 'voteRevision']);
  await requireCommunityParticipation(context);
  const row = await loadPost(context, uuid(data['post'])),
    position = votePosition(data['position']),
    revision = postCount(data['voteRevision']);
  await requireReplyTarget(context, row);
  const old = (await postVotes(context.client, context.actor.id, [row.id])).get(
    row.id,
  ) ?? { position: 0, revision: 0 };
  if (old.revision === revision + 1 && old.position === position) return;
  if (old.revision !== revision)
    throw new AccountError(
      409,
      'Seu voto mudou. Recarregue antes de continuar.',
    );
  if (old.position === position) return;
  await context.client.query(
    `INSERT INTO hash_talk.community_votes(profile_id,post_id,position,revision) VALUES($1,$2,$3,1) ON CONFLICT(profile_id,post_id) DO UPDATE SET position=$3,revision=hash_talk.community_votes.revision+1`,
    [context.actor.id, row.id, position],
  );
  await assertContentCapacity(context.client, capacity);
}
/** Exactly one direct recipient; no ancestor fanout, self-notification or copied content. */
export async function admitReplyNotification(
  context: CommunityContext,
  parent: PostRow,
  reply: string,
): Promise<void> {
  if (!parent.author || parent.author === context.actor.id) return;
  const inserted = await context.client.query(
    `INSERT INTO hash_talk.community_reply_notifications(recipient,reply_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [parent.author, reply],
  );
  if (!inserted.rowCount) return;
  await context.client.query(
    `UPDATE hash_talk.push_subscriptions SET pending=true,generation=generation+1,attempts=0,next_attempt=now() WHERE account_id=(SELECT account_id FROM hash_talk.public_profiles WHERE id=$1)`,
    [parent.author],
  );
}
export async function replyNotifications(
  context: { client: pg.PoolClient; actor: { id: string } },
  operation: string,
  data: Record<string, unknown>,
): Promise<ReplyNotificationPage | { saved: true }> {
  if (operation === 'post-notifications-read') {
    keys(data, ['replies']);
    const ids = communityArray(data['replies']).map(uuid);
    await context.client.query(
      `UPDATE hash_talk.community_reply_notifications SET read=true WHERE recipient=$1 AND reply_id=ANY($2::uuid[]) AND NOT read`,
      [context.actor.id, ids],
    );
    return { saved: true };
  }
  keys(data, ['after']);
  const [time, id] = (postCursor(data['after']) ?? '').split('/');
  const rows = await context.client.query<{
    reply: string;
    post: string;
    community: string;
    created_at: Date;
    read: boolean;
  }>(
    `SELECT n.reply_id AS reply,p.root_id AS post,p.community_id AS community,n.created_at,n.read FROM hash_talk.community_reply_notifications n JOIN hash_talk.community_posts p ON p.id=n.reply_id WHERE n.recipient=$1 AND ($2::timestamptz IS NULL OR (n.created_at,n.reply_id)<($2,$3::uuid)) ORDER BY n.created_at DESC,n.reply_id DESC LIMIT $4`,
    [context.actor.id, time || null, id || null, communityPageSize + 1],
  );
  const items = rows.rows.slice(0, communityPageSize),
    last = items.at(-1);
  return {
    items: items.map((row) => ({
      reply: row.reply,
      post: row.post,
      community: row.community,
      createdAt: row.created_at.toISOString(),
      read: row.read,
    })),
    next:
      rows.rows.length > communityPageSize && last
        ? `${last.created_at.toISOString()}/${last.reply}`
        : null,
  };
}
