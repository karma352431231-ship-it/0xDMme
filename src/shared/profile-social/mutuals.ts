import { AccountError, keys, object } from '../account/index.ts';
import { communityCursor, communityPageSize } from '../communities/index.ts';
import { postCount } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

export interface MutualFollowers {
  items: PublicProfile[];
  total: number;
  next: string | null;
}
/** People the authenticated visitor follows who also follow the visited profile. */
export function mutualFollowers(value: unknown): MutualFollowers {
  const data = object(value);
  keys(data, ['items', 'total', 'next']);
  if (!Array.isArray(data['items']) || data['items'].length > communityPageSize)
    throw new AccountError(400, 'Invalid mutual followers.');
  const items = data['items'].map(publicProfile),
    total = postCount(data['total']);
  if (
    items.length > total ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new AccountError(400, 'Invalid mutual followers.');
  return { items, total, next: communityCursor(data['next']) };
}
