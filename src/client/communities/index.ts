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
import { startSocialDmUi } from './dms.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityAvatar } from './presentation.ts';
import {
  communityDirectoryNavigation,
  communityNavigation,
} from './navigation.ts';

export function startCommunities(access: VaultAccess, sync: VaultSync) {
  const dms = startSocialDmUi(access, sync);
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
    selectedDm: string | null = null,
    localDm = false,
    selected: string | null = null,
    selectedPost: string | null = null,
    selectedTag: string | null = null,
    cursor: string | null = null,
    sidebarCursor: string | null = null;
  let output: HTMLElement | null = null;
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
    clearPhoto();
    clearPublicPhotos(mounted);
    mounted.replaceChildren();
    communityNavigation(mounted, {
      view,
      selected,
      signedIn: session !== null,
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
      const dmNode = communityElement('section', '', 'social-dm-directory');
      sidebar.append(dmNode);
      await dms.directory(dmNode, () => old === generation && sidebar !== null);
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
      view === 'managed'
        ? 'Comunidades que você gerencia'
        : view === 'invitations'
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
  function summary(value: Community): void {
    if (!mounted) return;
    const card = communityCard(value.name);
    mounted.append(card);
    const avatar = communityAvatar(value.name);
    card.firstElementChild?.prepend(avatar);
    card.classList.add('community-summary');
    publicPhoto(avatar, value);
    card.append(
      communityElement('p', value.description),
      communityElement('p', followerLabel(value)),
    );
    const info = communityElement('details', '', 'community-info');
    info.append(communityElement('summary', 'Sobre e regras da comunidade'));
    card.append(info);
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
      identity: current,
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
  async function refresh(): Promise<void> {
    if (!mounted) return;
    if (view === 'dms') {
      navigation();
      dms.mount(mounted, selectedDm, localDm);
      return;
    }
    if (view === 'create') {
      creation();
      return;
    }
    if (!selected) {
      if (['feed', 'explore', 'following', 'saved', 'hidden'].includes(view)) {
        navigation();
        discovery.mount(mounted, {
          view,
          signedIn: session !== null,
          followChanged: async () => {
            sidebarCursor = null;
            await directory();
          },
        });
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
    dms.leave();
    generation++;
    abort.abort();
    mounted = null;
    state = null;
    current = null;
    clearPhoto();
    clearPublicPhotos();
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
        selectedDm = params.has('dm') ? uuid(params.get('dm')) : null;
        localDm = params.get('history') === 'local';
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
          'dms',
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
