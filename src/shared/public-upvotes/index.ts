import { AccountError, keys, object, uuid } from '../account/index.ts';
import {
  communityArray,
  communityBoolean,
  communityCursor,
} from '../communities/index.ts';
import {
  postCursor,
  postTime,
  replyPreviewLength,
} from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

export interface UpvoteNotice {
  id: string;
  actor: PublicProfile;
  community: string;
  post: string;
  kind: 'post' | 'reply';
  text: string;
  createdAt: string;
  read: boolean;
}
export interface UpvoteNoticePage {
  items: UpvoteNotice[];
  next: string | null;
}
export interface UpvoterPage {
  items: PublicProfile[];
  next: string | null;
}
function notice(value: unknown): UpvoteNotice {
  const data = object(value);
  keys(data, [
    'id',
    'actor',
    'community',
    'post',
    'kind',
    'text',
    'createdAt',
    'read',
  ]);
  if (data['kind'] !== 'post' && data['kind'] !== 'reply')
    throw new AccountError(400, 'Invalid upvote notice.');
  if (
    typeof data['text'] !== 'string' ||
    data['text'].length > replyPreviewLength
  )
    throw new AccountError(400, 'Invalid upvote notice.');
  return {
    id: uuid(data['id']),
    actor: publicProfile(data['actor']),
    community: uuid(data['community']),
    post: uuid(data['post']),
    kind: data['kind'],
    text: data['text'],
    createdAt: postTime(data['createdAt']),
    read: communityBoolean(data['read']),
  };
}
export function upvoteNoticePage(value: unknown): UpvoteNoticePage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(notice),
    next: postCursor(data['next']),
  };
}
export function upvoterPage(value: unknown): UpvoterPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(publicProfile),
    next: communityCursor(data['next']),
  };
}
