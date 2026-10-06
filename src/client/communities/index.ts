import type { AccountSession } from '../../shared/account/index.ts';
import { encode, uuid } from '../../shared/account/index.ts';
import {
  communityPolicy,
  communityState,
} from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
  CommunityState,
} from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { Communities, readCommunity } from './controller.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityField,
  communityLink,
} from './elements.ts';
import { mountCommunityGovernance } from './governance.ts';
import { startCommunityPosts } from './posts.ts';
import { replyNotificationPage } from '../../shared/community-posts/index.ts';
import { startCommunityDiscovery } from './discovery.ts';

export function startCommunities(access: VaultAccess) {
  const controller = new Communities(access);
  const posts = startCommunityPosts(controller);
  const discovery = startCommunityDiscovery(controller);
  let mounted: HTMLElement | null = null,
    sidebar: HTMLElement | null = null,
    session: AccountSession | null = null;
  let state: CommunityState | null = null,
    current: Community | null = null,
    generation = 0,
    busy = false;
  let abort = new AbortController(),
    photoUrl: string | null = null;
  let view = 'feed',
    selected: string | null = null,
    selectedPost: string | null = null,
    selectedTag: string | null = null,
    cursor: string | null = null,
    sidebarCursor: string | null = null;
  let output: HTMLElement | null = null;
  function clearPhoto(): void {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
  function controls(): void {
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    const old = generation;
    busy = true;
    controls();
    try {
      await work();
    } catch (error: unknown) {
      if (old === generation && output)
        output.textContent =
          error instanceof Error ? error.message : 'Comunidade indisponível.';
    } finally {
      busy = false;
      controls();
      if (old !== generation && mounted) ready();
    }
  }
  function signal(): AbortSignal {
    return AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
  }
  function navigation(): void {
    if (!mounted) return;
    clearPhoto();
    mounted.replaceChildren();
    const nav = communityElement('nav', '', 'community-tabs');
    nav.setAttribute('aria-label', 'Comunidades');
    for (const [key, title] of [
      ['feed', 'Feed'],
      ['explore', 'Explorar'],
      ['following', 'Seguindo'],
      ['saved', 'Salvos'],
      ['hidden', 'Ocultos'],
      ['replies', 'Respostas'],
      ['managed', 'Gerenciar'],
      ['invitations', 'Transferências'],
      ['create', 'Criar comunidade'],
    ] as const) {
      if (!session && key !== 'explore' && key !== 'feed') continue;
      communityLink(nav, title, `#comunidades?view=${key}`);
    }
    mounted.append(nav);
    output = communityElement('p', '', 'community-feedback');
    output.setAttribute('role', 'status');
    mounted.append(output);
  }
  function rows(container: HTMLElement, page: CommunityPage): void {
    for (const item of page.items) {
      const row = communityElement('div', '', 'community-row');
      communityLink(row, item.name, `#comunidades?id=${item.id}`);
      row.append(communityElement('small', followerLabel(item)));
      container.append(row);
    }
    if (!page.items.length)
      container.append(
        communityElement('p', 'Nenhuma comunidade nesta lista.'),
      );
  }
  function followerLabel(value: Community): string {
    return `${value.followers} ${value.followers === 1 ? 'seguidor' : 'seguidores'}${value.archived ? ' · Arquivada' : ''}`;
  }
  async function directory(): Promise<void> {
    if (!sidebar) return;
    sidebar.replaceChildren();
    communityLink(sidebar, 'Feed geral', '#comunidades?view=feed');
    communityLink(sidebar, 'Explorar comunidades', '#comunidades?view=explore');
    sidebar.append(communityElement('h2', 'Suas comunidades'));
    if (!session) {
      sidebar.append(
        communityElement('p', 'Entre para ver suas comunidades seguidas.'),
      );
      return;
    }
    communityLink(
      sidebar,
      'Respostas ao seu conteúdo',
      '#comunidades?view=replies',
    );
    communityLink(sidebar, 'Feed de seguidos', '#comunidades?view=following');
    communityLink(sidebar, 'Salvos', '#comunidades?view=saved');
    const old = generation;
    try {
      const page = await controller.list('following', sidebarCursor);
      if (old !== generation || !sidebar) return;
      rows(sidebar, page);
      sidebarCursor = page.next;
      if (page.next)
        communityButton(sidebar, 'Mais comunidades', () => run(directory));
    } catch (error: unknown) {
      if (old === generation && sidebar)
        sidebar.append(
          communityElement(
            'p',
            error instanceof Error ? error.message : 'Lista indisponível.',
          ),
        );
    }
  }
  async function notifications(): Promise<void> {
    const old = generation,
      currentCursor = cursor,
      page = replyNotificationPage(
        await controller.request('post-notifications', { after: cursor }),
      );
    if (old !== generation || !mounted) return;
    navigation();
    const card = communityCard('Respostas ao seu conteúdo');
    mounted.append(card);
    card.append(
      communityElement(
        'p',
        'Somente respostas diretas a posts ou comentários seus.',
      ),
    );
    for (const item of page.items) {
      const row = communityElement('div', '', 'community-row');
      card.append(row);
      communityLink(
        row,
        item.read ? 'Resposta lida' : 'Nova resposta',
        `#comunidades?id=${item.community}&post=${item.reply}`,
      );
      row.append(
        communityElement(
          'small',
          new Date(item.createdAt).toLocaleString('pt-BR'),
        ),
      );
    }
    if (!page.items.length)
      card.append(communityElement('p', 'Nenhuma resposta nesta página.'));
    const unread = page.items
      .filter((item) => !item.read)
      .map((item) => item.reply);
    if (unread.length)
      communityButton(card, 'Marcar esta página como lida', () =>
        run(async () => {
          await controller.request('post-notifications-read', {
            replies: unread,
          });
          if (old === generation) {
            cursor = currentCursor;
            await notifications();
          }
        }),
      );
    cursor = page.next;
    if (page.next)
      communityButton(card, 'Respostas anteriores', () => run(notifications));
    communityButton(card, 'Recarregar respostas', () =>
      run(async () => {
        cursor = null;
        await notifications();
      }),
    );
  }
  async function listing(): Promise<void> {
    const old = generation;
    const page = await controller.list(
      view === 'communities' ? 'following' : view,
      cursor,
    );
    if (old !== generation || !mounted) return;
    navigation();
    const card = communityCard('Suas comunidades');
    mounted.append(card);
    rows(card, page);
    cursor = page.next;
    if (page.next) communityButton(card, 'Próxima página', () => run(listing));
    communityButton(card, 'Recarregar lista', () => {
      cursor = null;
      return run(listing);
    });
  }
  function metaForm(
    card: HTMLElement,
    value: { name: string; description: string; rules: string },
  ) {
    const name = communityField(card, 'Nome da comunidade', {
      value: value.name,
      maximum: 100,
    });
    const description = communityField(card, 'Descrição', {
      value: value.description,
      maximum: 1000,
      multiline: true,
    });
    const rules = communityField(card, 'Regras locais', {
      value: value.rules,
      maximum: 4000,
      multiline: true,
    });
    return () => ({
      name: name.value,
      description: description.value,
      rules: rules.value,
    });
  }
  function creation(): void {
    if (!mounted) return;
    navigation();
    const card = communityCard('Criar comunidade');
    mounted.append(card);
    card.append(
      communityElement(
        'p',
        'Comunidades são públicas e gratuitas. Qualquer perfil público autorizado pode participar sem precisar seguir.',
      ),
    );
    card.append(communityElement('p', communityPolicy));
    const meta = metaForm(card, { name: '', description: '', rules: '' }),
      id = crypto.randomUUID();
    communityButton(card, 'Criar comunidade', () =>
      run(async () => {
        const old = generation;
        const result = communityState(
          await controller.request('create', { id, meta: meta() }),
        );
        if (old !== generation) return;
        location.hash = `#comunidades?id=${result.community.id}`;
      }),
    );
  }
  function summary(value: Community): void {
    if (!mounted) return;
    const card = communityCard(value.name);
    mounted.append(card);
    card.append(
      communityElement('p', value.description),
      communityElement('p', followerLabel(value)),
    );
    if (value.owner)
      communityLink(
        card,
        `Proprietário: @${value.owner.handle}`,
        `#publico?handle=${encodeURIComponent(value.owner.handle)}`,
      );
    else
      card.append(
        communityElement('p', 'Proprietário removido; comunidade arquivada.'),
      );
    card.append(
      communityElement('h3', 'Regras da comunidade'),
      communityElement(
        'p',
        value.rules || 'A política global se aplica a toda participação.',
        'community-text',
      ),
      communityElement('p', communityPolicy),
    );
    if (!state) {
      communityLink(card, 'Entre pelo Perfil para participar', '#perfil');
      return;
    }
    participant(card, state);
  }
  function participant(card: HTMLElement, own: CommunityState): void {
    communityButton(
      card,
      own.following ? 'Deixar de seguir' : 'Seguir comunidade',
      () =>
        mutate('follow', { id: own.community.id, following: !own.following }),
    );
    card.append(
      communityElement(
        'p',
        own.canPost
          ? 'Participação permitida, mesmo sem seguir.'
          : own.community.archived
            ? 'Participação encerrada: comunidade arquivada.'
            : 'Sua participação está suspensa.',
      ),
    );
    if (own.sanction) {
      const s = own.sanction;
      card.append(
        communityElement('p', `Motivo: ${s.reason}`),
        communityElement(
          'p',
          s.until
            ? `Até ${new Date(s.until).toLocaleString('pt-BR')}`
            : 'Banimento reversível',
        ),
      );
      if (s.appeal)
        card.append(communityElement('p', `Contestação: ${s.appeal}`));
      if (s.decision)
        card.append(communityElement('p', `Resposta: ${s.decision}`));
    }
  }
  function details(): void {
    if (!mounted || !current) return;
    navigation();
    summary(current);
    const postContainer = communityElement('section', '', 'community-posts');
    mounted.append(postContainer);
    posts.mount(postContainer, {
      community: current.id,
      state,
      post: selectedPost,
      tag: selectedTag,
    });
    if (!state) return;
    const own = state;
    const management = communityElement('details', '', 'community-management');
    management.append(
      communityElement(
        'summary',
        own.role === 'participant'
          ? 'Participação e denúncias'
          : 'Gerenciar comunidade',
      ),
    );
    mounted.append(management);
    if (own.role !== 'participant') {
      const card = communityCard('Editar comunidade');
      management.append(card);
      const meta = metaForm(card, own.community);
      communityButton(card, 'Salvar nome, descrição e regras', () =>
        mutate('edit', {
          id: own.community.id,
          revision: own.community.revision,
          meta: meta(),
        }),
      );
      photo(card, own);
      posts.mountTags(management);
    }
    mountCommunityGovernance(management, own, {
      mutate,
      query: run,
      request: (operation, data) => controller.request(operation, data),
    });
    communityButton(mounted, 'Recarregar comunidade', () => run(refresh));
  }
  function photo(card: HTMLElement, own: CommunityState): void {
    card.append(
      communityElement(
        'p',
        'A foto da comunidade fica restrita aos gestores até a moderação automática.',
      ),
    );
    if (own.pendingPhoto) {
      const image = communityElement('img', '', 'public-avatar-preview');
      image.alt = 'Foto preparada da comunidade, ainda restrita';
      photoUrl = URL.createObjectURL(
        new Blob([own.pendingPhoto.bytes], { type: own.pendingPhoto.type }),
      );
      image.src = photoUrl;
      card.append(image);
    }
    const file = communityElement('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp';
    file.hidden = true;
    card.append(file);
    communityButton(card, 'Escolher foto da comunidade', () => {
      file.click();
      return Promise.resolve();
    });
    file.addEventListener('change', () => {
      const selectedFile = file.files?.[0];
      file.value = '';
      if (!selectedFile) return;
      const old = generation;
      void run(async () => {
        const prepared = await preparePhoto(selectedFile);
        if (old !== generation) return;
        await mutateWork('photo', {
          id: own.community.id,
          revision: own.community.revision,
          photo: { type: prepared.type, bytes: encode(prepared.bytes) },
        });
      });
    });
    if (own.pendingPhoto)
      communityButton(card, 'Remover foto preparada', () =>
        mutate('photo', {
          id: own.community.id,
          revision: own.community.revision,
          photo: null,
        }),
      );
  }
  async function mutateWork(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const old = generation,
      result = communityState(await controller.request(operation, data));
    if (old !== generation) return;
    state = result;
    current = result.community;
    details();
    if (output) output.textContent = 'Alteração salva.';
    sidebarCursor = null;
    await directory();
  }
  function mutate(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    return run(() => mutateWork(operation, data));
  }
  async function refresh(): Promise<void> {
    if (!mounted) return;
    if (view === 'create') {
      creation();
      return;
    }
    if (!selected) {
      if (['feed', 'explore', 'following', 'saved', 'hidden'].includes(view)) {
        navigation();
        discovery.mount(mounted, { view, signedIn: session !== null });
        return;
      }
      if (view === 'replies') {
        await notifications();
        return;
      }
      await listing();
      return;
    }
    const old = generation;
    const value = await readCommunity(selected, signal());
    if (old !== generation) return;
    current = value;
    state = null;
    details();
    if (session) {
      const own = await controller.state(selected);
      if (old !== generation) return;
      state = own;
      current = own.community;
      details();
    }
  }
  function ready(): void {
    if (mounted)
      void run(async () => {
        await refresh();
        await directory();
      });
  }
  function leave(): void {
    posts.leave();
    discovery.leave();
    generation++;
    abort.abort();
    mounted = null;
    state = null;
    current = null;
    clearPhoto();
  }
  return {
    mount(
      container: HTMLElement,
      directoryNode: HTMLElement,
      params: URLSearchParams,
    ): void {
      leave();
      mounted = container;
      sidebar = directoryNode;
      abort = new AbortController();
      view = params.get('view') ?? 'feed';
      cursor = null;
      sidebarCursor = null;
      try {
        selected = params.has('id') ? uuid(params.get('id')) : null;
        selectedPost = params.has('post') ? uuid(params.get('post')) : null;
        selectedTag = params.has('tag') ? uuid(params.get('tag')) : null;
      } catch {
        selected = null;
        navigation();
        if (output) output.textContent = 'Link de comunidade inválido.';
        return;
      }
      if (
        ![
          'explore',
          'feed',
          'saved',
          'hidden',
          'communities',
          'following',
          'managed',
          'invitations',
          'create',
          'replies',
        ].includes(view)
      )
        view = 'feed';
      navigation();
      ready();
    },
    leave,
    ready,
    canActivate: () => !busy && posts.canActivate() && discovery.canActivate(),
    setSession(value: AccountSession | null): void {
      session = value;
      if (!controller.setSession(value)) return;
      generation++;
      posts.leave();
      discovery.leave();
      state = null;
      current = null;
      sidebarCursor = null;
      clearPhoto();
      sidebar?.replaceChildren();
      if (mounted) {
        navigation();
        ready();
      }
    },
  };
}
