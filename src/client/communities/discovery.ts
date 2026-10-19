import { rankingScopes, mountDiscoveryRanking } from './account-ranking.ts';
import { renderFeedCard } from './feed-card.ts';
import { renderCommunityRanking } from './ranking-view.ts';
import { rankingTopicFilter } from './classification.ts';
import type { CommunityTopic } from '../../shared/community-classification/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { mountPublicSearchToolbar } from '../public-search/index.ts';
import { hasOpenFeedReply } from './feed-reply.ts';
import { appendOwnProfileShortcut } from '../profile-shortcut/index.ts';
import {
  feedFilter,
  discoveryPeriod,
  feedPage,
  exploreFilter,
} from '../../shared/community-discovery/index.ts';
import type {
  DiscoveryPeriod,
  FeedOrder,
  FeedScope,
  ExploreFilter,
} from '../../shared/community-discovery/index.ts';
import type { Communities } from './controller.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { communityRead } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { DiscoverySnapshot } from './discovery-page.ts';
import {
  FeedPark,
  feedPosition,
  rememberFeedChoice,
  rememberedFeedChoice,
  restoreFeedPosition,
} from './feed-return.ts';
import { FeedRefresh } from './feed-refresh.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { FeedBookmark } from './feed-return.ts';
import { communityIcon } from './presentation.ts';
import {
  discoveryMenu,
  feedOrders,
  discoveryPeriods,
} from './discovery-controls.ts';

