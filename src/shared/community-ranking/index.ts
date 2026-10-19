import { AccountError } from '../account/index.ts';
/** Versioned, local transforms: changing one community never rescales another. */
export const rankingVersion = 2;
/**
 * 3: received engagement and one selected window, up to 30 days.
 * 4: account entries also carry the previous window's score (19/10/2026).
 */
export const rankingMetricVersion = 4;
export const rankingDay = 86_400_000;
export const rankingNewAge = 7 * rankingDay;
export const rankingNewFollowers = 500;
export const rankingNewParticipants = 3;

export type RankingPeriod = 'day' | 'week' | 'month';
export const rankingPeriods = ['day', 'week', 'month'] as const;
export function rankingPeriod(value: unknown): RankingPeriod {
  if (value !== 'day' && value !== 'week' && value !== 'month')
    throw new AccountError(400, 'Ranking uses 24 hours, 7 days or 30 days.');
  return value;
}
export interface ReceivedEngagement {
  views: number;
  shares: number;
  upvotes: number;
  comments: number;
  commenters: number;
  conversations: number;
  engagedPosts: number;
  viewSignal: number;
  shareSignal: number;
  upvoteSignal: number;
  votedPosts: number;
}
export const emptyReceivedEngagement = (): ReceivedEngagement => ({
  views: 0,
  shares: 0,
  upvotes: 0,
  comments: 0,
  commenters: 0,
  conversations: 0,
  engagedPosts: 0,
  viewSignal: 0,
  shareSignal: 0,
  upvoteSignal: 0,
  votedPosts: 0,
});

export interface RankingMetrics extends ReceivedEngagement {
  participants: number;
  contributions: number;
  conversations: number;
  returning: number;
  occupied: number;
  intervals: number;
  authors: number;
  originals: number;
  authorSquares: number;
  upvotes: number;
  upvoteSignal: number;
  votedPosts: number;
}
export interface RankingComparison {
  current: RankingMetrics;
  previous: RankingMetrics;
  historyComplete: boolean;
}
export const emptyRankingMetrics = (): RankingMetrics => ({
  ...emptyReceivedEngagement(),
  participants: 0,
  contributions: 0,
  conversations: 0,
  returning: 0,
  occupied: 0,
  intervals: 24,
  authors: 0,
  originals: 0,
  authorSquares: 0,
  upvotes: 0,
  upvoteSignal: 0,
  votedPosts: 0,
});

function volume(value: number): number {
  return Math.log1p(Math.max(0, value));
}
function fraction(n: number, d: number): number {
  return d > 0 ? Math.min(1, Math.max(0, n / d)) : 0;
}
/** Net positive variation, with diminishing influence and breadth across posts. */
export function rankingScore(comparison: RankingComparison): number {
  const c = comparison.current;
  const diversity =
    c.originals > 0
      ? Math.max(0, 1 - c.authorSquares / (c.originals * c.originals))
      : 0;
  const activity =
    4 * volume(c.participants) +
    2 * volume(c.conversations) +
    volume(c.returning) +
    2 * fraction(c.returning, c.participants) +
    2 * fraction(c.occupied, c.intervals) +
    volume(c.authors) * (0.5 + diversity);
  return Math.round((activity + receivedScore(c)) * 1_000_000);
}
/** Local transforms never depend on followers, age or another ranking entry. */
function receivedScore(c: ReceivedEngagement): number {
  return (
    1.2 * Math.min(16, c.upvoteSignal) +
    1.5 * Math.min(12, c.shareSignal) +
    0.3 * Math.min(16, c.viewSignal) +
    0.4 * volume(c.engagedPosts)
  );
}
export function accountRankingScore(c: ReceivedEngagement): number {
  return Math.round(
    (4 * volume(c.commenters) +
      2 * volume(c.conversations) +
      receivedScore(c)) *
      1_000_000,
  );
}
export function newlyCreated(input: {
  createdAt: number | null;
  cutoff: number;
  followers: number;
  participants: number;
  archived: boolean;
}): boolean {
  return (
    !input.archived &&
    input.createdAt !== null &&
    input.createdAt <= input.cutoff &&
    input.cutoff - input.createdAt < rankingNewAge &&
    input.followers <= rankingNewFollowers &&
    input.participants >= rankingNewParticipants
  );
}
