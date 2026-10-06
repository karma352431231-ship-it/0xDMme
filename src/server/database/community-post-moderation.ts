import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
  communityText,
} from '../../shared/communities/index.ts';
import type { PostRemoval } from '../../shared/community-posts/index.ts';
import {
  communityRole,
  requireCommunityManager,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { loadPost, currentPost } from './community-post-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';
export interface RemovalRow {
  id: string;
  community_id: string;
  post_id: string;
  actor: string;
  reason: string;
  created_at: Date;
  restored: boolean;
  appeal: string | null;
  decision: string | null;
}
const columns =
  'id,community_id,post_id,actor,reason,created_at,restored,appeal,decision';
export function removalView(row: RemovalRow | null): PostRemoval | null {
  return row
    ? {
        id: row.id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
        restored: row.restored,
        appeal: row.appeal,
        decision: row.decision,
      }
    : null;
}
export async function removalRows(
  client: Pick<pg.PoolClient, 'query'>,
  ids: string[],
): Promise<Map<string, RemovalRow>> {
  const found = await client.query<RemovalRow>(
    `SELECT ${columns} FROM hash_talk.community_post_removals WHERE id=ANY($1::uuid[])`,
    [ids],
  );
  return new Map(found.rows.map((row) => [row.id, row]));
}
async function record(
  context: CommunityContext,
  post: string,
  id: string,
): Promise<RemovalRow> {
  const found = await context.client.query<RemovalRow>(
    `SELECT ${columns} FROM hash_talk.community_post_removals WHERE community_id=$1 AND post_id=$2 AND id=$3`,
    [context.row.id, post, id],
  );
  if (!found.rows[0]) throw new AccountError(404, 'Remoção indisponível.');
  return found.rows[0];
}
async function hide(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'post', 'revision', 'record', 'reason']);
  await requireCommunityManager(context);
  const row = await loadPost(context, uuid(data['post'])),
    id = uuid(data['record']),
    reason = communityText(data['reason'], 1000);
  const old = (await removalRows(context.client, [id])).get(id);
  if (old) {
    if (
      old.post_id !== row.id ||
      old.community_id !== context.row.id ||
      old.actor !== context.actor.id ||
      old.reason !== reason
    )
      throw new AccountError(409, 'Identificador de remoção já utilizado.');
    return;
  }
  currentPost(row, data['revision']);
  if (row.deleted || row.active_removal)
    throw new AccountError(409, 'Post já excluído ou oculto.');
  await context.client.query(
    'INSERT INTO hash_talk.community_post_removals(id,community_id,post_id,actor,reason) VALUES($1,$2,$3,$4,$5)',
    [id, context.row.id, row.id, context.actor.id, reason],
  );
  await context.client.query(
    'UPDATE hash_talk.community_posts SET active_removal=$2,revision=revision+1 WHERE id=$1',
    [row.id, id],
  );
  await assertContentCapacity(context.client, capacity);
}
async function appeal(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'post', 'record', 'text']);
  const row = await loadPost(context, uuid(data['post'])),
    removal = await record(context, row.id, uuid(data['record'])),
    text = communityText(data['text'], 2000);
  if (row.author !== context.actor.id)
    throw new AccountError(403, 'Somente o autor pode contestar esta remoção.');
  if (removal.appeal === text) return;
  if (removal.appeal || removal.restored)
    throw new AccountError(409, 'Contestação já enviada ou remoção encerrada.');
  await context.client.query(
    'UPDATE hash_talk.community_post_removals SET appeal=$2 WHERE id=$1',
    [removal.id, text],
  );
  await assertContentCapacity(context.client, capacity);
}
async function decide(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'post', 'revision', 'record', 'decision', 'restore']);
  await requireCommunityManager(context);
  const row = await loadPost(context, uuid(data['post'])),
    removal = await record(context, row.id, uuid(data['record'])),
    decision = communityText(data['decision'], 1000),
    restore = communityBoolean(data['restore']);
  if (removal.decision === decision && removal.restored === restore) return;
  currentPost(row, data['revision']);
  if (row.deleted || row.active_removal !== removal.id)
    throw new AccountError(409, 'Post excluído ou remoção já encerrada.');
  if (!restore && (!removal.appeal || removal.decision))
    throw new AccountError(
      409,
      'Conteste antes da revisão, ou restaure com motivo.',
    );
  await context.client.query(
    'UPDATE hash_talk.community_post_removals SET decision=$2,restored=$3 WHERE id=$1',
    [removal.id, decision, restore],
  );
  if (restore)
    await context.client.query(
      'UPDATE hash_talk.community_posts SET active_removal=NULL,revision=revision+1 WHERE id=$1',
      [row.id],
    );
  await assertContentCapacity(context.client, capacity);
}
async function history(
  context: CommunityContext,
  data: Record<string, unknown>,
) {
  keys(data, ['id', 'post', 'after']);
  const row = await loadPost(context, uuid(data['post']));
  if (
    row.author !== context.actor.id &&
    (await communityRole(context)) === 'participant'
  )
    throw new AccountError(403, 'Histórico restrito ao autor e gestores.');
  const found = await context.client.query<RemovalRow>(
      `SELECT ${columns} FROM hash_talk.community_post_removals WHERE community_id=$1 AND post_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,
      [
        context.row.id,
        row.id,
        communityCursor(data['after']),
        communityPageSize + 1,
      ],
    ),
    items = found.rows.slice(0, communityPageSize);
  return {
    items: items.map(removalView),
    next:
      found.rows.length > communityPageSize ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function postModeration(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<unknown> {
  switch (operation) {
    case 'post-hide':
      await hide(context, data, capacity);
      return undefined;
    case 'post-appeal':
      await appeal(context, data, capacity);
      return undefined;
    case 'post-decide':
      await decide(context, data, capacity);
      return undefined;
    case 'post-moderations':
      return history(context, data);
    default:
      throw new AccountError(404, 'Operação de post indisponível.');
  }
}