export function startCommunityDiscovery(
  controller: Communities,
  privacy: ExternalMediaConsent,
  profiles: FeedProfileFollows,
) {
  let mounted: HTMLElement | null = null,
    list: HTMLElement | null = null,
    paging: HTMLElement | null = null,
    feedback: HTMLElement | null = null;
  let generation = 0,
    busy = false,
    signedIn = false,
    abort = new AbortController();
  let followChanged: () => Promise<void> = () => Promise.resolve();
  let view = 'feed',
    order: FeedOrder = 'mixed',
    period: DiscoveryPeriod = 'all',
    exploreOrder: ExploreFilter['order'] = 'trending',
    after: string | null = null,
    rankOffset = 0;
  let selectedTopics: CommunityTopic[] = [];
  const seen = new Set<string>();
  const snapshot = new DiscoverySnapshot();
  let displayedAfter: string | null = null;
  let displayedRank = 0;
  // Newest post time on the first feed page shown; the refresh pill looks for later posts.
  let newest = 0;
  let feedRefresh: FeedRefresh | null = null;
  let rankingScope: ReturnType<typeof rankingScopes> | null = null;
  // The pill has its own lifetime: a kept page gets a new one on its return.
  let refreshAbort = new AbortController();
  // Nodes the communities page placed before this feed; the rest belong to it.
  let foreign = new Set<Node>();
  const park = new FeedPark();
  const mediaCleanup = new Set<() => void>();
  function clearMedia(): void {
    for (const cleanup of mediaCleanup) cleanup();
    mediaCleanup.clear();
  }
  function disabled(): void {
    mounted
      ?.querySelectorAll<
        HTMLButtonElement | HTMLSelectElement | HTMLInputElement
      >('button,select,input')
      .forEach((node) => {
        node.disabled = busy;
      });
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    const old = generation;
    busy = true;
    disabled();
    try {
      await work();
    } catch (error: unknown) {
      snapshot.clear();
      if (old === generation && feedback)
        feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Feed indisponível.');
    } finally {
      busy = false;
      disabled();
      if (old !== generation && mounted) ready();
    }
  }
  function filters(): void {
    if (!mounted) return;
    const toolbar = el('div', '', 'post-toolbar community-feed-filters');
    toolbar.classList.toggle('community-ranking-filters', view === 'explore');
    mounted.append(toolbar);
    if (view === 'feed' || view === 'following') {
      const scopes = el('nav', '', 'community-feed-scopes');
      scopes.setAttribute('aria-label', t('Escolher feed'));
      for (const [key, label] of [
        ['feed', t('Descobrir')],
        ['following', t('Seguindo')],
      ] as const) {
        link(scopes, label, `#communities?view=${key}`);
        if (view === key)
          scopes.lastElementChild?.setAttribute('aria-current', 'page');
      }
      toolbar.append(scopes);
    }
    const periodPanel = el('div', '', 'community-ranking-period');
    if (view === 'explore')
      discoveryMenu(
        toolbar,
        t('Classificar comunidades'),
        {
          value: exploreOrder,
          options: [
            ['trending', t('Trending')],
            ['size', t('Maiores')],
            ['new', t('Comunidades recém-criadas')],
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
        t('Ordenar'),
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
      t('Período'),
      {
        value: period,
        options:
          view === 'explore'
            ? [
                ['day', t('24 horas')],
                ['week', t('7 dias')],
                ['month', t('30 dias')],
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
  function query(cursor = after): string {
    const data = new URLSearchParams({
      order: view === 'explore' ? exploreOrder : order,
      period,
    });
    if (view === 'explore' && selectedTopics.length)
      data.set('topics', selectedTopics.join(','));
    if (cursor) data.set('after', cursor);
    return data.toString();
  }
  function scope(): FeedScope {
    return view === 'following'
      ? 'following'
      : view === 'saved'
        ? 'saved'
        : view === 'hidden'
          ? 'hidden'
          : 'all';
  }
  async function read(cursor = after): Promise<unknown> {
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
    if (view === 'explore')
      return communityRead(`/api/communities/explore?${query(cursor)}`, signal);
    if (signedIn)
      return controller.request('discovery-feed', {
        filter: {
          scope: scope(),
          order,
          period,
          community: null,
          tag: null,
        },
        after: cursor,
      });
    return communityRead(`/api/communities/feed?${query(cursor)}`, signal);
  }
  /** Authors of first-page posts newer than the newest one already shown. */
  async function peekNewAuthors(signal: AbortSignal): Promise<PublicProfile[]> {
    if (!newest) return [];
    const page = feedPage(await read(null));
    if (signal.aborted) return [];
    const authors = new Map<string, PublicProfile>();
    for (const { post } of page.items)
      if (post.author && Date.parse(post.createdAt) > newest)
        authors.set(post.author.id, post.author);
    return [...authors.values()];
  }
  function rememberNewest(page: ReturnType<typeof feedPage>): void {
    newest = Math.max(
      0,
      ...page.items.map(({ post }) => Date.parse(post.createdAt) || 0),
    );
  }
  /** True when the page on screen was redrawn. */
  async function load(): Promise<boolean> {
    const old = generation,
      requestedAfter = after,
      requestedRank = rankOffset,
      requestedQuery = query(),
      result = await read();
    if (old !== generation || !list || !paging) return false;
    const { page, changed } = snapshot.read(view, requestedQuery, result);
    after = page.value.next;
    displayedAfter = requestedAfter;
    displayedRank = requestedRank;
    if (feedback) feedback.textContent = '';
    if (!changed) {
      if (page.kind === 'explore') rankOffset += page.value.items.length;
      return false;
    }
    clearMedia();
    list.replaceChildren();
    paging.replaceChildren();
    seen.clear();
    renderPage(page, old, requestedAfter === null);
    if (!list.children.length)
      list.append(
        el(
          'p',
          t('Nenhum conteúdo nesta página com estes filtros.'),
          'community-empty',
        ),
      );
    if (after)
      button(paging, t('Próxima página'), () =>
        run(async () => {
          await load();
        }),
      );
    return true;
  }
  function renderPage(
    page: ReturnType<DiscoverySnapshot['read']>['page'],
    old: number,
    first: boolean,
  ): void {
    if (page.kind === 'explore') {
      if (list)
        rankOffset = renderCommunityRanking(list, page.value, {
          order: exploreOrder,
          offset: rankOffset,
          signal: abort.signal,
          addCleanup: (cleanup) => {
            mediaCleanup.add(cleanup);
          },
        });
      return;
    }
    renderFeed(page.value, old);
    if (first) rememberNewest(page.value);
  }
  function renderFeed(page: ReturnType<typeof feedPage>, old: number): void {
    for (const entry of page.items) {
      const post = entry.post;
      if (seen.has(post.id)) continue;
      // Keep only a bounded recent window; pagination does not accumulate DOM/content.
      seen.add(post.id);
      if (seen.size > 240) seen.delete(seen.values().next().value!);
      const row = renderFeedCard(entry, {
        controller,
        profiles,
        privacy,
        signal: abort.signal,
        signedIn,
        chooseOnMobile: view === 'feed' || view === 'following',
        run,
        valid: () => old === generation,
        changed: reload,
        followChanged: () => followChanged(),
        addCleanup: (cleanup) => {
          mediaCleanup.add(cleanup);
        },
      });
      list?.append(row);
    }
  }
  async function reload(): Promise<void> {
    if (mounted) feedScrollerReset();
    after = null;
    rankOffset = 0;
    seen.clear();
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
      after = displayedAfter;
      rankOffset = displayedRank;
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
        restoreFeedPosition(container, saved, abort.signal);
    });
    void run(async () => {
      after = displayedAfter;
      rankOffset = displayedRank;
      if ((await load()) && mounted)
        restoreFeedPosition(mounted, saved, abort.signal);
    });
  }
  function teardown(): void {
    clearMedia();
    generation++;
    abort.abort();
    refreshAbort.abort();
    mounted = null;
    list = null;
    paging = null;
    feedback = null;
    seen.clear();
    snapshot.clear();
    displayedAfter = null;
    displayedRank = 0;
    newest = 0;
    feedRefresh = null;
  }
  function startPage(bookmark?: FeedBookmark | null): void {
    if (!bookmark) {
      ready();
      return;
    }
    void run(async () => {
      after = bookmark.after;
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
  return {
    mount(
      container: HTMLElement,
      options: {
        view: string;
        signedIn: boolean;
        followChanged?: () => Promise<void>;
        bookmark?: FeedBookmark | null;
      },
    ): void {
      followChanged = options.followChanged ?? (() => Promise.resolve());
      foreign = new Set(container.childNodes);
      const kept = park.resume(
        container,
        options.bookmark ?? null,
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
      const ranking = mountDiscoveryRanking(container, view, abort.signal);
      rankingScope = ranking.scope;
      mounted = ranking.element;
      const titles: Record<string, string> = {
        feed: t('Feed'),
        following: t('Seguindo'),
        explore: t('Ranking de comunidades'),
        saved: t('Suas postagens salvas'),
        hidden: t('Conteúdo oculto dos seus feeds'),
      };
      const heading = el('header', '', 'community-heading'),
        text = el('div');
      text.append(el('h1', titles[view] ?? t('Feed')));
      heading.append(text);
      mounted.append(heading);
      if (!signedIn && view !== 'feed' && view !== 'explore') {
        link(
          mounted,
          t('Entre pelo Perfil para acessar sua lista'),
          '#settings',
        );
        return;
      }
      const label = el(
        'p',
        t('Leitura pública · participação com conta'),
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
      startRefreshPill();
      startPage(options.bookmark);
    },
    leave,
    /** A profile link in this feed was followed: keep the page for the way back. */
    keep: (bookmark: FeedBookmark) => park.request(bookmark),
    /** Session change: a kept page never outlives the account that saw it. */
    discard: () => park.release(),
    bookmark(): FeedBookmark | null {
      if (!mounted || !['feed', 'following'].includes(view)) return null;
      return {
        view,
        order,
        period,
        after: displayedAfter,
        ...feedPosition(mounted),
      };
    },
    refresh,
    /** The active Feed/Discover tab again: the pill when deep in the feed, else a reload. */
    tabAgain: () => (feedRefresh?.tabAgain() ? Promise.resolve() : run(reload)),
    canActivate: () => !busy && !hasOpenFeedReply(mounted),
  };
}
