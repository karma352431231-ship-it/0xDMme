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
import { communityRead } from './controller.ts';
import {
  communityButton as button,
  communityCard as card,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import { postText } from './post-text.ts';
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
  let view = 'feed',
    order: FeedOrder = 'recent',
    period: DiscoveryPeriod = 'all',
    exploreOrder: 'size' | 'activity' = 'size',
    after: string | null = null;
  const seen = new Set<string>();
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
    const toolbar = el('div', '', 'post-toolbar');
    mounted.append(toolbar);
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
        'Ordenar postagens',
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
      view === 'explore' ? 'Período de atividade' : 'Publicadas no período',
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
    list.replaceChildren();
    paging.replaceChildren();
    if (view === 'explore') {
      const page = explorePage(result);
      after = page.next;
      for (const { community, activity } of page.items) {
        const row = card(community.name);
        row.append(
          el(
            'p',
            `${community.followers} seguidores · ${activity} publicações e respostas no período${community.archived ? ' · Arquivada' : ''}`,
          ),
          el('p', community.description),
        );
        link(row, 'Abrir comunidade', `#comunidades?id=${community.id}`);
        list.append(row);
      }
    } else renderFeed(result, old);
    if (!list.children.length)
      list.append(el('p', 'Nenhum conteúdo nesta página com estes filtros.'));
    if (after) button(paging, 'Próxima página', () => run(load));
    button(paging, 'Recarregar do início', () => run(reload));
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
      link(row, entry.community.name, `#comunidades?id=${post.community}`);
      postContent(row, post);
      link(
        row,
        'Abrir postagem e respostas',
        `#comunidades?id=${post.community}&post=${post.id}`,
      );
      if (signedIn) {
        const actions = {
          controller,
          run,
          valid: () => old === generation,
          changed: reload,
        };
        preferenceControls(row, post, actions);
        postVoting(row, post, actions);
      }
      list?.append(row);
    }
  }
  function postContent(row: HTMLElement, post: CommunityPost): void {
    if (post.status === 'visible') row.append(postText(post.text));
    else
      row.append(
        el(
          'p',
          post.status === 'deleted'
            ? 'Conteúdo excluído pelo autor.'
            : 'Conteúdo ocultado pela moderação.',
        ),
      );
    if (post.author)
      link(
        row,
        `@${post.author.handle}`,
        `#publico?handle=${post.author.handle}`,
      );
    row.append(
      el(
        'p',
        `${new Date(post.createdAt).toLocaleString('pt-BR')} · Placar: ${post.score} · ${post.replies} respostas diretas`,
      ),
    );
    if (post.tag)
      link(
        row,
        post.tag.label,
        `#comunidades?id=${post.community}&tag=${post.tag.id}`,
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
      options: { view: string; signedIn: boolean },
    ): void {
      leave();
      mounted = container;
      abort = new AbortController();
      view = options.view;
      signedIn = options.signedIn;
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
      mounted.append(el('h2', titles[view] ?? 'Feed'));
      if (!signedIn && view !== 'feed' && view !== 'explore') {
        link(mounted, 'Entre pelo Perfil para acessar sua lista', '#perfil');
        return;
      }
      mounted.append(
        el(
          'p',
          view === 'explore'
            ? 'Maiores: número de seguidores. Mais ativas: publicações e respostas públicas visíveis no período. Seguir é opcional para participar.'
            : 'Você pode participar sem seguir. Mais comentados usa respostas diretas; placares são atualizados ao vivo.',
        ),
      );
      if (view === 'following')
        link(
          mounted,
          'Ver comunidades seguidas',
          '#comunidades?view=communities',
        );
      filters();
      feedback = el('p');
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
