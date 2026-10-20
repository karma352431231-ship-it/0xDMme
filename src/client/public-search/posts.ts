import { appHref } from '../../shared/app-routes/index.ts';
import { t } from '../../shared/i18n/index.ts';

/** Search submission opens the existing feed so its scopes and filters apply. */
export function appendPostSearch(list: HTMLElement, query: string): void {
  const link = document.createElement('a');
  link.className = 'public-search-choice';
  link.dataset['postSearch'] = '';
  link.href = appHref(
    'communities',
    new URLSearchParams({ view: 'feed', q: query }),
  );
  link.textContent = t('Search posts for “{0}”', [query]);
  list.append(link);
}
