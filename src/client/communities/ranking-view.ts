import { communityHref } from '../../shared/app-routes/index.ts';
import { currentLanguage, t } from '../../shared/i18n/index.ts';
import type {
  ExploreFilter,
  ExplorePage,
} from '../../shared/community-discovery/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { classificationBadges } from './classification.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';

interface RankingViewOptions {
  order: ExploreFilter['order'];
  offset: number;
  signal: AbortSignal;
  addCleanup: (cleanup: () => void) => void;
}

/** Presentation only: pagination and resource ownership stay with discovery. */
export function renderCommunityRanking(
  container: HTMLElement,
  page: ExplorePage,
  options: RankingViewOptions,
): number {
  let offset = options.offset;
  for (const item of page.items) {
    const row = el('li', '', 'ranking-row'),
      open = el('a', '', 'ranking-link'),
      avatar = communityAvatar(item.community.name),
      copy = el('span', '', 'ranking-copy');
    open.href = communityHref(item.community);
    copy.append(
      el('strong', item.community.name),
      el('small', item.community.description),
      classificationBadges(item.community.classification),
    );
    open.append(
      el('span', String(++offset), 'ranking-position'),
      avatar,
      copy,
      ...rankingStats(item, options.order),
    );
    row.append(open);
    container.append(row);
    if (item.community.avatar)
      options.addCleanup(
        showPublicAvatar(avatar, {
          kind: 'community-photo',
          target: item.community.id,
          reference: item.community.avatar,
          signal: options.signal,
        }),
      );
  }
  return offset;
}

/** Same figures as before, laid out as columns; growth is never shown as comparable while history forms. */
function rankingStats(
  item: ExplorePage['items'][number],
  order: ExploreFilter['order'],
): HTMLElement[] {
  const number = (value: number) => value.toLocaleString(currentLanguage());
  const stat = (value: string, label: string, className = '') => {
    const node = el('span', '', `ranking-stat ${className}`.trim());
    node.append(el('strong', value), el('small', label));
    return node;
  };
  const followers = stat(
    number(item.community.followers),
    item.community.archived ? t('seguidores · arquivada') : t('seguidores'),
  );
  if (order === 'size') return [followers];
  const growth = stat(
    `+${number(item.upvotes)}`,
    item.historyComplete ? t('upvotes em alta') : t('em formação'),
    'ranking-growth',
  );
  if (!item.historyComplete)
    growth.title = t(
      'Histórico em formação; crescimento ainda não comparável.',
    );
  return [
    followers,
    stat(number(item.participants), t('ranking.active-label')),
    growth,
  ];
}
