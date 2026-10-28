import type { CommunityTopic } from '../../shared/community-classification/index.ts';
import type {
  DiscoveryPeriod,
  ExploreFilter,
  FeedOrder,
} from '../../shared/community-discovery/index.ts';
import {
  discoveryPeriod,
  exploreFilter,
  feedFilter,
} from '../../shared/community-discovery/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { postSearchQuery } from '../../shared/post-search/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { appendOwnProfileShortcut } from '../profile-shortcut/index.ts';
import type { PublicActionAccess } from '../public-action-guidance/index.ts';
import {
  missingPublicProfile,
  showPublicProfileGuidance,
} from '../public-action-guidance/index.ts';
import { mountPublicSearchToolbar } from '../public-search/index.ts';
import { mountDiscoveryRanking, rankingScopes } from './account-ranking.ts';
import { rankingTopicFilter } from './classification.ts';
import type { Communities } from './controller.ts';
import {
  discoveryMenu,
  discoveryPeriods,
  feedOrders,
} from './discovery-controls.ts';
import { DiscoveryFeedPage } from './discovery-feed.ts';
import { DiscoveryRankingPage } from './discovery-ranking.ts';
import { communityElement as el, communityLink as link } from './elements.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { FeedRefresh } from './feed-refresh.ts';
import { hasOpenFeedReply } from './feed-reply.ts';
import type { FeedBookmark } from './feed-return.ts';
import {
  FeedPark,
  feedPosition,
  rememberFeedChoice,
  rememberedFeedChoice,
  restoreFeedPosition,
} from './feed-return.ts';
import { appendFeedSearchSummary, feedSearchScope } from './feed-search.ts';
import { communityIcon } from './presentation.ts';
import { watchRankingUpdates } from './ranking-live.ts';

