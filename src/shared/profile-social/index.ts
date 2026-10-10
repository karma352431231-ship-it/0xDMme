import { AccountError, keys, object, uuid } from '../account/index.ts';
import { communityBoolean } from '../communities/index.ts';
import { postCount, postTime } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { publicAvatar } from '../public-media/index.ts';
import { pendingPublicAvatar } from '../public-avatar/index.ts';
import type { PendingPublicAvatar } from '../public-avatar/index.ts';

export interface ProfileSummary {
  profile: PublicProfile;
  banner: string | null;
  createdAt: string | null;
  conversations: number;
  posts: number;
  replies: number;
  communities: number;
  followers: number;
}
export interface ProfileFollow {
  following: boolean;
  revision: number;
}
export interface ProfileBanner {
  revision: number;
  banner: PendingPublicAvatar | null;
}
export function profileSummary(value: unknown): ProfileSummary {
  const data = object(value);
  keys(data, [
    'profile',
    'banner',
    'createdAt',
    'conversations',
    'posts',
    'replies',
    'communities',
    'followers',
  ]);
  const profile = publicProfile(data['profile']);
  return {
    profile,
    banner: publicAvatar(data['banner'], 'profile-banner', profile.id),
    createdAt: data['createdAt'] === null ? null : postTime(data['createdAt']),
    conversations: postCount(data['conversations']),
    posts: postCount(data['posts']),
    replies: postCount(data['replies']),
    communities: postCount(data['communities']),
    followers: postCount(data['followers']),
  };
}
export function profileFollow(value: unknown): ProfileFollow {
  const data = object(value);
  keys(data, ['following', 'revision']);
  return {
    following: communityBoolean(data['following']),
    revision: postCount(data['revision']),
  };
}
export function profileBanner(value: unknown): ProfileBanner {
  const data = object(value);
  keys(data, ['revision', 'banner']);
  return {
    revision: postCount(data['revision']),
    banner: pendingPublicAvatar(data['banner']),
  };
}
export function profileActivityFilter(value: unknown) {
  const data = object(value);
  keys(data, ['profile', 'tab']);
  const tab = data['tab'];
  if (tab !== 'overview' && tab !== 'posts' && tab !== 'replies')
    throw new AccountError(400, 'Aba de perfil inválida.');
  return { profile: uuid(data['profile']), tab };
}
