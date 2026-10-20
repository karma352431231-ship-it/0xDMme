/**
 * Growth shown beside a community in the ranking sidebar: active members in
 * the selected period compared with the previous period of the same length,
 * as a raw percent with no cap and no "forming" label (owner decision of
 * 16/10/2026). By the owner's decision
 * of 19/10/2026 growth only counts from a base of at least 1 (1 → 2 is 100%);
 * an empty previous period shows 0%.
 */
import { currentLanguage, t } from '../../shared/i18n/index.ts';
import { communityElement as el } from './elements.ts';

export function rankingGrowth(input: {
  participants: number;
  previous: number;
}): number {
  if (input.previous === 0) return 0;
  return ((input.participants - input.previous) / input.previous) * 100;
}

/**
 * FOMO-style change: green ▲ / red ▼ against the previous period. `title`
 * is the catalog key that says what is compared (active members, relevance).
 */
export function growthLabel(input: {
  participants: number;
  previous: number;
  title: string;
}): HTMLElement {
  const growth = rankingGrowth(input);
  const node = el('small', '', 'ranking-side-growth');
  node.title = t(input.title);
  node.dataset['trend'] = growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat';
  const percent = new Intl.NumberFormat(currentLanguage(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(growth));
  // No change carries no arrow, like a flat coin.
  node.textContent =
    growth === 0
      ? t('ranking.growth-flat {0}', [percent])
      : t(growth < 0 ? 'ranking.growth-down {0}' : 'ranking.growth-up {0}', [
          percent,
        ]);
  return node;
}
