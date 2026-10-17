import { keys, object, uuid } from '../account/index.ts';
import { communityText, communityBoolean } from '../communities/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
export interface PublicNotificationPreview {
  author: PublicProfile;
  community: string;
  post: string;
  text: string;
  reply: boolean;
  /** A post or reply by a profile followed with notifications on (16/10/2026). */
  followed: boolean;
}
export function publicNotificationPreview(
  value: unknown,
): PublicNotificationPreview {
  const data = object(value);
  keys(data, ['author', 'community', 'post', 'text', 'reply', 'followed']);
  return {
    author: publicProfile(data['author']),
    community: uuid(data['community']),
    post: uuid(data['post']),
    text: communityText(data['text'], 180, true),
    reply: communityBoolean(data['reply']),
    followed: communityBoolean(data['followed']),
  };
}
export function publicNotificationText(title: string, text: string): string {
  const value = [title, text]
    .filter(Boolean)
    .join(' — ')
    .replace(/\s+/gu, ' ')
    .trim();
  const characters = [...value];
  return characters.length > 160
    ? characters.slice(0, 159).join('') + '…'
    : value;
}
