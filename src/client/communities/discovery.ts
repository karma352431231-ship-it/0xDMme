import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { mountPublicSearchToolbar } from '../public-search/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import { appendOwnProfileShortcut } from '../profile-shortcut/index.ts';
import { postSharing } from './post-sharing.ts';
import {
  feedFilter,
  discoveryPeriod,
  feedPage,
  exploreFilter,
  explorePage,
} from '../../shared/community-discovery/index.ts';
import type {
  DiscoveryPeriod,
  FeedOrder,
  FeedScope,
  ExploreFilter,
} from '../../shared/community-discovery/index.ts';
import type { Communities } from './controller.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { feedFollowControl } from './feed-follow.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { communityRead } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import { postPreview } from './post-preview.ts';
import { postManagementMenu } from './post-menu.ts';
import { postState } from '../../shared/community-posts/index.ts';
import { showPostExternalMedia } from './post-external-media.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { postViews } from './post-views.ts';
import { DiscoverySnapshot } from './discovery-page.ts';
import { appendReplyContext, entryCard } from './activity-entry.ts';
import { feedPosition, restoreFeedPosition } from './feed-return.ts';
import type { FeedBookmark } from './feed-return.ts';
import {
  communityAvatar,
  communityIcon,
  iconLabel,
  postHeader,
  postComments,
  postTagLink,
} from './presentation.ts';
import {
  showPublicAvatar,
  showPublicPostMedia,
} from '../public-media/index.ts';
import {
  discoveryMenu,
  feedOrders,
  discoveryPeriods,
  preferenceControls,
  postVoting,
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
  let openComposer: () => void = () => undefined;
  let followChanged: () => Promise<void> = () => Promise.resolve();
  let view = 'feed',
    order: FeedOrder = 'mixed',
    period: DiscoveryPeriod = 'all',
    exploreOrder: ExploreFilter['order'] = 'trending',
    after: string | null = null,
    rankOffset = 0;
  const seen = new Set<string>();
  const snapshot = new DiscoverySnapshot();
  let displayedAfter: string | null = null;
  let displayedRank = 0;
  const mediaCleanup = new Set<() => void>();
  function clearMedia(): void {
    for (const cleanup of mediaCleanup) cleanup();
    mediaCleanup.clear();
  }
  function disabled(): void {
    mounted
      ?.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select')
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
        link(scopes, label, `#comunidades?view=${key}`);
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
              ]
            : discoveryPeriods,
      },
      (value) => {
        period =
          view === 'explore'
            ? exploreFilter({ order: exploreOrder, period: value }).period
            : discoveryPeriod(value);
        void run(reload);
      },
    );
    mountPublicSearchToolbar(toolbar, abort.signal);
    postShortcut(toolbar);
  }
  /** Posting starts from the community the person chooses. */
  function postShortcut(toolbar: HTMLElement): void {
    if (!signedIn || (view !== 'feed' && view !== 'following')) return;
    button(toolbar, t('Postar'), () => {
      openComposer();
      return Promise.resolve();
    });
    const post = toolbar.lastElementChild as HTMLElement;
    post.className = 'community-post-cta';
    iconLabel(post, 'pencil');
    appendOwnProfileShortcut(toolbar);
  }
  function query(): string {
    const data = new URLSearchParams({
      order: view === 'explore' ? exploreOrder : order,
      period,
    });
    if (after) data.set('after', after);
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
  async function read(): Promise<unknown> {
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
    if (view === 'explore')
      return communityRead(`/api/communities/explore?${query()}`, signal);
    if (signedIn)
      return controller.request('discovery-feed', {
        filter: {
          scope: scope(),
          order,
          period,
          community: null,
          tag: null,
        },
        after,
      });
    return communityRead(`/api/communities/feed?${query()}`, signal);
  }
  async function load(): Promise<void> {
    const old = generation,
      requestedAfter = after,
      requestedRank = rankOffset,
      requestedQuery = query(),
      result = await read();
    if (old !== generation || !list || !paging) return;
    const { page, changed } = snapshot.read(view, requestedQuery, result);
    after = page.value.next;
    displayedAfter = requestedAfter;
    displayedRank = requestedRank;
    if (feedback) feedback.textContent = '';
    if (!changed) {
      if (page.kind === 'explore') rankOffset += page.value.items.length;
      return;
    }
    clearMedia();
    list.replaceChildren();
    paging.replaceChildren();
    seen.clear();
    if (page.kind === 'explore') renderExplore(page.value);
    else renderFeed(page.value, old);
    if (!list.children.length)
      list.append(
        el(
          'p',
          t('Nenhum conteúdo nesta página com estes filtros.'),
          'community-empty',
        ),
      );
    if (after) button(paging, t('Próxima página'), () => run(load));
    button(paging, t('Recarregar do início'), () => run(reload));
  }
  function renderExplore(page: ReturnType<typeof explorePage>): void {
    if (!list) return;
    for (const item of page.items) {
      const row = el('li', '', 'ranking-row'),
        open = el('a', '', 'ranking-link'),
        avatar = communityAvatar(item.community.name),
        copy = el('span', '', 'ranking-copy');
      open.href = `#comunidades?id=${item.community.id}`;
      copy.append(
        el('strong', item.community.name),
        el('small', item.community.description),
      );
      open.append(
        el('span', String(++rankOffset), 'ranking-position'),
        avatar,
        copy,
        ...rankingStats(item),
      );
      row.append(open);
      list.append(row);
      if (item.community.avatar)
        mediaCleanup.add(
          showPublicAvatar(avatar, {
            kind: 'community-photo',
            target: item.community.id,
            reference: item.community.avatar,
            signal: abort.signal,
          }),
        );
    }
  }
  /** Same figures as before, laid out as columns; growth is never shown as comparable while history forms. */
  function rankingStats(
    item: ReturnType<typeof explorePage>['items'][number],
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
    if (exploreOrder === 'size') return [followers];
    const growth = stat(
      `+${number(item.upvotes)}`,
      item.historyComplete ? t('upvotes em alta') : t('em formação'),
      'ranking-growth',
    );
    if (!item.historyComplete)
      growth.title = t(
        'Histórico em formação; crescimento ainda não comparável.',
      );
    return [followers, stat(number(item.participants), 'ativos'), growth];
  }
  function renderFeed(page: ReturnType<typeof feedPage>, old: number): void {
    for (const entry of page.items) {
      const post = entry.post;
      if (seen.has(post.id)) continue;
      // Keep only a bounded recent window; pagination does not accumulate DOM/content.
      seen.add(post.id);
      if (seen.size > 240) seen.delete(seen.values().next().value!);
      const row = entryCard(post);
      const avatar = postHeader(row, post, entry.community);
      appendReplyContext(row, entry, abort.signal, privacy);
      followControl(row, entry, old);
      if (entry.community.avatar)
        mediaCleanup.add(
          showPublicAvatar(avatar, {
            kind: 'community-photo',
            target: entry.community.id,
            reference: entry.community.avatar,
            signal: abort.signal,
          }),
        );
      postContent(row, post);
      const toolbar = el('div', '', 'post-actions');
      row.append(toolbar);
      const actions = {
        controller,
        run,
        valid: () => old === generation,
        changed: reload,
      };
      postVoting(
        toolbar,
        post,
        signedIn ? { ...actions, position: entry.viewerVote } : null,
      );
      postComments(toolbar, post);
      postSharing(
        toolbar,
        post,
        signedIn ? { ...actions, shared: entry.viewerShared } : null,
      );
      mediaCleanup.add(postViews(row, post, toolbar));
      if (signedIn) {
        preferenceControls(toolbar, post, {
          ...actions,
          saved: entry.viewerSaved,
          options: (host) =>
            postManagementMenu(host, post, {
              run,
              request: (op, data) => controller.request(op, data),
              media: {
                community: post.community,
                request: (op, data) => controller.request(op, data),
                valid: actions.valid,
                signal: abort.signal,
              },
              mutate: (op, data) =>
                run(async () => {
                  const payload =
                    typeof data === 'function' ? await data() : data;
                  if (!actions.valid()) return;
                  postState(await controller.request(op, payload));
                  if (actions.valid()) await reload();
                }),
            }),
        });
      }
      list?.append(row);
    }
  }
  function followControl(
    row: HTMLElement,
    entry: ReturnType<typeof feedPage>['items'][number],
    old: number,
  ): void {
    const header = row.querySelector<HTMLElement>('.community-post-header');
    if (!header || !signedIn || entry.ownCommunity) return;
    feedFollowControl(
      header,
      { community: entry.community, author: entry.post.author },
      {
        controller,
        profiles,
        run,
        valid: () => old === generation,
        changed: () => followChanged(),
        signal: abort.signal,
        chooseOnMobile: view === 'feed' || view === 'following',
      },
    );
  }
  function postContent(row: HTMLElement, post: CommunityPost): void {
    if (post.status === 'visible') {
      row.append(postPreview(post.text, gifUrls(post.text)));
      mediaCleanup.add(
        showPostExternalMedia(row, post.text, {
          privacy,
          signal: abort.signal,
        }),
      );
      if (post.media?.length)
        mediaCleanup.add(showPublicPostMedia(row, post.media, abort.signal));
      else if (!post.text)
        row.append(el('p', t('Mídia aguardando liberação.')));
      postTagLink(row, post);
    } else
      row.append(
        el(
          'p',
          post.status === 'deleted'
            ? t('Conteúdo excluído pelo autor.')
            : t('Conteúdo ocultado pela moderação.'),
        ),
      );
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
    if (!mounted) return;
    await run(async () => {
      after = displayedAfter;
      rankOffset = displayedRank;
      await load();
    });
  }
  function leave(): void {
    clearMedia();
    generation++;
    abort.abort();
    mounted = null;
    list = null;
    paging = null;
    feedback = null;
    seen.clear();
    snapshot.clear();
    displayedAfter = null;
    displayedRank = 0;
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
    order = bookmark?.order ?? defaults[view]!;
    period = bookmark?.period ?? (view === 'explore' ? 'day' : 'all');
    exploreOrder = 'trending';
  }
  return {
    mount(
      container: HTMLElement,
      options: {
        view: string;
        signedIn: boolean;
        followChanged?: () => Promise<void>;
        openComposer?: () => void;
        bookmark?: FeedBookmark | null;
      },
    ): void {
      leave();
      mounted = container;
      abort = new AbortController();
      view = options.view;
      signedIn = options.signedIn;
      openComposer = options.openComposer ?? (() => undefined);
      followChanged = options.followChanged ?? (() => Promise.resolve());
      initialFilters(options.bookmark);
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
        link(mounted, t('Entre pelo Perfil para acessar sua lista'), '#perfil');
        return;
      }
      const label = el(
        'p',
        t('Leitura pública · participação com conta'),
        'community-public-label',
      );
      label.prepend(communityIcon('globe'));
      text.append(label);
      if (view === 'following')
        link(
          mounted,
          t('Ver comunidades seguidas'),
          '#comunidades?view=communities',
        );
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
      startPage(options.bookmark);
    },
    leave,
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
    reset: () => run(reload),
    canActivate: () => !busy,
  };
}
