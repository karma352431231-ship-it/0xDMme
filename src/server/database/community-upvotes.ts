import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityArray,
  communityCursor,
} from '../../shared/communities/index.ts';
import {
  postCursor,
  replyPreview,
} from '../../shared/community-posts/index.ts';
import type {
  UpvoteNoticePage,
  UpvoterPage,
} from '../../shared/public-upvotes/index.ts';
import type { CommunityContext } from './community-authority.ts';
import type { PostRow } from './community-post-authority.ts';
import type { CommunityStore } from './communities.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { ContactAuthority } from './contacts.ts';
import { visiblePost } from './community-post-visibility.ts';
import { wakePublicActivity } from './public-notice-wake.ts';

/** Current public visibility is checked before pagination, not after its LIMIT. */
function visibleUpvoteTarget(): string {
  return `${visiblePost('p')}
    AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts r WHERE r.id=p.root_id AND ${visiblePost('r')}))
    AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts parent WHERE parent.id=p.parent_id AND ${visiblePost('parent')}))`;
}
/** The vote transaction also owns arrival withdrawal, admission and wakeup. */
export async function reconcileUpvoteNotice(
  context: CommunityContext,
  post: PostRow,
  position: -1 | 0 | 1,
): Promise<void> {
  if (position !== 1) {
    const removed = await context.client.query<{ recipient: string }>(
      'DELETE FROM hash_talk.public_upvote_notifications WHERE actor=$1 AND post_id=$2 RETURNING recipient',
      [context.actor.id, post.id],
    );
    if (removed.rows[0])
      await wakePublicActivity(context.client, removed.rows[0].recipient);
    return;
  }
  if (!post.author || post.author === context.actor.id) return;
  const inserted = await context.client.query(
    `INSERT INTO hash_talk.public_upvote_notifications(recipient,actor,post_id)
     SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$1 AND b.target=$2) OR (b.actor=$2 AND b.target=$1)))
     ON CONFLICT(actor,post_id) DO NOTHING`,
    [post.author, context.actor.id, post.id],
  );
  if (inserted.rowCount) await wakePublicActivity(context.client, post.author);
}
interface NoticeRow {
  id: string;
  actor: string;
  post_id: string;
  created_at: Date;
  read: boolean;
}
/** Public positive voters and the recipient-only active-arrival inbox. */
interface UpvoteAccess {
  pool: pg.Pool;
  communities: CommunityStore;
  profiles: PublicProfileStore;
  posts: {
    mentionContexts: (
      client: pg.PoolClient,
      viewer: string,
      ids: string[],
    ) => Promise<CommunityPost[]>;
  };
}
export class CommunityUpvotes {
  private readonly access: UpvoteAccess;
  constructor(access: UpvoteAccess) {
    this.access = access;
  }
  async voters(
    community: string,
    post: string,
    after: string | null,
  ): Promise<UpvoterPage> {
    const client = await this.access.pool.connect();
    try {
      const target = await client.query(
        `SELECT p.id FROM hash_talk.community_posts p WHERE p.id=$1 AND p.community_id=$2 AND ${visibleUpvoteTarget()}`,
        [post, community],
      );
      if (!target.rowCount) throw new AccountError(404, 'Post unavailable.');
      const found = await client.query<{ profile_id: string }>(
        'SELECT profile_id FROM hash_talk.community_votes WHERE post_id=$1 AND position=1 AND ($2::uuid IS NULL OR profile_id<$2) ORDER BY profile_id DESC LIMIT 25',
        [post, communityCursor(after)],
      );
      const rows = found.rows.slice(0, 24);
      const actors = await this.access.profiles.identities(
        client,
        rows.map((row) => row.profile_id),
      );
      return {
        items: rows.flatMap((row) => {
          const actor = actors.get(row.profile_id);
          return actor ? [actor] : [];
        }),
        next: found.rows.length > 24 ? rows.at(-1)!.profile_id : null,
      };
    } finally {
      client.release();
    }
  }
  operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<UpvoteNoticePage | { saved: true }> {
    keys(data, operation === 'post-upvote-notifications' ? ['after'] : ['ids']);
    return this.access.communities.withActor(authority, async (context) => {
      if (operation === 'post-upvote-notifications')
        return this.page(context, postCursor(data['after']));
      const ids = communityArray(data['ids']).map(uuid);
      await context.client.query(
        'UPDATE hash_talk.public_upvote_notifications SET read=true WHERE recipient=$1 AND id=ANY($2::uuid[]) AND NOT read',
        [context.actor.id, ids],
      );
      return { saved: true };
    });
  }
  private async page(
    context: { client: pg.PoolClient; actor: { id: string } },
    after: string | null,
  ): Promise<UpvoteNoticePage> {
    const [time, id] = (after ?? '').split('/');
    const found = await context.client.query<NoticeRow>(
      `SELECT n.id,n.actor,n.post_id,n.created_at,n.read FROM hash_talk.public_upvote_notifications n
       JOIN hash_talk.community_votes v ON v.profile_id=n.actor AND v.post_id=n.post_id AND v.position=1
       JOIN hash_talk.community_posts p ON p.id=n.post_id
       WHERE n.recipient=$1 AND ${visibleUpvoteTarget()} AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid))
       AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$1 AND b.target=n.actor) OR (b.actor=n.actor AND b.target=$1)))
       ORDER BY n.created_at DESC,n.id DESC LIMIT 25`,
      [context.actor.id, time || null, id || null],
    );
    const rows = found.rows.slice(0, 24);
    const actors = await this.access.profiles.identities(context.client, [
      ...new Set(rows.map((row) => row.actor)),
    ]);
    const posts = new Map(
      (
        await this.access.posts.mentionContexts(
          context.client,
          context.actor.id,
          [...new Set(rows.map((row) => row.post_id))],
        )
      ).map((post) => [post.id, post]),
    );
    const items = rows.flatMap((row) => {
      const actor = actors.get(row.actor),
        post = posts.get(row.post_id);
      if (!actor || !post) return [];
      return [
        {
          id: row.id,
          actor,
          community: post.community,
          post: post.id,
          kind: post.parent ? ('reply' as const) : ('post' as const),
          text: replyPreview(post)!.text,
          createdAt: row.created_at.toISOString(),
          read: row.read,
        },
      ];
    });
    const last = rows.at(-1);
    return {
      items,
      next:
        found.rows.length > 24 && last
          ? `${last.created_at.toISOString()}/${last.id}`
          : null,
    };
  }
}
