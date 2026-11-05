import { keys, object, uuid } from '../account/index.ts';
import { communityArray, communityBoolean } from '../communities/index.ts';
import { postCursor, postTime } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

/** Someone started following the reader's public profile. */
export interface FollowNotice {
  id: string;
  actor: PublicProfile;
  createdAt: string;
  read: boolean;
}
export interface FollowNoticePage {
  items: FollowNotice[];
  next: string | null;
}
function notice(value: unknown): FollowNotice {
  const data = object(value);
  keys(data, ['id', 'actor', 'createdAt', 'read']);
  return {
    id: uuid(data['id']),
    actor: publicProfile(data['actor']),
    createdAt: postTime(data['createdAt']),
    read: communityBoolean(data['read']),
  };
}
export function followNoticePage(value: unknown): FollowNoticePage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(notice),
    next: postCursor(data['next']),
  };
}
