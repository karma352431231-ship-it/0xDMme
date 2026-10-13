import type pg from 'pg';
import type { PublicProfileStore } from './public-profile.ts';
import type { CommunityStore } from './communities.ts';
import type { CommunityPostStore } from './community-posts.ts';
import type {
  MentionContext,
  MentionNotificationRow,
} from './mention-notifications.ts';
import { mentionSource, mentionSourceKey } from './mention-notifications.ts';
import { mentionPlainText } from '../../shared/public-mentions/index.ts';
export async function readMentionContexts(input: {
  client: pg.PoolClient;
  viewer: string;
  rows: readonly MentionNotificationRow[];
  profiles: PublicProfileStore;
  communities: CommunityStore;
  posts: CommunityPostStore;
}): Promise<Map<string, MentionContext>> {
  const sources = input.rows.map(mentionSource);
  const ids = (kind: 'post' | 'profile' | 'community') => [
    ...new Set(
      sources
        .filter((source) => source.kind === kind)
        .map((source) => source.id),
    ),
  ];
  const posts = await input.posts.mentionContexts(
    input.client,
    input.viewer,
    ids('post'),
  );
  const profiles = await input.profiles.descriptions.readMany(
    input.client,
    ids('profile'),
  );
  const communities = await input.communities.readMany(
    input.client,
    ids('community'),
  );
  const contexts = new Map<string, MentionContext>();
  for (const post of posts)
    contexts.set(mentionSourceKey({ kind: 'post', id: post.id }), {
      source: {
        kind: post.parent ? 'reply' : 'post',
        id: post.id,
        community: post.community,
        name: null,
      },
      text: preview(post.title || post.text),
    });
  for (const [id, description] of profiles)
    contexts.set(mentionSourceKey({ kind: 'profile', id }), {
      source: { kind: 'profile', id, community: null, name: null },
      text: preview(description),
    });
  for (const community of communities)
    contexts.set(mentionSourceKey({ kind: 'community', id: community.id }), {
      source: {
        kind: 'community',
        id: community.id,
        community: null,
        name: community.name,
      },
      text: preview(community.description),
    });
  return contexts;
}

function preview(text: string): string {
  return [...mentionPlainText(text).replace(/\s+/gu, ' ').trim()]
    .slice(0, 280)
    .join('');
}
