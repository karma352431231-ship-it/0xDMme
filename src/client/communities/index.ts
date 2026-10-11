import type { AccountSession } from '../../shared/account/index.ts';
export { renderActivityEntry } from './activity-entry.ts';
export { ActivityPosts } from './activity-posts.ts';
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
import type { ReplyNotification } from '../../shared/community-posts/index.ts';
import { startCommunityDiscovery } from './discovery.ts';
import { startSocialDmUi } from './dms.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { communityAvatar, openPostFromCard } from './presentation.ts';
import {
  communityDirectoryNavigation,
  communityNavigation,
  communityView,
  postReturnTarget,
} from './navigation.ts';

export function startCommunities(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
) {
  const dms = startSocialDmUi(access, sync, privacy);
  const controller = new Communities(access);
  const posts = startCommunityPosts(controller, privacy);
  const discovery = startCommunityDiscovery(controller, privacy);
  document.addEventListener('click', openPostFromCard);
  let mounted: HTMLElement | null = null,
    sidebar: HTMLElement | null = null,
    session: AccountSession | null = null;
  let state: CommunityState | null = null,
    current: Community | null = null,
    generation = 0,
    busy = false;
  let abort = new AbortController(),
    photoUrl: string | null = null;
  // Query of the last list shown (feed, ranking, community…), for the post arrow.
  let lastList: string | null = null;
  let view = 'feed',
    selectedDm: string | null = null,
    localDm = false,
    selected: string | null = null,
    selectedPost: string | null = null,
    selectedTag: string | null = null,
    cursor: string | null = null,
    sidebarCursor: string | null = null;
  let output: HTMLElement | null = null;
  let discoveryMounted = false;
  // The DM view is shared: the communities page owns it for view=dms, the workspace for its chat column.
  let dmOwner: 'page' | 'panel' | null = null;
  const publicPhotos = new Map<() => void, HTMLElement>();
  function clearPublicPhotos(container?: HTMLElement | null): void {
    for (const [cleanup, node] of publicPhotos) {
      if (container && !container.contains(node)) continue;
      cleanup();
      publicPhotos.delete(cleanup);
    }
  }
  function publicPhoto(container: HTMLElement, item: Community): void {
    if (!item.avatar) return;
    publicPhotos.set(
      showPublicAvatar(container, {
        kind: 'community-photo',
        target: item.id,
        reference: item.avatar,
        signal: abort.signal,
      }),
      container,
    );
  }
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
    discoveryMounted = false;
    clearPhoto();
    clearPublicPhotos(mounted);
    mounted.replaceChildren();
    delete mounted.dataset['communityLayout'];
    communityNavigation(mounted, {
      view,
      selected,
      signedIn: session !== null,
      manage:
        selected &&
        state?.community.id === selected &&
        state.role !== 'participant'
          ? selected
          : null,
    });
    output = communityElement('p', '', 'community-feedback');
    output.setAttribute('role', 'status');
    mounted.append(output);
  }
  function rows(container: HTMLElement, page: CommunityPage): void {
    for (const item of page.items) {
      const row = communityElement('div', '', 'community-row');
      const a = communityElement('a', '', 'community-row-link'),
        avatar = communityAvatar(item.name),
        copy = communityElement('span', '', 'community-row-copy');
      a.href = `#comunidades?id=${item.id}`;
      if (item.id === selected) a.setAttribute('aria-current', 'page');
      copy.append(
        communityElement('strong', item.name),
        communityElement('small', followerLabel(item)),
      );
      a.append(avatar, copy);
      row.append(a);
      container.append(row);
      publicPhoto(avatar, item);
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
    clearPublicPhotos(sidebar);
    sidebar.replaceChildren();
    communityDirectoryNavigation(sidebar, view, selected);
    if (!session) {
      sidebar.append(
        communityElement('p', 'Entre para ver suas comunidades seguidas.'),
      );
      return;
    }
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
    const card = communityCard(
      view === 'invitations'
        ? 'Transferências de comunidades'
        : 'Minhas comunidades',
    );
    mounted.append(card);
    if (view === 'communities') {
      const links = communityElement('nav', '', 'community-personal-links');
      links.setAttribute('aria-label', 'Suas listas');
      for (const [key, label] of [
        ['following', 'Feed de seguidos'],
        ['saved', 'Salvos'],
        ['replies', 'Respostas'],
        ['create', 'Criar comunidade'],
      ] as const)
        communityLink(links, label, `#comunidades?view=${key}`);
      card.append(links);
    }
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
  /**
   * The first thing a visitor sees: banner in the community's tone, a large
   * photo, the name, followers and the description; follow and manage at hand.
   */
  function summary(value: Community): void {
    if (!mounted) return;
    const hero = communityElement('section', '', 'community-hero');
    hero.setAttribute('aria-label', `Comunidade ${value.name}`);
    mounted.append(hero);
    const avatar = communityAvatar(value.name);
    const banner = communityElement('div', '', 'community-banner');
    banner.dataset['tone'] = avatar.dataset['tone'] ?? '0';
    const head = communityElement('div', '', 'community-hero-head');
    const title = communityElement('div', '', 'community-hero-title');
    title.append(
      communityElement('h1', value.name),
      communityElement('p', followerLabel(value), 'community-hero-meta'),
    );
    head.append(avatar, title);
    hero.append(banner, head);
    publicPhoto(avatar, value);
    if (value.description)
      hero.append(
        communityElement('p', value.description, 'community-hero-description'),
      );
    const info = communityElement('details', '', 'community-info');
    info.append(communityElement('summary', 'Sobre e regras da comunidade'));
    hero.append(info);
    if (value.owner)
      communityLink(
        info,
        `Proprietário: @${value.owner.handle}`,
        `#publico?handle=${encodeURIComponent(value.owner.handle)}`,
      );
    else
      info.append(
        communityElement('p', 'Proprietário removido; comunidade arquivada.'),
      );
    info.append(
      communityElement('h3', 'Regras da comunidade'),
      communityElement(
        'p',
        value.rules || 'A política global se aplica a toda participação.',
        'community-text',
      ),
      communityElement('p', communityPolicy),
    );
    if (!state) {
      communityLink(head, 'Entre pelo Perfil para participar', '#perfil');
      return;
    }
    participant(head, state);
  }
  function participant(card: HTMLElement, own: CommunityState): void {
    communityButton(card, own.following ? 'Seguindo' : 'Seguir', () =>
      mutate('follow', { id: own.community.id, following: !own.following }),
    );
    const follow = card.lastElementChild;
    follow?.classList.add('community-follow');
    follow?.setAttribute('aria-pressed', String(own.following));
    if (!own.canPost)
      card.after(
        communityElement(
          'p',
          own.community.archived
            ? 'Participação encerrada: comunidade arquivada.'
            : 'Sua participação está suspensa.',
          'community-hero-notice',
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
  /**
   * The arrow returns to `href`; the community photo and name enter the
   * community. Both are links, so the feed panel keeps them in place.
   */
  function backHeader(value: Community, href: string): HTMLElement {
    const header = communityElement('div', '', 'community-post-back'),
      arrow = communityElement('a', '←', 'community-post-back-arrow'),
      identity = communityElement('a', '', 'community-post-back-identity'),
      avatar = communityAvatar(value.name);
    arrow.href = href;
    arrow.title = 'Voltar';
    arrow.setAttribute('aria-label', 'Voltar');
    identity.href = `#comunidades?id=${value.id}`;
    identity.append(avatar, communityElement('span', value.name));
    header.append(arrow, identity);
    publicPhoto(avatar, value);
    return header;
  }
  /** A post takes the whole timeline: way back, the post, then its replies. */
  function postFocus(value: Community, post: string): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'post';
    mounted.append(backHeader(value, postReturnTarget(lastList, value.id)));
    const postContainer = communityElement('section', '', 'community-posts');
    mounted.append(postContainer);
    posts.mount(postContainer, {
      community: value.id,
      identity: value,
      state,
      post,
      tag: selectedTag,
    });
  }
  function details(): void {
    if (!mounted || !current) return;
    navigation();
    if (selectedPost) {
      postFocus(current, selectedPost);
      return;
    }
    if (view === 'manage' && state && state.role !== 'participant') {
      manageScreen(current, state);
      return;
    }
    // Wide communities page: posts on the left, about and management on the right.
    mounted.dataset['communityLayout'] = 'detail';
    summary(current);
    const postContainer = communityElement('section', '', 'community-posts');
    mounted.append(postContainer);
    posts.mount(postContainer, {
      community: current.id,
      identity: current,
      state,
      post: selectedPost,
      tag: selectedTag,
    });
    // Owners and moderators manage from the isolated screen (top-right link);
    // participants keep their sanctions, appeals and reports here.
    if (state?.role === 'participant') {
      const management = communityElement(
        'details',
        '',
        'community-management',
      );
      management.append(
        communityElement('summary', 'Participação e denúncias'),
      );
      mounted.append(management);
      governance(management, state);
    }
    communityButton(mounted, 'Recarregar comunidade', () => run(refresh));
  }
  /** Isolated settings screen for owners and moderators. */
  function manageScreen(value: Community, own: CommunityState): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'manage';
    const back = backHeader(value, `#comunidades?id=${value.id}`);
    const management = communityElement('section', '', 'community-manage');
    management.append(communityElement('h1', 'Gerenciar comunidade'));
    mounted.append(back, management);
    const card = communityCard('Nome, descrição e regras');
    management.append(card);
    const meta = metaForm(card, own.community);
    communityButton(card, 'Salvar nome, descrição e regras', () =>
      mutate('edit', {
        id: own.community.id,
        revision: own.community.revision,
        meta: meta(),
      }),
    );
    const photoCard = communityCard('Foto da comunidade');
    management.append(photoCard);
    photo(photoCard, own);
    posts.manageTags(management, own.community.id);
    governance(management, own);
  }
  function governance(container: HTMLElement, own: CommunityState): void {
    mountCommunityGovernance(container, own, {
      mutate,
      query: run,
      request: (operation, data) => controller.request(operation, data),
    });
  }
  function photo(card: HTMLElement, own: CommunityState): void {
    card.append(
      communityElement(
        'p',
        'A foto fica restrita aos gestores até a moderação automática. Arquivos ainda não aprovados são descartados em até sete dias. Quem enviou consulta a análise e pode contestar em Perfil.',
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
  async function refreshDiscovery(container: HTMLElement): Promise<void> {
    if (discoveryMounted) {
      await discovery.refresh();
      return;
    }
    navigation();
    discoveryMounted = true;
    discovery.mount(container, {
      view,
      signedIn: session !== null,
      followChanged: async () => {
        sidebarCursor = null;
        await directory();
      },
    });
  }
  async function refresh(): Promise<void> {
    if (!mounted) return;
    if (view === 'dms') {
      navigation();
      dms.mount(mounted, selectedDm, localDm);
      dmOwner = 'page';
      return;
    }
    if (view === 'create') {
      creation();
      return;
    }
    if (!selected) {
      if (['feed', 'explore', 'following', 'saved', 'hidden'].includes(view)) {
        await refreshDiscovery(mounted);
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
    discoveryMounted = false;
    if (dmOwner === 'page') {
      dms.leave();
      dmOwner = null;
    }
    generation++;
    abort.abort();
    mounted = null;
    state = null;
    current = null;
    clearPhoto();
    clearPublicPhotos();
  }
  return {
    /** `directoryNode` is null when the feed is a workspace panel without the followed list. */
    mount(
      container: HTMLElement,
      directoryNode: HTMLElement | null,
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
        selectedDm = params.has('dm') ? uuid(params.get('dm')) : null;
        localDm = params.get('history') === 'local';
        selected = params.has('id') ? uuid(params.get('id')) : null;
        selectedPost = params.has('post') ? uuid(params.get('post')) : null;
        selectedTag = params.has('tag') ? uuid(params.get('tag')) : null;
        // A post opened from a list returns to that list, not to its community.
        if (!selectedPost) lastList = params.toString();
      } catch {
        selected = null;
        navigation();
        if (output) output.textContent = 'Link de comunidade inválido.';
        return;
      }
      view = communityView(view, selected);
      navigation();
      ready();
    },
    leave,
    /** Another app page opened: a post reached from there returns to its community. */
    forgetReturn(): void {
      lastList = null;
    },
    ready,
    /** Public @ conversations in the workspace chat column, independent of the mounted feed. */
    openDm(container: HTMLElement, id: string | null, local: boolean): void {
      dms.mount(container, id, local);
      dmOwner = 'panel';
    },
    closeDm(): void {
      if (dmOwner !== 'panel') return;
      dms.leave();
      dmOwner = null;
    },
    dmDirectory: (node: HTMLElement, valid: () => boolean) =>
      dms.directory(node, valid),
    /** Unread replies for Atividade; the same notices as “Respostas ao seu conteúdo”. */
    async unreadReplies(): Promise<readonly ReplyNotification[]> {
      const page = replyNotificationPage(
        await controller.request('post-notifications', { after: null }),
      );
      return page.items.filter((item) => !item.read);
    },
    async markRepliesRead(replies: readonly string[]): Promise<void> {
      await controller.request('post-notifications-read', { replies });
    },
    /** Pending community transfers, as listed in Comunidades → Transferências. */
    async pendingTransfers(): Promise<readonly Community[]> {
      return (await controller.list('invitations', null)).items;
    },
    canActivate: () =>
      !busy &&
      posts.canActivate() &&
      discovery.canActivate() &&
      dms.canActivate(),
    setSession(value: AccountSession | null): void {
      session = value;
      dms.setSession(value);
      if (!controller.setSession(value)) return;
      generation++;
      posts.leave();
      discovery.leave();
      discoveryMounted = false;
      state = null;
      current = null;
      sidebarCursor = null;
      clearPhoto();
      clearPublicPhotos();
      sidebar?.replaceChildren();
      if (mounted) {
        navigation();
        ready();
      }
    },
  };
}
