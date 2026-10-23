import type { CommunityTopic } from '../../shared/community-classification/index.ts';
import type {
  DiscoveryPeriod,
  ExploreFilter,
} from '../../shared/community-discovery/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { communityRead } from './controller.ts';
import { DiscoverySnapshot } from './discovery-page.ts';
import {
  communityElement as el,
  communityButton as button,
} from './elements.ts';
import { renderCommunityRanking } from './ranking-view.ts';

export interface DiscoveryRankingFilter {
  order: ExploreFilter['order'];
  period: DiscoveryPeriod;
  topics: readonly CommunityTopic[];
}
interface RankingPageOptions {
  signal: AbortSignal;
  list: HTMLElement;
  paging: HTMLElement;
  feedback: HTMLElement;
  run: (work: () => Promise<void>) => Promise<void>;
}

/** Ranking pagination and avatar resources never share the feed's cursor. */
export class DiscoveryRankingPage {
  readonly kind = 'ranking';
  private readonly options: RankingPageOptions;
  private filter: DiscoveryRankingFilter = {
    order: 'trending',
    period: 'day',
    topics: [],
  };
  private after: string | null = null;
  private displayed: string | null = null;
  private rank = 0;
  private displayedRank = 0;
  private active = true;
  private readonly snapshot = new DiscoverySnapshot();
  private readonly media = new Set<() => void>();

  constructor(options: RankingPageOptions) {
    this.options = options;
  }
  get displayedAfter(): string | null {
    return this.displayed;
  }
  startAt(cursor: string | null): void {
    this.after = cursor;
  }
  reset(): void {
    this.after = null;
    this.rank = 0;
  }
  showDisplayed(): void {
    this.after = this.displayed;
    this.rank = this.displayedRank;
  }
  invalidate(): void {
    this.snapshot.clear();
  }
  dispose(): void {
    this.active = false;
    this.clearMedia();
    this.snapshot.clear();
  }
  private clearMedia(): void {
    for (const cleanup of this.media) cleanup();
    this.media.clear();
  }
  private query(): string {
    const data = new URLSearchParams({
      order: this.filter.order,
      period: this.filter.period,
    });
    if (this.filter.topics.length)
      data.set('topics', this.filter.topics.join(','));
    if (this.after) data.set('after', this.after);
    return data.toString();
  }
  async load(filter: DiscoveryRankingFilter): Promise<boolean> {
    this.filter = { ...filter, topics: [...filter.topics] };
    const cursor = this.after,
      rank = this.rank,
      query = this.query();
    const result = await communityRead(
      `/api/communities/explore?${query}`,
      AbortSignal.any([this.options.signal, AbortSignal.timeout(8000)]),
    );
    if (!this.active || this.options.signal.aborted) return false;
    const { page, changed } = this.snapshot.read('explore', query, result);
    if (page.kind !== 'explore') throw new Error('Invalid ranking page.');
    this.after = page.value.next;
    this.displayed = cursor;
    this.displayedRank = rank;
    this.options.feedback.textContent = '';
    if (!changed) {
      this.rank += page.value.items.length;
      return false;
    }
    this.clearMedia();
    const { list, paging, signal, run } = this.options;
    list.replaceChildren();
    paging.replaceChildren();
    this.rank = renderCommunityRanking(list, page.value, {
      order: this.filter.order,
      offset: rank,
      signal,
      addCleanup: (cleanup) => {
        this.media.add(cleanup);
      },
    });
    if (!list.children.length)
      list.append(
        el(
          'p',
          t('No content on this page matches these filters.'),
          'community-empty',
        ),
      );
    if (this.after)
      button(paging, t('Next page'), () =>
        run(async () => {
          await this.load(this.filter);
        }),
      );
    return true;
  }
}
