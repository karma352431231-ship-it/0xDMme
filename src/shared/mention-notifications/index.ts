import { profileDescriptionText } from '../profile-social/index.ts';
import { AccountError, keys, object, uuid } from '../account/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { communityBoolean, communityText } from '../communities/index.ts';
import { postCursor, postTime } from '../community-posts/index.ts';
export interface MentionNotification {
  id: string;
  actor: PublicProfile;
  source: {
    kind: 'post' | 'reply' | 'profile' | 'community';
    id: string;
    community: string | null;
    name: string | null;
  };
  text: string;
  createdAt: string;
  read: boolean;
}
function source(value: unknown): MentionNotification['source'] {
  const data = object(value);
  keys(data, ['kind', 'id', 'community', 'name']);
  const kind = data['kind'];
  if (!['post', 'reply', 'profile', 'community'].includes(String(kind)))
    throw new AccountError(400, 'Invalid mention origin.');
  const group = data['community'] === null ? null : uuid(data['community']);
  if ((kind === 'post' || kind === 'reply') !== (group !== null))
    throw new AccountError(400, 'Invalid mention origin.');
  return {
    kind: kind as MentionNotification['source']['kind'],
    id: uuid(data['id']),
    community: group,
    name: data['name'] === null ? null : communityText(data['name'], 100),
  };
}
export function mentionNotification(value: unknown): MentionNotification {
  const data = object(value);
  keys(data, ['id', 'actor', 'source', 'text', 'createdAt', 'read']);
  return {
    id: uuid(data['id']),
    actor: publicProfile(data['actor']),
    source: source(data['source']),
    text: profileDescriptionText(data['text']),
    createdAt: postTime(data['createdAt']),
    read: communityBoolean(data['read']),
  };
}
export interface MentionNotificationPage {
  items: MentionNotification[];
  next: string | null;
}
export function mentionNotificationPage(
  value: unknown,
): MentionNotificationPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  if (!Array.isArray(data['items']) || data['items'].length > 24)
    throw new AccountError(400, 'Invalid mention page.');
  return {
    items: data['items'].map(mentionNotification),
    next: postCursor(data['next']),
  };
}
export function mentionNotificationHref(item: MentionNotification): string {
  const { source } = item;
  if (source.kind === 'profile') return `#users?id=${source.id}`;
  if (source.kind === 'community') return `#communities?id=${source.id}`;
  return `#communities?id=${source.community}&post=${source.id}`;
}
