import type pg from 'pg';
import { keys, uuid } from '../../shared/account/index.ts';
import { postCursor } from '../../shared/community-posts/index.ts';
import { communityArray } from '../../shared/communities/index.ts';
import type {
  MentionNotification,
  MentionNotificationPage,
} from '../../shared/mention-notifications/index.ts';
import type { MentionSource } from './mention-admission.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
export interface MentionNotificationRow {
  id: string;
  actor: string;
  source_post: string | null;
  source_profile: string | null;
  source_community: string | null;
  created_at: Date;
  read: boolean;
}
export interface MentionContext {
  source: MentionNotification['source'];
  text: string;
}
type Readers = {
  identity: (client: pg.PoolClient, account: string) => Promise<PublicProfile>;
  actors: (
    client: pg.PoolClient,
    ids: string[],
  ) => Promise<Map<string, PublicProfile>>;
  contexts: (
    client: pg.PoolClient,
    viewer: string,
    rows: readonly MentionNotificationRow[],
  ) => Promise<Map<string, MentionContext>>;
};
export function mentionSource(row: MentionNotificationRow): MentionSource {
  if (row.source_post) return { kind: 'post', id: row.source_post };
  if (row.source_profile) return { kind: 'profile', id: row.source_profile };
  return { kind: 'community', id: row.source_community! };
}
export function mentionSourceKey(source: MentionSource): string {
  return source.kind + ':' + source.id;
}
/** Owns a private paginated inbox; only recipient writes and current public context leave it. */
export class MentionNotificationStore {
  private readonly authority: ContactStore;
  private readonly readers: Readers;
  constructor(authority: ContactStore, readers: Readers) {
    this.authority = authority;
    this.readers = readers;
  }
  operate(
    operation: 'mention-notifications' | 'mention-notifications-read',
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<MentionNotificationPage | { saved: true }> {
    keys(data, operation === 'mention-notifications' ? ['after'] : ['ids']);
    return this.authority.withMessageAuthority(authority, async (client) => {
      const actor = await this.readers.identity(
        client,
        authority.session.accountId,
      );
      if (operation === 'mention-notifications')
        return this.page(client, actor.id, postCursor(data['after']));
      const ids = communityArray(data['ids']).map(uuid);
      await client.query(
        'UPDATE hash_talk.public_mention_notifications SET read=true WHERE recipient=$1 AND id=ANY($2::uuid[]) AND NOT read',
        [actor.id, ids],
      );
      return { saved: true };
    });
  }
  private async page(
    client: pg.PoolClient,
    viewer: string,
    cursor: string | null,
  ): Promise<MentionNotificationPage> {
    const [time, id] = (cursor ?? '').split('/');
    const found = await client.query<MentionNotificationRow>(
      `SELECT n.id,n.actor,n.source_post,n.source_profile,n.source_community,n.created_at,n.read FROM hash_talk.public_mention_notifications n
      WHERE n.recipient=$1 AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid))
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$1 AND b.target=n.actor) OR (b.actor=n.actor AND b.target=$1)))
      ORDER BY n.created_at DESC,n.id DESC LIMIT 25`,
      [viewer, time || null, id || null],
    );
    const rows = found.rows.slice(0, 24);
    const actors = await this.readers.actors(client, [
      ...new Set(rows.map((row) => row.actor)),
    ]);
    const contexts = await this.readers.contexts(client, viewer, rows);
    const items = rows.flatMap((row) => {
      const actor = actors.get(row.actor),
        context = contexts.get(mentionSourceKey(mentionSource(row)));
      return actor && context
        ? [
            {
              id: row.id,
              actor,
              ...context,
              createdAt: row.created_at.toISOString(),
              read: row.read,
            },
          ]
        : [];
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
