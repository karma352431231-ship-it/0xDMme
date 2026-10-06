import { randomUUID } from 'node:crypto';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
  communityRevision,
} from '../../shared/communities/index.ts';
import {
  activeSanction,
  bumpCommunity,
  communityTarget,
  currentCommunity,
  requireCommunityManager,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';

async function role(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'revision', 'target', 'moderator']);
  await requireCommunityManager(context, true);
  currentCommunity(context, communityRevision(data['revision']));
  const target = await communityTarget(context, uuid(data['target'])),
    enabled = communityBoolean(data['moderator']);
  if (target.id === context.row.owner)
    throw new AccountError(
      400,
      'O proprietário não precisa de função de moderador.',
    );
  if (enabled && (await activeSanction(context, target.id)))
    throw new AccountError(403, 'Remova a sanção antes de nomear moderador.');
  const changed = enabled
    ? await context.client.query(
        'INSERT INTO hash_talk.community_moderators(community_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [context.row.id, target.id],
      )
    : await context.client.query(
        'DELETE FROM hash_talk.community_moderators WHERE community_id=$1 AND profile_id=$2',
        [context.row.id, target.id],
      );
  if (changed.rowCount) await bumpCommunity(context);
  if (changed.rowCount && enabled)
    await assertContentCapacity(context.client, capacity);
}
async function offer(
  context: CommunityContext,
  data: Record<string, unknown>,
): Promise<void> {
  keys(data, ['id', 'revision', 'target']);
  await requireCommunityManager(context, true);
  currentCommunity(context, communityRevision(data['revision']));
  const target = await transferTarget(context, data['target']);
  if ((context.row.transfer_to ?? null) === target) return;
  await context.client.query(
    'UPDATE hash_talk.communities SET transfer_id=$2,transfer_to=$3,revision=revision+1 WHERE id=$1',
    [context.row.id, target ? randomUUID() : null, target],
  );
}
async function transferTarget(
  context: CommunityContext,
  value: unknown,
): Promise<string | null> {
  if (value === null) return null;
  const target = await communityTarget(context, uuid(value));
  if (target.id === context.actor.id)
    throw new AccountError(400, 'Você já é o proprietário.');
  if (await activeSanction(context, target.id))
    throw new AccountError(403, 'Destinatário suspenso.');
  return target.id;
}
async function accept(
  context: CommunityContext,
  data: Record<string, unknown>,
): Promise<void> {
  keys(data, ['id', 'revision', 'offer']);
  currentCommunity(context, communityRevision(data['revision']));
  if (
    context.row.transfer_to !== context.actor.id ||
    context.row.transfer_id !== uuid(data['offer'])
  )
    throw new AccountError(
      403,
      'Transferência não destinada a este perfil ou já encerrada.',
    );
  if (await activeSanction(context))
    throw new AccountError(403, 'Destinatário suspenso.');
  await context.client.query(
    'DELETE FROM hash_talk.community_moderators WHERE community_id=$1 AND profile_id=$2',
    [context.row.id, context.actor.id],
  );
  await context.client.query(
    'UPDATE hash_talk.communities SET owner=$2,transfer_id=NULL,transfer_to=NULL,revision=revision+1 WHERE id=$1',
    [context.row.id, context.actor.id],
  );
}
async function archive(
  context: CommunityContext,
  data: Record<string, unknown>,
): Promise<void> {
  keys(data, ['id', 'revision', 'archived']);
  await requireCommunityManager(context, true);
  currentCommunity(context, communityRevision(data['revision']));
  const archived = communityBoolean(data['archived']);
  if (archived === context.row.archived) return;
  await context.client.query(
    'UPDATE hash_talk.communities SET archived=$2,revision=revision+1 WHERE id=$1',
    [context.row.id, archived],
  );
}
async function staff(context: CommunityContext, data: Record<string, unknown>) {
  keys(data, ['id', 'after']);
  await requireCommunityManager(context);
  const result = await context.client.query<{ id: string }>(
    'SELECT profile_id AS id FROM hash_talk.community_moderators WHERE community_id=$1 AND ($2::uuid IS NULL OR profile_id>$2) ORDER BY profile_id LIMIT $3',
    [context.row.id, communityCursor(data['after']), communityPageSize + 1],
  );
  const rows = result.rows.slice(0, communityPageSize),
    profiles = await context.profiles.identities(
      context.client,
      rows.map((row) => row.id),
    );
  return {
    items: rows.map((row) => profiles.get(row.id)!),
    next:
      result.rows.length > communityPageSize ? (rows.at(-1)?.id ?? null) : null,
  };
}
export async function communityGovernance(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<boolean> {
  switch (operation) {
    case 'role':
      await role(context, data, capacity);
      return true;
    case 'transfer-offer':
      await offer(context, data);
      return true;
    case 'transfer-accept':
      await accept(context, data);
      return true;
    case 'archive':
      await archive(context, data);
      return true;
    default:
      return false;
  }
}
export { staff as communityStaff };
