import { restrictedMedia } from '../community-media/index.ts';
import { postViews } from './post-views.ts';
import {
  showPublicPostMedia,
  showPublicAvatar,
} from '../public-media/index.ts';
import {
  iconLabel,
  postHeader,
  postComments,
  postTagLink,
} from './presentation.ts';
import { emptyCommunity } from './community-empty.ts';
import { keys, object } from '../../shared/account/index.ts';
import {
  communityCursor,
  communityState,
} from '../../shared/communities/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import {
  communityPost,
  postPage,
  postState,
  privatePostPage,
  tagPage,
} from '../../shared/community-posts/index.ts';
import type {
  CommunityPost,
  PostState,
  PostTag,
  TagPage,
} from '../../shared/community-posts/index.ts';
import { Communities, communityRead } from './controller.ts';
import {
  communityButton as button,
  communityCard as card,
  communityElement as el,
  communityField as field,
  communityLink as link,
} from './elements.ts';
import { postActions, postForm, postTagSelect } from './post-forms.ts';
import { postText } from './post-text.ts';
import { postReply } from './post-reply.ts';
import { showExternalVideos } from '../external-video/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  preferenceControls,
  postVoting,
  discoveryMenu,
  feedOrders,
  discoveryPeriods,
} from './discovery-controls.ts';
import {
  feedPage,
  feedFilter,
} from '../../shared/community-discovery/index.ts';
import type {
  FeedOrder,
  DiscoveryPeriod,
} from '../../shared/community-discovery/index.ts';
export function startCommunityPosts(
  controller: Communities,
  privacy: ExternalMediaConsent,
) {
  let mounted: HTMLElement | null = null,
    management: HTMLElement | null = null,
    community = '',
    identity: { id: string; name: string; avatar: string | null } | null = null,
    own: CommunityState | null = null,
    selected: string | null = null;
  let generation = 0,
    busy = false,
    abort = new AbortController(),
    tags: TagPage = { items: [], next: null },
    after: string | null = null,
    tag: string | null = null,
    scope = 'public';
  const mediaCleanup = new Map<() => void, HTMLElement>();
  function clearMedia(container?: HTMLElement): void {
    for (const [cleanup, node] of mediaCleanup) {
      if (container && !container.contains(node)) continue;
      cleanup();
      mediaCleanup.delete(cleanup);
    }
  }
  function mediaAccess() {
    const old = generation;
    return {
      community,
      request: (operation: string, payload: Record<string, unknown>) =>
        controller.request(operation, payload),
      valid: () => old === generation,
      signal: abort.signal,
    };
  }
  let order: FeedOrder = 'recent',
    period: DiscoveryPeriod = 'all';
  let feedback: HTMLElement | null = null,
    list: HTMLElement | null = null,
    controls: HTMLElement | null = null;
  function disabled(): void {
    for (const node of [mounted, management])
      node
        ?.querySelectorAll<
          | HTMLButtonElement
          | HTMLSelectElement
          | HTMLInputElement
          | HTMLTextAreaElement
        >('button,select,input,textarea')
        .forEach((item) => {
          item.disabled = busy;
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
          error instanceof Error ? error.message : 'Posts indisponíveis.';
    } finally {
      busy = false;
      disabled();
      if (old !== generation && mounted) ready();
    }
  }
  const signal = () =>
    AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
  function actions() {
    return {
      run,
      request: (op: string, data: Record<string, unknown>) =>
        controller.request(op, data),
      mutate,
      media: mediaAccess(),
    };
  }
  function tagSource() {
    return {
      page: tags,
      run,
      load: async (cursor: string | null) => {
        const old = generation,
          query = cursor ? `?after=${cursor}` : '',
          page = tagPage(
            await communityRead(
              `/api/communities/${community}/tags${query}`,
              signal(),
            ),
          );
        if (old !== generation) throw new Error('A comunidade mudou.');
        return page;
      },
    };
  }
  async function mutate(
    op: string,
    data: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
  ): Promise<void> {
    await run(async () => {
      const old = generation,
        result = await controller.request(
          op,
          typeof data === 'function' ? await data() : data,
        );
      if (old !== generation) return;
      if (op === 'report') communityState(result);
      else postState(result);
      after = null;
      await load();
      if (feedback) feedback.textContent = 'Alteração salva.';
    });
  }
  function row(
    value: CommunityPost,
    privateState: PostState | null = null,
    container: HTMLElement | null = list,
    depth = 0,
  ): void {
    if (!container) return;
    const node = postCard(value);
    node.dataset['postId'] = value.id;
    container.append(node);
    rowHeader(node, value);
    rowContent(node, value, privateState);
    rowMeta(node, value, depth);
    const toolbar = el('div', '', 'post-actions');
    node.append(toolbar);
    voting(toolbar, value);
    if (selected) replyToggle(toolbar, value);
    else postComments(toolbar, value);
    mediaCleanup.set(postViews(node, value, toolbar), node);
    branch(node, value, depth);
    if (!own) return;
    const old = generation;
    preferenceControls(toolbar, value, {
      controller,
      run,
      valid: () => old === generation,
      changed: async () => {
        after = null;
        await load();
      },
    });
    const options = el('div', '', 'post-options');
    toolbar.after(options);
    button(toolbar, 'Opções', () =>
      run(async () => {
        const old = generation,
          state = postState(
            await controller.request('post-state', {
              id: community,
              post: value.id,
            }),
          );
        if (old !== generation) return;
        clearMedia(options);
        options.replaceChildren();
        restrictedContent(options, state);
        if (state.own && state.content?.media?.length) {
          const disposeMedia = restrictedMedia(
            options,
            state.content.media,
            mediaAccess(),
          );
          mediaCleanup.set(disposeMedia, options);
        }
        postActions(options, state, tagSource(), actions());
      }),
    );
    toolbar.lastElementChild?.setAttribute('aria-label', 'Opções da postagem');
  }
  /** Author first, with their public photo when they have one. */
  function rowHeader(node: HTMLElement, value: CommunityPost): void {
    if (!identity) return;
    const avatar = postHeader(node, value, identity, 'community');
    if (!value.author?.avatar) return;
    mediaCleanup.set(
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: value.author.id,
        reference: value.author.avatar,
        signal: abort.signal,
      }),
      node,
    );
  }
  /**
   * Replies have no title of their own: their text is the content. The opened
   * post is the focus of the page; replies under it read as a thread.
   */
  function postCard(value: CommunityPost): HTMLElement {
    const node = value.parent
      ? el('article', '', 'card community-card')
      : card(value.title || 'Postagem');
    if (value.parent && value.title) node.append(el('h2', value.title));
    node.classList.add('community-post');
    if (value.id === selected) node.classList.add('community-post-focus');
    else if (value.parent) node.classList.add('community-reply');
    return node;
  }
  function branch(
    container: HTMLElement,
    parent: CommunityPost,
    depth: number,
  ): void {
    // Bound inline rendering; deeper content is available through the subtree link.
    if (!selected || parent.id === selected || !parent.replies || depth >= 3)
      return;
    const children = el('section', '', 'community-reply-branch');
    let cursor: string | null = null;
    button(
      container,
      parent.replies === 1
        ? 'Ver 1 resposta'
        : `Ver ${parent.replies} respostas`,
      () =>
        run(async () => {
          const old = generation,
            page = postPage(
              await communityRead(
                `/api/communities/${community}/posts/${parent.id}/replies${cursor ? '?after=' + encodeURIComponent(cursor) : ''}`,
                signal(),
              ),
            );
          if (old !== generation) return;
          clearMedia(children);
          children.replaceChildren();
          for (const reply of page.items) row(reply, null, children, depth + 1);
          cursor = page.next;
          // The button stays only while another page of replies exists.
          more.textContent = 'Ver mais respostas';
          more.hidden = !page.next;
        }),
    );
    const more = container.lastElementChild as HTMLButtonElement;
    container.append(children);
  }
  function voting(node: HTMLElement, value: CommunityPost): void {
    if (own && !own.canPost && value.status === 'visible') {
      const score = el('span', String(value.score), 'post-score');
      score.title = 'Votação indisponível nesta comunidade.';
      node.append(score);
      return;
    }
    const old = generation;
    postVoting(
      node,
      value,
      own?.canPost
        ? {
            controller,
            run,
            valid: () => old === generation,
            changed: async () => {
              after = null;
              await load();
              if (feedback) feedback.textContent = 'Alteração salva.';
            },
          }
        : null,
    );
  }
  function replyToggle(toolbar: HTMLElement, parent: CommunityPost): void {
    const old = generation;
    postReply(
      toolbar,
      parent,
      own?.canPost
        ? {
            controller,
            run,
            valid: () => old === generation,
            canReply: () => Promise.resolve(own?.canPost ?? false),
            media: mediaAccess(),
            replied: async () => {
              after = null;
              await load();
              if (feedback) feedback.textContent = 'Resposta publicada.';
            },
          }
        : null,
    );
  }
  async function thread(value: CommunityPost): Promise<void> {
    const old = generation;
    const page = postPage(
      await communityRead(
        `/api/communities/${community}/posts/${value.id}/replies${after ? '?after=' + encodeURIComponent(after) : ''}`,
        signal(),
      ),
    );
    if (old !== generation || !list) return;
    const heading = el('h3', 'Respostas', 'community-thread-heading');
    if (value.replies)
      heading.append(el('span', String(value.replies), 'activity-count'));
    const replies = el('section', '', 'community-thread');
    replies.setAttribute('aria-label', 'Respostas a esta postagem');
    list.append(heading, replies);
    if (!page.items.length)
      replies.append(
        el('p', 'Ainda não há respostas.', 'community-thread-empty'),
      );
    for (const reply of page.items) row(reply, null, replies);
    after = page.next;
    paging();
  }
  function restrictedContent(node: HTMLElement, state: PostState): void {
    if (state.content && state.post.status === 'removed')
      node.append(
        el('p', 'Conteúdo restrito ao autor e gestores.'),
        el('h3', state.content.title),
        postText(state.content.text),
      );
  }
  function rowContent(
    node: HTMLElement,
    value: CommunityPost,
    state: PostState | null,
  ): void {
    if (value.status !== 'visible')
      node.append(
        el(
          'p',
          value.status === 'deleted'
            ? 'Postagem excluída pelo autor.'
            : 'Postagem ocultada pela moderação.',
        ),
      );
    if (state) restrictedContent(node, state);
    if (value.status !== 'visible') return;
    if (value.text) node.append(postText(value.text));
    mediaCleanup.set(
      showExternalVideos(node, value.text, { privacy, signal: abort.signal }),
      node,
    );
    if (value.media?.length)
      mediaCleanup.set(
        showPublicPostMedia(node, value.media, abort.signal),
        node,
      );
    else if (!value.text) node.append(el('p', 'Mídia aguardando liberação.'));
    postTagLink(node, value);
  }
  function rowMeta(
    node: HTMLElement,
    value: CommunityPost,
    depth: number,
  ): void {
    if (!value.parent) return;
    const nav = el('nav', '', 'post-context');
    nav.setAttribute('aria-label', 'Navegação da resposta');
    const post = (id: string | null) =>
      `#comunidades?id=${community}&post=${id}`;
    if (value.id === selected) {
      // An opened reply shows where it came from, above its own thread.
      link(nav, '↑ Resposta anterior', post(value.parent));
      if (value.root !== value.parent)
        link(nav, 'Postagem original', post(value.root));
      node.prepend(nav);
      return;
    }
    if (selected && !(depth >= 3 && value.replies)) return;
    link(
      nav,
      selected ? 'Continuar este fio →' : 'Abrir resposta e sua árvore',
      post(value.id),
    );
    node.append(nav);
  }
  async function load(): Promise<void> {
    clearMedia();
    const old = generation;
    if (selected) {
      const result = communityPost(
        await communityRead(
          `/api/communities/${community}/posts/${selected}`,
          signal(),
        ),
      );
      if (old !== generation || !list) return;
      list.replaceChildren();
      row(result);
      await thread(result);
      return;
    }
    if (scope !== 'public') await loadPrivate();
    else await loadPublic();
    if (old !== generation || !list) return;
    if (!list.children.length) empty(list);
    paging();
  }
  /** A filtered list says so; an empty community invites its first post. */
  function empty(host: HTMLElement): void {
    if (scope !== 'public' || tag || period !== 'all') {
      host.append(el('p', 'Nenhuma postagem nesta lista.'));
      return;
    }
    emptyCommunity(host, {
      community,
      compose: own?.canPost ? openComposer : null,
      signal: signal(),
    });
  }
  function openComposer(): void {
    const form = mounted?.querySelector<HTMLDetailsElement>('.post-composer');
    if (!form) return;
    form.open = true;
    form.scrollIntoView({ block: 'nearest' });
    form.querySelector<HTMLElement>('input, textarea')?.focus();
  }
  async function loadPrivate(): Promise<void> {
    const old = generation;
    const page = privatePostPage(
      await controller.request('post-page', {
        id: community,
        scope,
        after,
        tag,
      }),
    );
    if (old !== generation || !list) return;
    list.replaceChildren();
    for (const state of page.items) row(state.post, state);
    after = page.next;
  }
  async function loadPublic(): Promise<void> {
    const old = generation;
    const query = new URLSearchParams({ order, period, community });
    if (after) query.set('after', after);
    if (tag) query.set('tag', tag);
    const filter = { scope: 'all', order, period, community, tag };
    const page = feedPage(
      own
        ? await controller.request('discovery-feed', { filter, after })
        : await communityRead(
            `/api/communities/feed?${query.toString()}`,
            signal(),
          ),
    );
    if (old !== generation || !list) return;
    list.replaceChildren();
    for (const value of page.items) row(value.post);
    after = page.next;
  }
  function paging(): void {
    if (!controls) return;
    controls.replaceChildren();
    if (after)
      button(
        controls,
        selected ? 'Respostas anteriores' : 'Posts anteriores',
        () => run(load),
      );
    button(controls, 'Recarregar postagens', () =>
      run(async () => {
        after = null;
        await load();
      }),
    );
  }
  function composer(): void {
    // An opened post answers through its own reply box.
    if (!mounted || !own?.canPost || selected) return;
    // Closed, it reads like a field; opening it reveals the full form.
    const form = el('details', '', 'card community-card post-composer'),
      summary = el('summary'),
      icon = el('span', '', 'post-composer-icon');
    iconLabel(icon, 'pencil');
    summary.append(
      icon,
      el('span', 'Escreva algo para a comunidade…', 'post-composer-prompt'),
    );
    summary.setAttribute('aria-label', 'Criar postagem');
    form.append(summary);
    mounted.append(form);
    const content = postForm(
        form,
        { title: '', text: '', tag: null },
        tagSource(),
        mediaAccess(),
      ),
      id = crypto.randomUUID();
    button(form, 'Publicar postagem', () =>
      run(async () => {
        const old = generation;
        postState(
          await controller.request('post-create', {
            id: community,
            post: id,
            content: await content(),
          }),
        );
        if (old !== generation) return;
        location.hash = `#comunidades?id=${community}&post=${id}`;
      }),
    );
  }
  /**
   * Order and "Meus posts" are tabs; period, tag and hidden posts live in a
   * compact "⋯" menu instead of a row of loose buttons.
   */
  function filters(): void {
    if (!mounted) return;
    const bar = el('div', '', 'community-post-filters');
    mounted.append(bar);
    orderTabs(bar);
    moreFilters(bar);
  }
  function orderTabs(bar: HTMLElement): void {
    const tabs = el('div', '', 'community-post-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Ordenar postagens');
    const choices: (readonly [string, string])[] = [...feedOrders];
    if (own) choices.push(['own', 'Meus posts']);
    const paint = (): void => {
      tabs.querySelectorAll('button').forEach((node) => {
        const current =
          scope === 'public' ? node.value === order : node.value === scope;
        node.setAttribute('aria-pressed', String(current));
      });
    };
    for (const [value, title] of choices) {
      const tab = el('button', title);
      tab.type = 'button';
      tab.value = value;
      tab.addEventListener('click', () => {
        if (value === 'own') scope = 'own';
        else {
          scope = 'public';
          order = feedFilter({
            scope: 'all',
            order: value,
            period,
            community,
            tag,
          }).order;
        }
        after = null;
        paint();
        void run(load);
      });
      tabs.append(tab);
    }
    paint();
    bar.append(tabs);
  }
  function moreFilters(bar: HTMLElement): void {
    const menu = el('details', '', 'community-post-more'),
      summary = el('summary'),
      panel = el('div', '', 'community-post-more-panel');
    iconLabel(summary, 'more');
    summary.setAttribute('aria-label', 'Mais filtros');
    summary.title = 'Mais filtros';
    menu.append(summary, panel);
    bar.append(menu);
    discoveryMenu(
      panel,
      'Publicadas no período',
      { value: period, options: discoveryPeriods },
      (value) => {
        period = feedFilter({
          scope: 'all',
          order,
          period: value,
          community,
          tag,
        }).period;
        after = null;
        void run(load);
      },
    );
    const select = postTagSelect(
      panel,
      { value: tag, label: 'Filtrar por tag', empty: 'Todas as tags' },
      tagSource(),
    );
    select.addEventListener('change', () => {
      tag = select.value || null;
      after = null;
      void run(load);
    });
    if (!own || own.role === 'participant') return;
    button(panel, 'Posts e respostas ocultos', () =>
      run(async () => {
        scope = 'removed';
        after = null;
        await load();
      }),
    );
  }
  function shell(): void {
    if (!mounted) return;
    mounted.replaceChildren();
    feedback = el('p', '', 'community-feedback');
    feedback.setAttribute('role', 'status');
    mounted.append(feedback);
    composer();
    if (!selected) filters();
    list = el('div', '', 'community-post-list');
    controls = el('div', '', 'post-toolbar');
    mounted.append(list, controls);
  }
  function ready(): void {
    if (!mounted) return;
    void run(async () => {
      const old = generation,
        page = tagPage(
          await communityRead(`/api/communities/${community}/tags`, signal()),
        );
      if (old !== generation) return;
      tags = page;
      shell();
      await load();
    });
  }
  function leave(): void {
    clearMedia();
    generation++;
    abort.abort();
    mounted = null;
    management = null;
    own = null;
    identity = null;
    list = null;
    feedback = null;
  }
  function mountTags(container: HTMLElement): void {
    const section = card('Tags da comunidade');
    management = section;
    container.append(section);
    const label = field(section, 'Nome da nova tag', { maximum: 36 }),
      rows = el('div');
    section.append(rows);
    let id = crypto.randomUUID();
    let cursor: string | null = null;
    button(section, 'Criar tag', async () => {
      if (
        await saveTag(
          { id: community, tag: id, label: label.value },
          'tag-create',
        )
      ) {
        id = crypto.randomUUID();
        label.value = '';
      }
    });
    // Loads on open, outside the shared queue the screen is drawn in.
    const load = async (): Promise<void> => {
      const old = generation,
        page = tagPage(
          await controller.request('tag-list', {
            id: community,
            after: cursor,
          }),
        );
      if (old !== generation) return;
      rows.replaceChildren();
      for (const value of page.items) tagRow(rows, value);
      if (!page.items.length)
        rows.append(el('p', 'Nenhuma tag criada.', 'community-hint'));
      cursor = communityCursor(page.next);
      more.hidden = cursor === null;
    };
    const more = button(section, 'Mais tags', () => run(load));
    more.hidden = true;
    void load().catch(() => {
      rows.replaceChildren(
        el('p', 'Tags indisponíveis agora.', 'community-hint'),
      );
    });
  }
  function tagRow(container: HTMLElement, value: PostTag): void {
    const row = el('div', '', 'community-row'),
      label = field(row, 'Nome da tag', { value: value.label, maximum: 36 }),
      wrap = el('label'),
      active = el('input');
    active.type = 'checkbox';
    active.checked = value.active;
    wrap.append(active, document.createTextNode('Disponível para novos posts'));
    row.append(wrap);
    container.append(row);
    button(row, 'Salvar tag', async () => {
      await saveTag(
        {
          id: community,
          tag: value.id,
          revision: value.revision,
          label: label.value,
          active: active.checked,
        },
        'tag-edit',
      );
    });
  }
  async function saveTag(
    data: Record<string, unknown>,
    operation: string,
  ): Promise<boolean> {
    let saved = false;
    await run(async () => {
      const old = generation,
        result = object(await controller.request(operation, data));
      keys(result, ['saved']);
      if (result['saved'] !== true)
        throw new Error('Resposta de tag inválida.');
      if (old !== generation) return;
      saved = true;
      if (feedback)
        feedback.textContent =
          'Tag salva. Recarregue a comunidade para atualizar os seletores e as revisões.';
    });
    return saved;
  }
  return {
    mount(
      container: HTMLElement,
      options: {
        community: string;
        identity: { id: string; name: string; avatar: string | null };
        state: CommunityState | null;
        post: string | null;
        tag: string | null;
      },
    ): void {
      leave();
      mounted = container;
      community = options.community;
      identity = options.identity;
      own = options.state;
      selected = options.post;
      scope = 'public';
      order = 'recent';
      period = 'all';
      after = null;
      tag = options.tag;
      tags = { items: [], next: null };
      abort = new AbortController();
      shell();
      ready();
    },
    /** Tag management on the isolated manage screen, without the post list. */
    manageTags(container: HTMLElement, id: string): void {
      leave();
      community = id;
      tags = { items: [], next: null };
      abort = new AbortController();
      mountTags(container);
      // Saves and failures report beside the tags, as on the post list.
      feedback = el('p', '', 'community-feedback');
      feedback.setAttribute('role', 'status');
      container.lastElementChild?.append(feedback);
    },
    leave,
    canActivate: () => !busy,
  };
}
