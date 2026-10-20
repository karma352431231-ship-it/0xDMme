import type pg from 'pg';
import type { PublicNotificationPreview } from '../../shared/public-notification/index.ts';
import { publicNotificationText } from '../../shared/public-notification/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';

/** Only fixed SQL account expressions from callers; all user values are parameters. */
export function publicNotificationCandidates(
  account: 's.account_id' | '$1',
): string {
  const visible = `NOT p.deleted AND p.active_removal IS NULL AND
    (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND NOT root.deleted AND root.active_removal IS NULL)) AND
    (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts parent WHERE parent.id=p.parent_id AND NOT parent.deleted AND parent.active_removal IS NULL)) AND
    NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND
      ((b.actor=recipient.id AND (b.target=p.author OR b.target IN(SELECT ancestor.author FROM hash_talk.community_posts ancestor WHERE ancestor.id=p.parent_id OR ancestor.id=p.root_id))) OR (b.actor=p.author AND b.target=recipient.id)))`;
  return `(SELECT p.id,p.created_at,false AS followed FROM hash_talk.public_profiles recipient JOIN hash_talk.community_reply_notifications n ON n.recipient=recipient.id
    JOIN hash_talk.community_posts p ON p.id=n.reply_id WHERE recipient.account_id=${account} AND NOT n.read AND ${visible} ORDER BY p.created_at DESC,p.id DESC LIMIT 1)
    UNION ALL (SELECT p.id,p.created_at,true AS followed FROM hash_talk.public_profiles recipient JOIN hash_talk.public_profile_follows f ON f.follower=recipient.id AND f.following AND f.notifications
    JOIN hash_talk.community_posts p ON p.author=f.target LEFT JOIN hash_talk.public_notification_reads n ON n.profile_id=recipient.id AND n.post_id=p.id
    WHERE recipient.account_id=${account} AND n.post_id IS NULL AND p.created_at>=f.notification_since AND ${visible} ORDER BY p.created_at DESC,p.id DESC LIMIT 1)`;
}
/**
 * Authenticated same-origin read, separate from the isolated push sender.
 * Posts and replies carry the author's approved public photo so the
 * alert can show it; the push payload itself stays generic.
 */
export async function readPublicNotificationPreview(
  contacts: ContactStore,
  authority: ContactAuthority,
  profiles: Pick<PublicProfileStore, 'readById'>,
): Promise<PublicNotificationPreview | null> {
  const preview = await readPreviewRow(contacts, authority);
  if (!preview) return null;
  const author = await profiles.readById(preview.author.id);
  return author ? { ...preview, author } : preview;
}
function readPreviewRow(
  contacts: ContactStore,
  authority: ContactAuthority,
): Promise<PublicNotificationPreview | null> {
  return contacts.withMessageAuthority(
    authority,
    async (client: pg.PoolClient) => {
      const found = await client.query<{
        id: string;
        community_id: string;
        title: string;
        text: string;
        parent_id: string | null;
        author: string;
        handle: string;
        followed: boolean;
      }>(
        `WITH candidates AS (${publicNotificationCandidates('$1')}) SELECT p.id,p.community_id,p.title,p.text,p.parent_id,p.author,pp.handle,n.followed
      FROM candidates n JOIN hash_talk.community_posts p ON p.id=n.id JOIN hash_talk.public_profiles pp ON pp.id=p.author WHERE EXISTS(SELECT 1 FROM hash_talk.push_subscriptions s WHERE s.account_id=$1 AND s.device_id=$2
        AND NOT EXISTS(SELECT 1 FROM hash_talk.push_controls pc WHERE pc.account_id=s.account_id AND pc.device_id=s.device_id AND NOT pc.messages))
      ORDER BY n.created_at DESC,n.id DESC LIMIT 1`,
        [authority.session.accountId, authority.session.deviceId],
      );
      const row = found.rows[0];
      if (!row) return null;
      return {
        author: { id: row.author, handle: row.handle, avatar: null },
        community: row.community_id,
        post: row.id,
        text: publicNotificationText(row.title, row.text),
        reply: row.parent_id !== null,
        followed: row.followed,
      };
    },
  );
}
