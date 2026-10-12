import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { communityBoolean } from '../../shared/communities/index.ts';
import { postCount } from '../../shared/community-posts/index.ts';
import type pg from 'pg';
export async function profileNotificationSetting(
  context: { client: pg.PoolClient; actor: { id: string } },
  operation: string,
  data: Record<string, unknown>,
) {
  const writing = operation === 'notification-set';
  keys(data, writing ? ['target', 'enabled', 'revision'] : ['target']);
  const target = uuid(data['target']);
  const rows = await context.client.query<{
    following: boolean;
    enabled: boolean;
    revision: number;
  }>(
    'SELECT following,notifications AS enabled,notification_revision AS revision FROM hash_talk.public_profile_follows WHERE follower=$1 AND target=$2 FOR UPDATE',
    [context.actor.id, target],
  );
  const old = rows.rows[0] ?? { following: false, enabled: false, revision: 0 };
  if (!writing) return { enabled: old.enabled, revision: old.revision };
  const enabled = notificationChange(old, data);
  if (enabled === null) return { enabled: old.enabled, revision: old.revision };
  if (enabled) {
    const blocks = await context.client.query(
      'SELECT 1 FROM hash_talk.social_blocks WHERE blocked AND ((actor=$1 AND target=$2) OR (actor=$2 AND target=$1))',
      [context.actor.id, target],
    );
    if (blocks.rowCount)
      throw new AccountError(
        403,
        'Notificações indisponíveis para este perfil.',
      );
  }
  await context.client.query(
    'UPDATE hash_talk.public_profile_follows SET notifications=$3,notification_revision=notification_revision+1,notification_since=CASE WHEN $3 THEN clock_timestamp() ELSE notification_since END WHERE follower=$1 AND target=$2',
    [context.actor.id, target, enabled],
  );
  return { enabled, revision: old.revision + 1 };
}
function notificationChange(
  old: { following: boolean; enabled: boolean; revision: number },
  data: Record<string, unknown>,
): boolean | null {
  const enabled = communityBoolean(data['enabled']),
    revision = postCount(data['revision']);
  if (old.revision === revision + 1 && old.enabled === enabled) return null;
  if (revision !== old.revision)
    throw new AccountError(409, 'O sininho mudou. Recarregue.');
  if (enabled && !old.following)
    throw new AccountError(403, 'Siga a conta antes de ativar o sininho.');
  return enabled === old.enabled ? null : enabled;
}

export async function queueWatchedPost(
  client: pg.PoolClient,
  author: string,
): Promise<void> {
  await client.query(
    `UPDATE hash_talk.push_subscriptions s SET pending=true,generation=generation+1,attempts=0,next_attempt=now()
    WHERE EXISTS(SELECT 1 FROM hash_talk.public_profile_follows f JOIN hash_talk.public_profiles pp ON pp.id=f.follower
      WHERE f.target=$1 AND f.following AND f.notifications AND pp.account_id=s.account_id
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=f.follower AND b.target=$1) OR (b.actor=$1 AND b.target=f.follower))))`,
    [author],
  );
}
