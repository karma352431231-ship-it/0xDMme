import { restrictedMedia } from '../community-media/index.ts';
import { showPublicPostMedia } from '../public-media/index.ts';
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
import {
  postActions,
  postForm,
  postTagSelect,
  replyForm,
} from './post-forms.ts';
import { postText } from './post-text.ts';
import {
  preferenceControls,
  postVoting,
  discoverySelect,
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
export function startCommunityPosts(controller: Communities) {
  let mounted: HTMLElement | null = null,
    management: HTMLElement | null = null,
    community = '',
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
    const node = card(value.parent ? 'Resposta' : value.title || 'Postagem');
    node.dataset['postId'] = value.id;
    node.classList.add('community-post');
    container.append(node);
    rowContent(node, value, privateState);
    rowMeta(node, value);
    voting(node, value);
    branch(node, value, depth);
    if (!own) return;
    const old = generation;
    preferenceControls(node, value, {
      controller,
      run,
      valid: () => old === generation,
      changed: async () => {
        after = null;
        await load();
      },
    });
    const options = el('div');
    node.append(options);
    button(node, 'Opções da postagem', () =>
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
    container.append(children);
    let cursor: string | null = null;
    button(container, `Ver respostas (${parent.replies})`, () =>
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
        children.replaceChildren(
          el('h3', 'Respostas diretas a este comentário'),
        );
        for (const reply of page.items) row(reply, null, children, depth + 1);
        cursor = page.next;
        if (page.next)
          children.append(
            el(
              'p',
              'Há mais respostas. Use o botão novamente para a próxima página.',
            ),
          );
      }),
    );
  }
  function voting(node: HTMLElement, value: CommunityPost): void {
    node.append(
      el('p', `Placar: ${value.score} · ${value.replies} respostas diretas`),
    );
    if (!own?.canPost || value.status !== 'visible') return;
    const old = generation;
    postVoting(node, value, {
      controller,
      run,
      valid: () => old === generation,
      changed: async () => {
        after = null;
        await load();
        if (feedback) feedback.textContent = 'Alteração salva.';
      },
    });
  }
  function replyComposer(container: HTMLElement, parent: CommunityPost): void {
    if (!own?.canPost || parent.status !== 'visible') return;
    const form = el('details', '', 'card community-card');
    form.append(el('summary', 'Responder diretamente'));
    container.append(form);
    const content = replyForm(
      form,
      { title: '', text: '', tag: null },
      mediaAccess(),
    );
    let id = crypto.randomUUID();
    button(form, 'Publicar resposta', () =>
      run(async () => {
        const old = generation;
        postState(
          await controller.request('reply-create', {
            id: community,
            post: id,
            parent: parent.id,
            content: await content(),
          }),
        );
        if (old !== generation) return;
        id = crypto.randomUUID();
        after = null;
        await load();
        if (feedback) feedback.textContent = 'Resposta publicada.';
      }),
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
    list.append(el('h3', 'Respostas diretas'));
    if (!page.items.length)
      list.append(el('p', 'Ainda não há respostas diretas.'));
    for (const reply of page.items) row(reply);
    after = page.next;
    replyComposer(list, value);
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
    if (value.media?.length)
      mediaCleanup.set(
        showPublicPostMedia(node, value.media, abort.signal),
        node,
      );
    else if (!value.text) node.append(el('p', 'Mídia aguardando liberação.'));
  }
  function rowMeta(node: HTMLElement, value: CommunityPost): void {
    if (value.author)
      link(
        node,
        `@${value.author.handle}`,
        `#publico?handle=${encodeURIComponent(value.author.handle)}`,
      );
    if (value.tag) {
      link(
        node,
        value.tag.label,
        `#comunidades?id=${community}&tag=${value.tag.id}`,
      );
      node.lastElementChild?.classList.add('post-tag');
    }
    node.append(
      el(
        'small',
        `${new Date(value.createdAt).toLocaleString('pt-BR')}${value.editedAt ? ' · Editado' : ''}`,
      ),
    );
    const nav = el('nav', '', 'post-toolbar');
    nav.setAttribute('aria-label', 'Navegação da resposta ou postagem');
    node.append(nav);
    if (value.parent) {
      link(
        nav,
        'Resposta anterior',
        `#comunidades?id=${community}&post=${value.parent}`,
      );
      link(
        nav,
        'Postagem original',
        `#comunidades?id=${community}&post=${value.root}`,
      );
    }
    link(
      nav,
      value.parent ? 'Abrir resposta e sua árvore' : 'Abrir postagem',
      `#comunidades?id=${community}&post=${value.id}`,
    );
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
    if (!list.children.length)
      list.append(el('p', 'Nenhuma postagem nesta lista.'));
    paging();
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
    if (!mounted || !own?.canPost) return;
    const form = el('details', '', 'card community-card post-composer');
    form.append(el('summary', 'Criar postagem'));
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
  function filters(): void {
    if (!mounted) return;
    const toolbar = el('div', '', 'post-toolbar');
    mounted.append(toolbar);
    discoverySelect(
      toolbar,
      'Ordenar postagens',
      { value: order, options: feedOrders },
      (value) => {
        order = feedFilter({
          scope: 'all',
          order: value,
          period,
          community,
          tag,
        }).order;
        after = null;
        void run(load);
      },
    );
    discoverySelect(
      toolbar,
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
      toolbar,
      { value: tag, label: 'Filtrar por tag', empty: 'Todas as tags' },
      tagSource(),
    );
    select.addEventListener('change', () => {
      tag = select.value || null;
      after = null;
      void run(load);
    });
    if (!own) return;
    for (const [value, title] of [
      ['public', 'Posts públicos'],
      ['own', 'Meus posts e respostas'],
      ['removed', 'Posts e respostas ocultos'],
    ] as const) {
      if (value === 'removed' && own.role === 'participant') continue;
      button(toolbar, title, () =>
        run(async () => {
          scope = value;
          after = null;
          await load();
        }),
      );
    }
  }
  function shell(): void {
    if (!mounted) return;
    mounted.replaceChildren();
    feedback = el('p', '', 'community-feedback');
    feedback.setAttribute('role', 'status');
    mounted.append(feedback);
    composer();
    if (!selected) filters();
    list = el('div');
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
    button(section, 'Carregar tags', () =>
      run(async () => {
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
        cursor = communityCursor(page.next);
      }),
    );
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
        state: CommunityState | null;
        post: string | null;
        tag: string | null;
      },
    ): void {
      leave();
      mounted = container;
      community = options.community;
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
    mountTags,
    leave,
    canActivate: () => !busy,
  };
}
