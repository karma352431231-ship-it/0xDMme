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
import { communityState } from '../../shared/communities/index.ts';
import { communityRead } from './controller.ts';
import {
  communityButton as button,
  communityCard as card,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import { postText } from './post-text.ts';
import { showExternalVideos } from '../external-video/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { postViews } from './post-views.ts';
import { DiscoverySnapshot } from './discovery-page.ts';
import { appendReplyContext } from './activity-entry.ts';
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
          error instanceof Error ? error.message : 'Feed indisponível.';
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
      scopes.setAttribute('aria-label', 'Escolher feed');
      for (const [key, label] of [
        ['feed', 'Descobrir'],
        ['following', 'Seguindo'],
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
        'Classificar comunidades',
        {
          value: exploreOrder,
          options: [
            ['trending', 'Trending'],
            ['size', 'Maiores'],
            ['new', 'Comunidades recém-criadas'],
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
        'Ordenar',
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
      'Período',
      {
        value: period,
        options:
          view === 'explore'
            ? [
                ['day', '24 horas'],
                ['week', '7 dias'],
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
    postShortcut(toolbar);
  }
  /** Posting starts from the community the person chooses. */
  function postShortcut(toolbar: HTMLElement): void {
    if (!signedIn || (view !== 'feed' && view !== 'following')) return;
    link(toolbar, 'Postar', '#comunidades?view=communities');
    const post = toolbar.lastElementChild as HTMLElement;
    post.className = 'community-post-cta';
    iconLabel(post, 'pencil');
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
          'Nenhum conteúdo nesta página com estes filtros.',
          'community-empty',
        ),
      );
    if (after) button(paging, 'Próxima página', () => run(load));
    button(paging, 'Recarregar do início', () => run(reload));
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
    const number = (value: number) => value.toLocaleString('pt-BR');
    const stat = (value: string, label: string, className = '') => {
      const node = el('span', '', `ranking-stat ${className}`.trim());
      node.append(el('strong', value), el('small', label));
      return node;
    };
    const followers = stat(
      number(item.community.followers),
      item.community.archived ? 'seguidores · arquivada' : 'seguidores',
    );
    if (exploreOrder === 'size') return [followers];
    const growth = stat(
      `+${number(item.upvotes)}`,
      item.historyComplete ? 'upvotes em alta' : 'em formação',
      'ranking-growth',
    );
    if (!item.historyComplete)
      growth.title = 'Histórico em formação; crescimento ainda não comparável.';
    return [followers, stat(number(item.participants), 'ativos'), growth];
  }
  function renderFeed(page: ReturnType<typeof feedPage>, old: number): void {
    for (const entry of page.items) {
      const post = entry.post;
      if (seen.has(post.id)) continue;
      // Keep only a bounded recent window; pagination does not accumulate DOM/content.
      seen.add(post.id);
      if (seen.size > 240) seen.delete(seen.values().next().value!);
      const row = card(post.parent ? 'Resposta' : post.title || 'Postagem');
      row.dataset['postId'] = post.id;
      row.classList.add('community-post');
      const avatar = postHeader(row, post, entry.community);
      appendReplyContext(row, entry);
      followControl(row, entry.community, old);
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
      postVoting(toolbar, post, signedIn ? actions : null);
      postComments(toolbar, post);
      mediaCleanup.add(postViews(row, post, toolbar));
      if (signedIn) {
        preferenceControls(toolbar, post, actions);
      }
      list?.append(row);
    }
  }
  function followControl(
    row: HTMLElement,
    community: { id: string; name: string },
    old: number,
  ): void {
    const header = row.querySelector<HTMLElement>('.community-post-header');
    if (!header || !signedIn) return;
    let following = false;
    const node = button(header, '+ Seguir', () =>
      run(async () => {
        const state = communityState(
          await controller.request('follow', {
            id: community.id,
            following: !following,
          }),
        );
        if (old !== generation) return;
        following = state.following;
        node.textContent = following ? 'Seguindo' : '+ Seguir';
        node.setAttribute('aria-pressed', String(following));
        node.setAttribute(
          'aria-label',
          `${following ? 'Deixar de seguir' : 'Seguir'} a comunidade ${community.name}`,
        );
        await followChanged();
      }),
    );
    node.className = 'community-post-follow';
    node.setAttribute('aria-label', `Seguir a comunidade ${community.name}`);
    // First click is idempotent even if already followed; never guess private state.
  }
  function postContent(row: HTMLElement, post: CommunityPost): void {
    if (post.status === 'visible') {
      row.append(postText(post.text));
      mediaCleanup.add(
        showExternalVideos(row, post.text, { privacy, signal: abort.signal }),
      );
      if (post.media?.length)
        mediaCleanup.add(showPublicPostMedia(row, post.media, abort.signal));
      else if (!post.text) row.append(el('p', 'Mídia aguardando liberação.'));
      postTagLink(row, post);
    } else
      row.append(
        el(
          'p',
          post.status === 'deleted'
            ? 'Conteúdo excluído pelo autor.'
            : 'Conteúdo ocultado pela moderação.',
        ),
      );
  }
  async function reload(): Promise<void> {
    after = null;
    rankOffset = 0;
    seen.clear();
    await load();
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
  return {
    mount(
      container: HTMLElement,
      options: {
        view: string;
        signedIn: boolean;
        followChanged?: () => Promise<void>;
      },
    ): void {
      leave();
      mounted = container;
      abort = new AbortController();
      view = options.view;
      signedIn = options.signedIn;
      followChanged = options.followChanged ?? (() => Promise.resolve());
      const initialOrders: Record<string, FeedOrder> = {
        feed: 'mixed',
        following: 'recent',
        explore: 'recent',
        saved: 'recent',
        hidden: 'recent',
      };
      order = initialOrders[view]!;
      period = view === 'explore' ? 'day' : 'all';
      exploreOrder = 'trending';
      const titles: Record<string, string> = {
        feed: 'Feed',
        following: 'Seguindo',
        explore: 'Ranking de comunidades',
        saved: 'Suas postagens salvas',
        hidden: 'Conteúdo oculto dos seus feeds',
      };
      const heading = el('header', '', 'community-heading'),
        text = el('div');
      text.append(el('h1', titles[view] ?? 'Feed'));
      heading.append(text);
      mounted.append(heading);
      if (!signedIn && view !== 'feed' && view !== 'explore') {
        link(mounted, 'Entre pelo Perfil para acessar sua lista', '#perfil');
        return;
      }
      const label = el(
        'p',
        'Leitura pública · participação com conta',
        'community-public-label',
      );
      label.prepend(communityIcon('globe'));
      text.append(label);
      if (view === 'following')
        link(
          mounted,
          'Ver comunidades seguidas',
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
      ready();
    },
    leave,
    refresh,
    canActivate: () => !busy,
  };
}
