/** Versioned, local transforms: changing one community never rescales another. */
export const rankingVersion = 1;
export const rankingMetricVersion = 1;
export const rankingDay = 86_400_000;
export const rankingNewAge = 7 * rankingDay;
export const rankingNewFollowers = 500;
export const rankingNewParticipants = 3;

export interface RankingMetrics {
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
  const c = comparison.current,
    p = comparison.previous;
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
    volume(c.authors) * (0.5 + diversity) +
    0.8 * Math.min(8, c.upvoteSignal) +
    0.4 * volume(c.votedPosts);
  // A smoothed base and absolute gain keep a tiny doubling from dominating.
  const growth = comparison.historyComplete
    ? 0.7 * adjustedGrowth(c.participants, p.participants) +
      0.3 * adjustedGrowth(c.contributions, p.contributions)
    : 0;
  return Math.round(activity * (1 + Math.min(1.5, growth)) * 1_000_000);
}
function adjustedGrowth(current: number, previous: number): number {
  const gain = Math.max(0, current - previous);
  return Math.min(2, gain / (previous + 100)) * fraction(gain, gain + 50);
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
