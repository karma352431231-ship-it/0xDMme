import type { AccountRankingOrder } from '../../shared/account-ranking/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { communityElement as el } from './elements.ts';
export function accountOrderControls(
  selected: (order: AccountRankingOrder) => void,
): HTMLElement {
  const bar = el('nav', '', 'ranking-side-tabs');
  bar.setAttribute('aria-label', t('ranking.scope'));
  const buttons = new Map<AccountRankingOrder, HTMLButtonElement>();
  for (const [order, label] of [
    ['trending', 'ranking.trending'],
    ['size', 'ranking.biggest'],
    ['following', 'ranking.following'],
  ] as const) {
    const button = el('button', t(label));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(order === 'trending'));
    button.addEventListener('click', () => {
      for (const [value, node] of buttons)
        node.setAttribute('aria-pressed', String(value === order));
      selected(order);
    });
    buttons.set(order, button);
    bar.append(button);
  }
  return bar;
}
