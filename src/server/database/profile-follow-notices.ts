import type pg from 'pg';
import { keys, uuid } from '../../shared/account/index.ts';
import { communityArray } from '../../shared/communities/index.ts';
import { postCursor } from '../../shared/community-posts/index.ts';
import type { FollowNoticePage } from '../../shared/follow-notices/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { wakePublicActivity } from './public-notice-wake.ts';

type Client = Pick<pg.PoolClient, 'query'>;
const blocked = (recipient: string, actor: string) =>
  `EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=${recipient} AND b.target=${actor}) OR (b.actor=${actor} AND b.target=${recipient})))`;

/**
 * The follow transaction owns the notice: a new follow adds one, and stopping
 * withdraws it, so following again is a new arrival. Blocked pairs get none.
 * Activity is woken in app only; there is no push for new followers.
 */
export async function reconcileFollowNotice(
  client: Client,
  follow: { actor: string; target: string; following: boolean },
): Promise<void> {
  const removed = await client.query(
    'DELETE FROM hash_talk.public_follow_notifications WHERE actor=$1 AND recipient=$2',
    [follow.actor, follow.target],
  );
  const inserted = follow.following
    ? await client.query(
        `INSERT INTO hash_talk.public_follow_notifications(recipient,actor)
         SELECT $1,$2 WHERE NOT ${blocked('$1', '$2')}`,
        [follow.target, follow.actor],
      )
    : null;
  if (removed.rowCount || inserted?.rowCount)
    await wakePublicActivity(client, follow.target);
}

interface NoticeRow {
  id: string;
  actor: string;
  created_at: Date;
  read: boolean;
}
/** The recipient-only inbox of new followers, newest first. */
export async function followNoticeOperation(
  context: { client: pg.PoolClient; actor: { id: string } },
  input: {
    operation: string;
    data: Record<string, unknown>;
    profiles: PublicProfileStore;
  },
): Promise<FollowNoticePage | { saved: true }> {
  const { operation, data } = input;
  keys(data, operation === 'follow-notifications' ? ['after'] : ['ids']);
  if (operation === 'follow-notifications-read') {
    await context.client.query(
      'UPDATE hash_talk.public_follow_notifications SET read=true WHERE recipient=$1 AND id=ANY($2::uuid[]) AND NOT read',
      [context.actor.id, communityArray(data['ids']).map(uuid)],
    );
    return { saved: true };
  }
  const [time, id] = (postCursor(data['after']) ?? '').split('/');
  const found = await context.client.query<NoticeRow>(
    `SELECT n.id,n.actor,n.created_at,n.read FROM hash_talk.public_follow_notifications n
     WHERE n.recipient=$1 AND NOT ${blocked('n.recipient', 'n.actor')}
     AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid))
     ORDER BY n.created_at DESC,n.id DESC LIMIT 25`,
    [context.actor.id, time || null, id || null],
  );
  const rows = found.rows.slice(0, 24);
  const actors = await input.profiles.identities(
    context.client,
    rows.map((row) => row.actor),
  );
  const last = rows.at(-1);
  return {
    items: rows.flatMap((row) => {
      const actor = actors.get(row.actor);
      return actor
        ? [
            {
              id: row.id,
              actor,
              createdAt: row.created_at.toISOString(),
              read: row.read,
            },
          ]
        : [];
    }),
    next:
      found.rows.length > 24 && last
        ? `${last.created_at.toISOString()}/${last.id}`
        : null,
  };
}
