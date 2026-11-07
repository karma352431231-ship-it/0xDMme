import { t } from '../../shared/i18n/index.ts';
import type { AccountRankingEntry } from '../../shared/account-ranking/index.ts';
import { rankingGrowth } from './ranking-side-growth.ts';
import { communityElement as el } from './elements.ts';

/**
 * Growth tags of the user ranking (owner, 06/11/2026): one per row, under the
 * percent, in this priority. New covers a profile's first 48 hours whatever
 * its growth; otherwise negative or zero growth shows no tag.
 */
export type AccountGrowthTag =
  'new' | 'skyrocketing' | 'viral' | 'followers' | 'trending';
const newAge = 48 * 3_600_000;
const skyrocketing = 300;
const viralShares = 5;
const gainingFollowers = 5;

export function accountGrowthTag(
  item: Pick<
    AccountRankingEntry,
    'score' | 'previousScore' | 'shares' | 'growth'
  >,
  now: number,
): AccountGrowthTag | null {
  const created = item.growth?.createdAt;
  if (created && now - Date.parse(created) <= newAge) return 'new';
  const growth = rankingGrowth({
    participants: item.score,
    previous: item.previousScore,
  });
  if (growth <= 0) return null;
  if (growth >= skyrocketing) return 'skyrocketing';
  if (item.shares >= viralShares) return 'viral';
  if ((item.growth?.newFollowers ?? 0) >= gainingFollowers) return 'followers';
  return 'trending';
}
const labels: Record<AccountGrowthTag, string> = {
  new: 'ranking.tag-new',
  skyrocketing: 'ranking.tag-skyrocketing',
  viral: 'ranking.tag-viral',
  followers: 'ranking.tag-followers',
  trending: 'ranking.tag-trending',
};
export function accountGrowthTagLabel(tag: AccountGrowthTag): HTMLElement {
  const node = el('small', t(labels[tag]), 'account-growth-tag');
  node.dataset['tag'] = tag;
  return node;
}
