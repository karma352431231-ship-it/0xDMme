import { t } from '../../shared/i18n/index.ts';
import { communityElement } from './elements.ts';

export function feedSearchScope(view: string, search: string): string {
  const params = new URLSearchParams({ view });
  if (search) params.set('q', search);
  return `#communities?${params.toString()}`;
}

export function appendFeedSearchSummary(
  toolbar: HTMLElement,
  search: string,
  view: string,
): void {
  if (!search) return;
  const summary = communityElement(
    'p',
    t('Search results for “{0}”', [search]),
  );
  const clear = communityElement('a', t('Clear search'));
  clear.href = feedSearchScope(view, '');
  summary.append(document.createTextNode(' · '), clear);
  toolbar.append(summary);
}
