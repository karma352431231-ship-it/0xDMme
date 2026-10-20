import { AccountError, keys, object, uuid } from '../account/index.ts';
import { communityArray } from '../communities/index.ts';
import { profileDescriptionText } from '../profile-social/index.ts';
import { postCount, postTime } from '../community-posts/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';
import { exploreCursor } from '../community-discovery/index.ts';

/**
 * One account in the ranking (19/10/2026): public bio and follower total, the
 * relevance score that orders the list and the same score for the period
 * right before, for the growth shown beside it. The four received counters
 * stay available as the row's detail.
 */
export interface AccountRankingEntry {
  profile: PublicProfile;
  description: string;
  followers: number;
  score: number;
  previousScore: number;
  views: number;
  upvotes: number;
  shares: number;
  comments: number;
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
        'description',
        'followers',
        'score',
        'previousScore',
        'views',
        'upvotes',
        'shares',
        'comments',
      ]);
      return {
        profile: publicProfile(row['profile']),
        description: profileDescriptionText(row['description']),
        followers: postCount(row['followers']),
        score: postCount(row['score']),
        previousScore: postCount(row['previousScore']),
        views: postCount(row['views']),
        upvotes: postCount(row['upvotes']),
        shares: postCount(row['shares']),
        comments: postCount(row['comments']),
      };
    }),
  };
}

export type AccountRankingOrder = 'trending' | 'size' | 'following';
export function accountRankingOrder(value: unknown): AccountRankingOrder {
  if (value !== 'trending' && value !== 'size' && value !== 'following')
    throw new AccountError(400, 'Invalid ordering.');
  return value;
}
