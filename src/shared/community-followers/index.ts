import { AccountError, keys, object } from '../account/index.ts';
import { communityCursor, communityPageSize } from '../communities/index.ts';
import { postCount } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
export type CommunityFollowerTab = 'all' | 'known' | 'staff';
export interface CommunityFollower extends PublicProfile {
  role?: 'owner' | 'moderator' | null;
}
export interface CommunityFollowers {
  items: CommunityFollower[];
  total: number;
  next: string | null;
}
export function communityFollowerTab(value: unknown): CommunityFollowerTab {
  if (value !== 'all' && value !== 'known' && value !== 'staff')
    throw new AccountError(400, 'Lista de seguidores inválida.');
  return value;
}
export function communityFollowers(value: unknown): CommunityFollowers {
  const data = object(value);
  keys(data, ['items', 'total', 'next']);
  if (!Array.isArray(data['items']) || data['items'].length > communityPageSize)
    throw new AccountError(400, 'Seguidores inválidos.');
  const items = data['items'].map(follower),
    total = postCount(data['total']);
  if (
    items.length > total ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new AccountError(400, 'Seguidores inválidos.');
  return { items, total, next: communityCursor(data['next']) };
}

function follower(value: unknown): CommunityFollower {
  const data = object(value);
  if (!Object.hasOwn(data, 'role')) return publicProfile(data);
  keys(data, ['id', 'handle', 'avatar', 'role']);
  const role = data['role'];
  if (role !== null && role !== 'owner' && role !== 'moderator')
    throw new AccountError(400, 'Função pública inválida.');
  return {
    ...publicProfile({
      id: data['id'],
      handle: data['handle'],
      avatar: data['avatar'],
    }),
    role,
  };
}
