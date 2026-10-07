import {
  feedFilter,
  feedPage,
  exploreFilter,
  explorePage,
} from '../../shared/community-discovery/index.ts';
import type {
  DiscoveryPeriod,
  FeedOrder,
  FeedScope,
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
import {
  communityAvatar,
  communityIcon,
  postHeader,
  postComments,
  postTagLink,
} from './presentation.ts';
import {
  showPublicAvatar,
  showPublicPostMedia,
} from '../public-media/index.ts';
import {
  discoverySelect,
  feedOrders,
  discoveryPeriods,
  preferenceControls,
  postVoting,
} from './discovery-controls.ts';

export function startCommunityDiscovery(controller: Communities) {
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
    order: FeedOrder = 'recent',
    period: DiscoveryPeriod = 'all',
    exploreOrder: 'size' | 'activity' = 'size',
    after: string | null = null;
  const seen = new Set<string>();
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
    const filterPanel = el('details', '', 'community-filters'),
      toolbar = el('div', '', 'post-toolbar community-feed-filters'),
      breakpoint = window.matchMedia('(min-width: 701px)');
    filterPanel.append(el('summary', 'Ordenar e filtrar'), toolbar);
    const adapt = () => {
      filterPanel.open = breakpoint.matches;
    };
    adapt();
    breakpoint.addEventListener('change', adapt, { signal: abort.signal });
    mounted.append(filterPanel);
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
    if (view === 'explore')
      discoverySelect(
        toolbar,
        'Classificar comunidades',
        {
          value: exploreOrder,
          options: [
            ['size', 'Maiores'],
            ['activity', 'Mais ativas'],
          ],
        },
        (value) => {
          exploreOrder = exploreFilter({ order: value, period }).order;
          void run(reload);
        },
      );
    else
      discoverySelect(
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
    discoverySelect(
      toolbar,
      view === 'explore' ? 'Atividade' : 'Período',
      { value: period, options: discoveryPeriods },
      (value) => {
        period = exploreFilter({ order: exploreOrder, period: value }).period;
        void run(reload);
      },
    );
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
      result = await read();
    if (old !== generation || !list || !paging) return;
    clearMedia();
    list.replaceChildren();
    paging.replaceChildren();
    if (view === 'explore') renderExplore(result);
    else renderFeed(result, old);
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
  function renderExplore(result: unknown): void {
    if (!list) return;
    const page = explorePage(result);
    after = page.next;
    for (const { community, activity } of page.items) {
      const row = card(community.name);
      const avatar = communityAvatar(community.name);
      row.firstElementChild?.prepend(avatar);
      row.classList.add('community-explore-card');
      row.append(
        el(
          'p',
          `${community.followers} seguidores · ${activity} publicações e respostas no período${community.archived ? ' · Arquivada' : ''}`,
        ),
        el('p', community.description),
      );
      link(row, 'Abrir comunidade', `#comunidades?id=${community.id}`);
      list.append(row);
      if (community.avatar)
        mediaCleanup.add(
          showPublicAvatar(avatar, {
            kind: 'community-photo',
            target: community.id,
            reference: community.avatar,
            signal: abort.signal,
          }),
        );
    }
  }
  function renderFeed(result: unknown, old: number): void {
    const page = feedPage(result);
    after = page.next;
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
      postTagLink(row, post);
      if (post.media?.length)
        mediaCleanup.add(showPublicPostMedia(row, post.media, abort.signal));
      else if (!post.text) row.append(el('p', 'Mídia aguardando liberação.'));
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
    seen.clear();
    await load();
  }
  function ready(): void {
    void run(reload);
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
      order = 'recent';
      period = view === 'explore' ? 'week' : 'all';
      exploreOrder = 'size';
      const titles: Record<string, string> = {
        feed: 'Feed geral',
        following: 'Feed das comunidades seguidas',
        explore: 'Descubra comunidades',
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
      text.append(
        el(
          'p',
          view === 'explore'
            ? 'Encontre assuntos e comunidades que você quer acompanhar.'
            : view === 'feed'
              ? 'Posts de várias comunidades, inclusive das que você não segue.'
              : 'Acompanhe e organize suas postagens.',
          'community-subtitle',
        ),
      );
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
      list = el('section', '', 'community-feed');
      paging = el('div', '', 'post-toolbar');
      mounted.append(feedback, list, paging);
      ready();
    },
    leave,
    canActivate: () => !busy,
  };
}
