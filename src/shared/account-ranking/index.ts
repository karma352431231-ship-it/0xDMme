import { keys, object, uuid } from '../account/index.ts';
import { communityArray, communityBoolean } from '../communities/index.ts';
import { postCount, postTime } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { exploreCursor } from '../community-discovery/index.ts';

export interface AccountRankingEntry {
  profile: PublicProfile;
  views: number;
  upvotes: number;
  shares: number;
  comments: number;
  historyComplete: boolean;
}
export interface AccountRankingPage {
  items: AccountRankingEntry[];
  generation: string;
  cutoff: string;
  expiresAt: string;
  next: string | null;
}
export function accountRankingPage(value: unknown): AccountRankingPage {
  const data = object(value);
  keys(data, ['items', 'generation', 'cutoff', 'expiresAt', 'next']);
  exploreCursor(data['next']);
  return {
    generation: uuid(data['generation']),
    cutoff: postTime(data['cutoff']),
    expiresAt: postTime(data['expiresAt']),
    next: data['next'] as string | null,
    items: communityArray(data['items']).map((value) => {
      const row = object(value);
      keys(row, [
        'profile',
        'views',
        'upvotes',
        'shares',
        'comments',
        'historyComplete',
      ]);
      return {
        profile: publicProfile(row['profile']),
        views: postCount(row['views']),
        upvotes: postCount(row['upvotes']),
        shares: postCount(row['shares']),
        comments: postCount(row['comments']),
        historyComplete: communityBoolean(row['historyComplete']),
      };
    }),
  };
}
