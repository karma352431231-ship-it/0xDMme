import type { ContentCapacity } from './content-capacity.ts';
import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  badgeLabel,
  isNewMember,
} from '../../shared/community-badges/index.ts';
import type {
  CommunityBadge,
  CustomBadge,
} from '../../shared/community-badges/index.ts';
import {
  communityBoolean,
  communityRevision,
} from '../../shared/communities/index.ts';
import {
  requireCommunityManager,
  communityTarget,
  activeSanction,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';

export async function postAuthorBadges(
  client: Pick<pg.PoolClient, 'query'>,
  pairs: { community: string; author: string }[],
) {
  const badges = new Map<string, CommunityBadge[]>();
  if (!pairs.length) return badges;
  const found = await client.query<{
    community: string;
    author: string;
    owner: boolean;
    moderator: boolean;
    joined: Date | null;
    custom: { id: string; label: string }[];
  }>(
    `WITH targets AS (SELECT DISTINCT * FROM unnest($1::uuid[],$2::uuid[]) AS t(community,author))
     SELECT t.*,c.owner=t.author AS owner,
       EXISTS(SELECT 1 FROM hash_talk.community_moderators m WHERE m.community_id=t.community AND m.profile_id=t.author) AS moderator,
       f.joined_at AS joined,
       coalesce((SELECT json_agg(json_build_object('id',b.id,'label',b.label) ORDER BY b.id)
         FROM hash_talk.community_member_badges a JOIN hash_talk.community_badges b ON b.id=a.badge_id
         WHERE a.community_id=t.community AND a.profile_id=t.author),'[]'::json) AS custom
     FROM targets t JOIN hash_talk.communities c ON c.id=t.community
     LEFT JOIN hash_talk.community_follows f ON f.community_id=t.community AND f.profile_id=t.author`,
    [pairs.map((p) => p.community), pairs.map((p) => p.author)],
  );
  for (const row of found.rows) {
    const values: CommunityBadge[] = [];
    if (row.owner)
      values.push({ id: null, kind: 'owner', label: 'Community owner' });
    else if (row.moderator)
      values.push({ id: null, kind: 'moderator', label: 'Moderator' });
    else if (isNewMember(row.joined))
      values.push({ id: null, kind: 'new', label: 'New member' });
    values.push(
      ...row.custom.map((badge) => ({ ...badge, kind: 'custom' as const })),
    );
    badges.set(`${row.community}/${row.author}`, values);
  }
  return badges;
}
export async function operateCommunityBadge(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: ContentCapacity,
) {
  await requireCommunityManager(context);
  if (operation === 'badge-list') {
    keys(data, ['id']);
    const found = await context.client.query<CustomBadge>(
      'SELECT id,label,revision FROM hash_talk.community_badges WHERE community_id=$1 ORDER BY id LIMIT 20',
      [context.row.id],
    );
    return { items: found.rows };
  }
  if (operation === 'badge-assign') return assignBadge(context, data, capacity);
  return saveBadge(context, operation, data, capacity);
}
async function saveBadge(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: ContentCapacity,
) {
  if (!['badge-create', 'badge-edit', 'badge-delete'].includes(operation))
    throw new AccountError(404, 'Invalid badge operation.');
  const creating = operation === 'badge-create',
    deleting = operation === 'badge-delete';
  keys(data, [
    'id',
    'badge',
    ...(creating ? [] : ['revision']),
    ...(deleting ? [] : ['label']),
  ]);
  const id = uuid(data['badge']),
    label = deleting ? '' : badgeLabel(data['label']);
  const found = await context.client.query<
    CustomBadge & { community_id: string }
  >(
    'SELECT id,label,revision,community_id FROM hash_talk.community_badges WHERE id=$1 FOR UPDATE',
    [id],
  );
  const old = found.rows[0];
  if (old && old.community_id !== context.row.id)
    throw new AccountError(409, 'Badge identifier already used.');
  if (creating) await createBadge(context, { id, label, old });
  else
    await changeBadge(context, {
      id,
      label,
      old,
      revision: data['revision'],
      deleting,
    });
  await assertContentCapacity(context.client, capacity);
  return { saved: true };
}
async function createBadge(
  context: CommunityContext,
  input: { id: string; label: string; old: CustomBadge | undefined },
) {
  const { id, label, old } = input;
  if (old?.label === label) return;
  if (old) throw new AccountError(409, 'Badge identifier already used.');
  const count = await context.client.query<{ count: string }>(
    'SELECT count(*) FROM hash_talk.community_badges WHERE community_id=$1',
    [context.row.id],
  );
  if (Number(count.rows[0]!.count) >= 20)
    throw new AccountError(409, 'Use up to 20 custom badges per community.');
  await context.client.query(
    'INSERT INTO hash_talk.community_badges(id,community_id,label) VALUES($1,$2,$3)',
    [id, context.row.id, label],
  );
}
async function changeBadge(
  context: CommunityContext,
  input: {
    id: string;
    label: string;
    old: CustomBadge | undefined;
    revision: unknown;
    deleting: boolean;
  },
) {
  const { id, label, old, deleting } = input;
  if (!old || old.revision !== communityRevision(input.revision))
    throw new AccountError(409, 'Badge changed. Reload.');
  if (deleting) await deleteUnusedBadge(context, id);
  else if (old.label !== label)
    await context.client.query(
      'UPDATE hash_talk.community_badges SET label=$2,revision=revision+1 WHERE id=$1',
      [id, label],
    );
}
async function deleteUnusedBadge(
  context: CommunityContext,
  id: string,
): Promise<void> {
  const assigned = await context.client.query(
    'SELECT 1 FROM hash_talk.community_member_badges WHERE badge_id=$1 LIMIT 1',
    [id],
  );
  if (assigned.rowCount)
    throw new AccountError(
      409,
      'This badge is in use. Remove assignments before deleting its definition.',
    );
  await context.client.query(
    'DELETE FROM hash_talk.community_badges WHERE id=$1',
    [id],
  );
}
async function assignBadge(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: ContentCapacity,
) {
  keys(data, ['id', 'badge', 'target', 'enabled']);
  const badge = uuid(data['badge']),
    target = await communityTarget(context, uuid(data['target'])),
    enabled = communityBoolean(data['enabled']);
  const found = await context.client.query(
    'SELECT 1 FROM hash_talk.community_badges WHERE community_id=$1 AND id=$2',
    [context.row.id, badge],
  );
  if (!found.rowCount) throw new AccountError(404, 'Badge unavailable.');
  if (!enabled) {
    await context.client.query(
      'DELETE FROM hash_talk.community_member_badges WHERE badge_id=$1 AND profile_id=$2',
      [badge, target.id],
    );
    return { saved: true };
  }
  if (await activeSanction(context, target.id))
    throw new AccountError(403, 'Participant suspended.');
  const old = await context.client.query<{ badge_id: string }>(
    'SELECT badge_id FROM hash_talk.community_member_badges WHERE community_id=$1 AND profile_id=$2',
    [context.row.id, target.id],
  );
  if (old.rows.some((row) => row.badge_id === badge)) return { saved: true };
  if (old.rows.length >= 3)
    throw new AccountError(
      409,
      'Use up to three custom badges per person in this community.',
    );
  await context.client.query(
    'INSERT INTO hash_talk.community_member_badges(community_id,profile_id,badge_id) VALUES($1,$2,$3)',
    [context.row.id, target.id, badge],
  );
  await assertContentCapacity(context.client, capacity);
  return { saved: true };
}