export function startCommunityDiscovery(
  controller: Communities,
  privacy: ExternalMediaConsent,
  profiles: FeedProfileFollows,
  participation: PublicActionAccess,
) {
  let mounted: HTMLElement | null = null,
    list: HTMLElement | null = null,
    paging: HTMLElement | null = null,
    feedback: HTMLElement | null = null;
  let generation = 0,
    signedIn = false,
    abort = new AbortController();
  let busy: Promise<void> | null = null;
  let followChanged: () => Promise<void> = () => Promise.resolve();
  let view = 'feed',
    search = '',
    order: FeedOrder = 'mixed',
    period: DiscoveryPeriod = 'all',
    exploreOrder: ExploreFilter['order'] = 'trending';
  let selectedTopics: CommunityTopic[] = [];
  let page: DiscoveryFeedPage | DiscoveryRankingPage | null = null;
  let feedRefresh: FeedRefresh | null = null;
  let rankingScope: ReturnType<typeof rankingScopes> | null = null;
  // The pill has its own lifetime: a kept page gets a new one on its return.
  let refreshAbort = new AbortController();
  // Nodes the communities page placed before this feed; the rest belong to it.
  let foreign = new Set<Node>();
  const park = new FeedPark();
  let tabBookmark: FeedBookmark | null = null;
  function disabled(): void {
    mounted
      ?.querySelectorAll<
        HTMLButtonElement | HTMLSelectElement | HTMLInputElement
      >('button,select,input')
      .forEach((node) => {
        node.disabled = Boolean(busy);
      });
  }
  function run(work: () => Promise<void>): Promise<void> {
    if (busy) return busy;
    const old = generation;
    busy = Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        page?.invalidate();
        // A connected account without a public profile is led to create one
        // instead of reading a server refusal in the feed status.
        if (old === generation && missingPublicProfile(error)) {
          showPublicProfileGuidance('participate');
          return;
        }
        if (old === generation && feedback)
          feedback.textContent =
            error instanceof Error
              ? translatedError(error.message)
              : t('Feed unavailable.');
      })
      .finally(() => {
        busy = null;
        disabled();
        if (old !== generation && mounted) ready();
      });
    disabled();
    return busy;
  }
  function filters(): void {
    if (!mounted) return;
    const toolbar = el('div', '', 'post-toolbar community-feed-filters');
    toolbar.classList.toggle('community-ranking-filters', view === 'explore');
    mounted.append(toolbar);
    if (view === 'feed' || view === 'following') {
      const scopes = el('nav', '', 'community-feed-scopes');
      scopes.setAttribute('aria-label', t('Choose feed'));
      for (const [key, label] of [
        ['feed', t('Discover')],
        ['following', t('follow.following')],
      ] as const) {
        link(scopes, label, feedSearchScope(key, search));
        if (view === key)
          scopes.lastElementChild?.setAttribute('aria-current', 'page');
      }
      toolbar.append(scopes);
    }
    const periodPanel = el('div', '', 'community-ranking-period');
    if (view === 'explore')
      discoveryMenu(
        toolbar,
        t('Sort communities'),
        {
          value: exploreOrder,
          options: [
            ['trending', t('Trending')],
            ['size', t('Largest')],
            ['new', t('New communities')],
          ],
        },
        (value) => {
          exploreOrder = exploreFilter({ order: value, period }).order;
          periodPanel.hidden = exploreOrder === 'size';
          rememberFeedChoice(view, { explore: exploreOrder, period });
          void run(reload);
        },
      );
    else
      discoveryMenu(
        toolbar,
        t('Sort'),
        { value: order, options: feedOrders },
        (value) => {
          order = feedFilter({
            scope: 'all',
            order: value,
            period,
            community: null,
            tag: null,
          }).order;
          rememberFeedChoice(view, { order, period });
          void run(reload);
        },
      );
    toolbar.append(periodPanel);
    periodPanel.hidden = view === 'explore' && exploreOrder === 'size';
    discoveryMenu(
      periodPanel,
      t('Period'),
      {
        value: period,
        options:
          view === 'explore'
            ? [
                ['day', t('24 hours')],
                ['week', t('7 days')],
                ['month', t('30 days')],
              ]
            : discoveryPeriods,
      },
      (value) => {
        period =
          view === 'explore'
            ? exploreFilter({ order: exploreOrder, period: value }).period
            : discoveryPeriod(value);
        rememberFeedChoice(view, { order, explore: exploreOrder, period });
        void run(reload);
      },
    );
    mountPublicSearchToolbar(toolbar, abort.signal);
    appendFeedSearchSummary(toolbar, search, view);
    postShortcut(toolbar);
    rankingTopicFilter(mounted, {
      active: view === 'explore',
      selected: selectedTopics,
      change: (value) => {
        selectedTopics = value;
        void run(reload);
      },
    });
  }
  /** Posting moved to the floating "+" menu; the toolbar keeps the own-profile shortcut. */
  function postShortcut(toolbar: HTMLElement): void {
    if (!signedIn || (view !== 'feed' && view !== 'following')) return;
    appendOwnProfileShortcut(toolbar);
  }
  async function peekNewAuthors(signal: AbortSignal): Promise<PublicProfile[]> {
    return page?.kind === 'feed' ? page.peek(signal) : [];
  }
  function load(): Promise<boolean> {
    if (!page) return Promise.resolve(false);
    return page.kind === 'feed'
      ? page.load({ order, period, search })
      : page.load({ order: exploreOrder, period, topics: selectedTopics });
  }
  async function reload(): Promise<void> {
    if (mounted) feedScrollerReset();
    page?.reset();
    await load();
  }
  function feedScrollerReset(): void {
    if (mounted)
      restoreFeedPosition(mounted, {
        view,
        order,
        period,
        after: null,
        top: 0,
        anchor: null,
      });
  }
  function ready(): void {
    void run(reload);
  }
  async function refresh(): Promise<void> {
    if (rankingScope?.active()) return rankingScope.refresh();
    if (!mounted || hasOpenFeedReply(mounted)) return;
    await run(async () => {
      page?.showDisplayed();
      await load();
    });
  }
  /**
   * Leaving for a profile keeps this page intact (see FeedPark); anything else,
   * or a page already kept, ends it. A kept page stays until its return, a
   * different feed, a session change or its time limit.
   */
  function leave(): void {
    rankingScope = null;
    if (!mounted && park.holding) return;
    if (
      mounted &&
      park.hold({ nodes: ownNodes, signedIn, release: teardown })
    ) {
      refreshAbort.abort();
      feedRefresh = null;
      mounted = null;
      return;
    }
    teardown();
  }
  function ownNodes(): Node[] {
    return [...(mounted?.childNodes ?? [])].filter(
      (node) =>
        !foreign.has(node) &&
        !(node as Partial<Element>).classList?.contains('feed-refresh'),
    );
  }
  function startRefreshPill(): void {
    if (!mounted || !list) return;
    refreshAbort = new AbortController();
    feedRefresh = new FeedRefresh({
      container: mounted,
      before: list,
      signal: AbortSignal.any([abort.signal, refreshAbort.signal]),
      refresh: () => run(reload),
      peek: view === 'explore' ? null : peekNewAuthors,
    });
  }
  /** The kept page is back as it was; the server is asked again behind it. */
  function resume(container: HTMLElement, saved: FeedBookmark): void {
    mounted = container;
    startRefreshPill();
    // Right after the page switch resets the workspace scroll, before any paint.
    queueMicrotask(() => {
      if (mounted === container)
        restoreFeedPosition(
          container,
          saved,
          AbortSignal.any([abort.signal, refreshAbort.signal]),
        );
    });
    void run(async () => {
      page?.showDisplayed();
      if ((await load()) && mounted)
        restoreFeedPosition(
          mounted,
          saved,
          AbortSignal.any([abort.signal, refreshAbort.signal]),
        );
    });
  }
  function teardown(): void {
    page?.dispose();
    page = null;
    generation++;
    abort.abort();
    refreshAbort.abort();
    mounted = null;
    list = null;
    paging = null;
    feedback = null;
    feedRefresh = null;
  }
  function startPage(bookmark?: FeedBookmark | null): void {
    if (!bookmark) {
      ready();
      return;
    }
    void run(async () => {
      page?.startAt(bookmark.after);
      await load();
      if (mounted) restoreFeedPosition(mounted, bookmark, abort.signal);
    });
  }
  function initialFilters(bookmark?: FeedBookmark | null): void {
    const defaults: Record<string, FeedOrder> = {
      feed: 'mixed',
      following: 'recent',
      explore: 'recent',
      saved: 'recent',
      hidden: 'recent',
    };
    // Defaults apply until the person chooses; a return bookmark wins over both.
    const saved = rememberedFeedChoice(view);
    order = bookmark?.order ?? saved.order ?? defaults[view]!;
    period =
      bookmark?.period ??
      saved.period ??
      (['explore', 'feed'].includes(view) ? 'day' : 'all');
    exploreOrder = saved.explore ?? 'trending';
  }
  function bookmark(): FeedBookmark | null {
    if (!mounted || !['feed', 'following'].includes(view)) return null;
    return {
      view,
      order,
      period,
      after: page?.displayedAfter ?? null,
      ...(search ? { search } : {}),
      ...feedPosition(mounted),
    };
  }
  function returningBookmark(options: {
    view: string;
    search?: string;
    bookmark?: FeedBookmark | null;
  }): FeedBookmark | null {
    const saved =
      options.bookmark ??
      (tabBookmark?.view === options.view ? tabBookmark : null);
    tabBookmark = null;
    return saved && (saved.search ?? '') !== postSearchQuery(options.search)
      ? null
      : saved;
  }
  return {
    mount(
      container: HTMLElement,
      options: {
        view: string;
        search?: string;
        signedIn: boolean;
        followChanged?: () => Promise<void>;
        bookmark?: FeedBookmark | null;
      },
    ): void {
      followChanged = options.followChanged ?? (() => Promise.resolve());
      search = postSearchQuery(options.search);
      foreign = new Set(container.childNodes);
      const kept = park.resume(
        container,
        returningBookmark(options),
        options.signedIn,
      );
      if (kept) {
        resume(container, kept);
        return;
      }
      leave();
      mounted = container;
      abort = new AbortController();
      view = options.view;
      signedIn = options.signedIn;
      initialFilters(options.bookmark);
      const ranking = mountDiscoveryRanking(container, view, abort.signal, {
        signedIn: () => signedIn,
        following: (period, after) =>
          controller.request('discovery-accounts', { period, after }),
      });
      rankingScope = ranking.scope;
      mounted = ranking.element;
      watchRankingUpdates({
        enabled: view === 'explore',
        signal: abort.signal,
        visible: () => container.isConnected && !container.hidden,
        refresh: async () => {
          await busy;
          if (mounted !== ranking.element) return;
          if (ranking.scope?.active()) await ranking.scope.published();
          else await run(reload);
        },
      });
      const titles: Record<string, string> = {
        feed: t('Feed'),
        following: t('follow.following'),
        explore: t('Community ranking'),
        saved: t('Your saved posts'),
        hidden: t('Content hidden from your feeds'),
      };
      const heading = el('header', '', 'community-heading'),
        text = el('div');
      text.append(el('h1', titles[view] ?? t('Feed')));
      heading.append(text);
      mounted.append(heading);
      if (!signedIn && view !== 'feed' && view !== 'explore') {
        link(
          mounted,
          t('Sign in through Profile to access your list'),
          '#settings',
        );
        return;
      }
      const label = el(
        'p',
        t('Public reading · account required to participate'),
        'community-public-label',
      );
      label.prepend(communityIcon('globe'));
      text.append(label);
      filters();
      feedback = el('p', '', 'community-feedback');
      feedback.setAttribute('role', 'status');
      list = el(
        view === 'explore' ? 'ol' : 'section',
        '',
        view === 'explore' ? 'community-ranking' : 'community-feed',
      );
      paging = el('div', '', 'post-toolbar');
      mounted.append(feedback, list, paging);
      const presentation = {
        list,
        paging,
        feedback,
        signal: abort.signal,
        run,
      };
      page =
        view === 'explore'
          ? new DiscoveryRankingPage(presentation)
          : new DiscoveryFeedPage({
              ...presentation,
              view,
              signedIn,
              controller,
              profiles,
              participation,
              privacy,
              reload,
              followChanged: () => followChanged(),
            });
      startRefreshPill();
      startPage(options.bookmark);
    },
    leave,
    visitView: (): string => tabBookmark?.view ?? 'feed',
    /** Keep the current bounded page across in-app tabs, without persisting content. */
    pause(): void {
      const saved = bookmark();
      if (saved) {
        tabBookmark = saved;
        park.request(saved, true);
      }
      leave();
    },
    /** A profile link in this feed was followed: keep the page for the way back. */
    keep: (bookmark: FeedBookmark) => park.request(bookmark),
    /** Session change: a kept page never outlives the account that saw it. */
    discard(): void {
      tabBookmark = null;
      park.release();
    },
    bookmark,
    refresh,
    /** The active Feed/Discover tab again: the pill when deep in the feed, else a reload. */
    tabAgain: () => (feedRefresh?.tabAgain() ? Promise.resolve() : run(reload)),
    canActivate: () => !busy && !hasOpenFeedReply(mounted),
  };
}
