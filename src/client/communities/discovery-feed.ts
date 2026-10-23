import type { PublicActionAccess } from '../public-action-guidance/index.ts';
import { feedPage } from '../../shared/community-discovery/index.ts';
import type {
  FeedOrder,
  DiscoveryPeriod,
  FeedScope,
} from '../../shared/community-discovery/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { communityRead } from './controller.ts';
import type { Communities } from './controller.ts';
import { DiscoverySnapshot } from './discovery-page.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { renderFeedCard } from './feed-card.ts';
import {
  communityElement as el,
  communityButton as button,
} from './elements.ts';

export interface DiscoveryFeedFilter {
  order: FeedOrder;
  period: DiscoveryPeriod;
  search: string;
}
interface FeedPageOptions {
  view: string;
  signedIn: boolean;
  controller: Communities;
  profiles: FeedProfileFollows;
  participation: PublicActionAccess;
  privacy: ExternalMediaConsent;
  signal: AbortSignal;
  list: HTMLElement;
  paging: HTMLElement;
  feedback: HTMLElement;
  run: (work: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
  followChanged: () => Promise<void>;
}

/** A bounded feed page owns its query, cursor, snapshot, cards and media. */
export class DiscoveryFeedPage {
  readonly kind = 'feed';
  private readonly options: FeedPageOptions;
  private filter: DiscoveryFeedFilter = {
    order: 'mixed',
    period: 'all',
    search: '',
  };
  private after: string | null = null;
  private displayed: string | null = null;
  private newest = 0;
  private active = true;
  private readonly snapshot = new DiscoverySnapshot();
  private readonly media = new Set<() => void>();

  constructor(options: FeedPageOptions) {
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
  }
  showDisplayed(): void {
    this.after = this.displayed;
  }
  invalidate(): void {
    this.snapshot.clear();
  }
  dispose(): void {
    this.active = false;
    this.clearMedia();
    this.snapshot.clear();
  }
  private valid(): boolean {
    return this.active && !this.options.signal.aborted;
  }
  private clearMedia(): void {
    for (const cleanup of this.media) cleanup();
    this.media.clear();
  }
  private query(cursor: string | null): string {
    const data = new URLSearchParams({
      order: this.filter.order,
      period: this.filter.period,
    });
    if (cursor) data.set('after', cursor);
    if (this.filter.search) data.set('q', this.filter.search);
    return data.toString();
  }
  private scope(): FeedScope {
    const scopes: Record<string, FeedScope> = {
      following: 'following',
      saved: 'saved',
      hidden: 'hidden',
    };
    return scopes[this.options.view] ?? 'all';
  }
  private read(cursor: string | null): Promise<unknown> {
    const { controller, signedIn, signal } = this.options;
    if (signedIn)
      return controller.request('discovery-feed', {
        filter: {
          scope: this.scope(),
          order: this.filter.order,
          period: this.filter.period,
          community: null,
          tag: null,
          ...(this.filter.search ? { search: this.filter.search } : {}),
        },
        after: cursor,
      });
    return communityRead(
      `/api/communities/feed?${this.query(cursor)}`,
      AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    );
  }
  async peek(signal: AbortSignal): Promise<PublicProfile[]> {
    if (!this.newest) return [];
    const page = feedPage(await this.read(null));
    if (signal.aborted || !this.valid()) return [];
    const authors = new Map<string, PublicProfile>();
    for (const { post } of page.items)
      if (post.author && Date.parse(post.createdAt) > this.newest)
        authors.set(post.author.id, post.author);
    return [...authors.values()];
  }
  async load(filter: DiscoveryFeedFilter): Promise<boolean> {
    this.filter = { ...filter };
    const cursor = this.after,
      query = this.query(cursor),
      result = await this.read(cursor);
    if (!this.valid()) return false;
    const { page, changed } = this.snapshot.read(
      this.options.view,
      query,
      result,
    );
    if (page.kind !== 'feed') throw new Error('Invalid feed page.');
    this.after = page.value.next;
    this.displayed = cursor;
    this.options.feedback.textContent = '';
    if (!changed) return false;
    this.clearMedia();
    this.options.list.replaceChildren();
    this.options.paging.replaceChildren();
    this.render(page.value);
    if (cursor === null)
      this.newest = Math.max(
        0,
        ...page.value.items.map(({ post }) => Date.parse(post.createdAt) || 0),
      );
    this.paging();
    return true;
  }
  private render(page: ReturnType<typeof feedPage>): void {
    const seen = new Set<string>();
    const { list, ...options } = this.options;
    for (const entry of page.items) {
      if (seen.has(entry.post.id)) continue;
      seen.add(entry.post.id);
      if (seen.size > 240) seen.delete(seen.values().next().value!);
      list.append(
        renderFeedCard(entry, {
          search: this.filter.search,
          controller: options.controller,
          profiles: options.profiles,
          participation: options.participation,
          privacy: options.privacy,
          signal: options.signal,
          signedIn: options.signedIn,
          chooseOnMobile:
            options.view === 'feed' || options.view === 'following',
          run: options.run,
          valid: () => this.valid(),
          changed: options.reload,
          followChanged: options.followChanged,
          addCleanup: (cleanup) => {
            this.media.add(cleanup);
          },
        }),
      );
    }
  }
  private paging(): void {
    const { list, paging, run } = this.options;
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
  }
}
