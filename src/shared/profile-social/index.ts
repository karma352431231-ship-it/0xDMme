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
  description: string;
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
export interface ProfileDescription {
  revision: number;
  description: string;
}
export const profileDescriptionLength = 280;
// Invisible controls that could hide or reorder text; emoji joiners stay allowed.
const hiddenControls =
  /(?!\n)\p{Cc}|[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;
/**
 * Plain text and emoji only, shown as text (never markup or links): at most
 * 280 characters and five lines; blank-line runs collapse to one.
 */
export function profileDescriptionText(value: unknown): string {
  if (typeof value !== 'string')
    throw new AccountError(400, 'Descrição inválida.');
  const text = value
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .replace(/\t/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (hiddenControls.test(text))
    throw new AccountError(400, 'A descrição tem caracteres invisíveis.');
  if ([...text].length > profileDescriptionLength)
    throw new AccountError(
      400,
      `A descrição aceita até ${profileDescriptionLength} caracteres.`,
    );
  if (text.split('\n').length > 5)
    throw new AccountError(400, 'A descrição aceita até cinco linhas.');
  return text;
}
export function profileDescription(value: unknown): ProfileDescription {
  const data = object(value);
  keys(data, ['revision', 'description']);
  return {
    revision: postCount(data['revision']),
    description: profileDescriptionText(data['description']),
  };
}
export interface ProfileBanner {
  revision: number;
  banner: PendingPublicAvatar | null;
}
export function profileSummary(value: unknown): ProfileSummary {
  const data = object(value);
  keys(data, [
    'profile',
    'description',
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
    description: profileDescriptionText(data['description']),
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
