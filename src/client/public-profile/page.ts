import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../api-response/index.ts';
import { publicHandle } from '../../shared/public-profile/index.ts';
import {
  profileSummary,
  profileFollow,
} from '../../shared/profile-social/index.ts';
import type {
  ProfileSummary,
  ProfileFollow,
} from '../../shared/profile-social/index.ts';
import { feedPage } from '../../shared/community-discovery/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { communityPage } from '../../shared/communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { renderActivityEntry } from '../communities/index.ts';
import type { PublicProfiles } from './controller.ts';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
) {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function link(host: HTMLElement, text: string, href: string) {
  const node = element('a', text);
  node.href = href;
  host.append(node);
  return node;
}
function about(host: HTMLElement, summary: ProfileSummary): void {
  const metrics = element('dl', '', 'public-profile-metrics');
  const number = (count: number) => count.toLocaleString('pt-BR');
  for (const [value, label] of [
    [number(summary.conversations), 'Conversas geradas'],
    [
      `${number(summary.posts)} posts · ${number(summary.replies)} respostas`,
      'Participação',
    ],
    [
      summary.createdAt
        ? new Date(summary.createdAt).toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric',
          })
        : 'Data não registrada',
      'Perfil público desde',
    ],
    [number(summary.communities), 'Comunidades seguidas'],
  ] as const) {
    const item = element('div');
    item.append(element('dd', value), element('dt', label));
    metrics.append(item);
  }
  host.append(element('h2', 'Sobre'), metrics);
}

/** Activity reads omit cookies; explicit social actions use signed account access. */
export function showProfilePage(
  container: HTMLElement,
  handle: unknown,
  options: {
    controller?: PublicProfiles;
    renderEntry?: (entry: FeedEntry, signal: AbortSignal) => HTMLElement;
  } = {},
): () => void {
  const lifetime = new AbortController();
  let contentAbort = new AbortController(),
    tab = 'overview',
    generation = 0;
  const page = element('section', '', 'public-profile-page'),
    status = element('p', 'Carregando perfil público…', 'community-feedback');
  status.setAttribute('role', 'status');
  page.append(status);
  container.replaceChildren(page);
  async function read(path: string, signal = lifetime.signal) {
    const response = await fetchApi('public-profile/read', path, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    return readApiJson(response, 'public-profile/read');
  }
  function error(message: unknown): void {
    if (message instanceof ApiResponseError && message.failure === 'cancelled')
      return;
    if (
      !lifetime.signal.aborted &&
      !(message instanceof DOMException && message.name === 'AbortError')
    )
      status.textContent =
        message instanceof Error
          ? message.message
          : 'Perfil público indisponível.';
  }
  async function load(): Promise<void> {
    const name = publicHandle(handle),
      base = `/api/public-profiles/${encodeURIComponent(name)}`;
    const summary = profileSummary(await read(`${base}/page`));
    if (lifetime.signal.aborted) return;
    render(summary, base);
  }
  function render(summary: ProfileSummary, base: string): void {
    const header = element('header', '', 'public-profile-header'),
      banner = element('div', '', 'public-profile-banner'),
      identity = element('div', '', 'public-profile-identity'),
      avatar = element('div', '@', 'public-profile-avatar');
    if (summary.banner)
      showPublicAvatar(banner, {
        kind: 'profile-banner',
        target: summary.profile.id,
        reference: summary.banner,
        signal: lifetime.signal,
      });
    if (summary.profile.avatar) {
      avatar.textContent = '';
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: summary.profile.id,
        reference: summary.profile.avatar,
        signal: lifetime.signal,
      });
    }
    const title = element('div', '', 'public-profile-title'),
      actions = element('div', '', 'public-profile-actions');
    title.append(
      element('h1', `@${summary.profile.handle}`),
      element('p', `${summary.followers.toLocaleString('pt-BR')} seguidores`),
    );
    identity.append(avatar, title, actions);
    header.append(banner, identity);
    // Owner-written plain text: textContent only, never markup or links.
    if (summary.description)
      header.append(
        element('p', summary.description, 'public-profile-description'),
      );
    const layout = element('div', '', 'public-profile-layout'),
      timeline = element('section', '', 'public-profile-timeline'),
      sidebar = element('aside', '', 'public-profile-about'),
      tabs = element('nav', '', 'public-profile-tabs'),
      items = element('section', '', 'public-profile-activity community-scope'),
      paging = element('div', '', 'post-toolbar');
    tabs.setAttribute('aria-label', 'Atividade do perfil público');
    for (const [value, label] of [
      ['overview', 'Visão geral'],
      ['posts', 'Posts'],
      ['replies', 'Respostas'],
    ] as const) {
      const button = element('button', label);
      button.type = 'button';
      button.dataset['tab'] = value;
      button.addEventListener('click', () => {
        tab = value;
        void activity(null).catch(error);
      });
      tabs.append(button);
    }
    about(sidebar, summary);
    const communities = element('section', '', 'public-profile-communities');
    sidebar.append(communities);
    timeline.append(tabs, items, paging);
    layout.append(timeline, sidebar);
    page.replaceChildren(header, status, layout);
    status.textContent = '';
    link(
      actions,
      'Solicitar DM',
      `#comunidades?view=dms&dm=${summary.profile.id}`,
    );
    void follow(actions, summary).catch(error);
    void memberships(null).catch(error);
    void activity(null).catch(error);
    async function activity(after: string | null): Promise<void> {
      contentAbort.abort();
      contentAbort = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, contentAbort.signal]),
        old = ++generation;
      status.textContent = 'Carregando atividade…';
      const query = new URLSearchParams({ tab });
      if (after) query.set('after', after);
      const response = feedPage(
        await read(`${base}/activity?${query}`, signal),
      );
      if (signal.aborted || old !== generation) return;
      tabs
        .querySelectorAll('button')
        .forEach((button) =>
          button.setAttribute(
            'aria-current',
            String(button.dataset['tab'] === tab),
          ),
        );
      items.replaceChildren(
        ...response.items.map((entry) =>
          (options.renderEntry ?? renderActivityEntry)(entry, signal),
        ),
      );
      if (!response.items.length)
        items.append(
          element(
            'p',
            'Nenhuma publicação pública nesta aba.',
            'public-profile-empty',
          ),
        );
      paging.replaceChildren();
      if (response.next)
        control(paging, 'Próxima página', () => activity(response.next));
      if (after) control(paging, 'Voltar ao início', () => activity(null));
      status.textContent = '';
    }
    async function memberships(after: string | null): Promise<void> {
      const query = after ? `?after=${encodeURIComponent(after)}` : '';
      const response = communityPage(await read(`${base}/communities${query}`));
      if (lifetime.signal.aborted) return;
      communities.replaceChildren(element('h2', 'Comunidades'));
      for (const group of response.items)
        link(communities, group.name, `#comunidades?id=${group.id}`);
      if (!response.items.length)
        communities.append(element('p', 'Nenhuma comunidade seguida.'));
      if (response.next)
        control(communities, 'Mais comunidades', () =>
          memberships(response.next),
        );
      if (after)
        control(communities, 'Voltar ao início', () => memberships(null));
    }
  }
  function control(
    host: HTMLElement,
    label: string,
    work: () => Promise<void>,
  ): HTMLButtonElement {
    const button = element('button', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      void work()
        .catch(error)
        .finally(() => {
          if (!lifetime.signal.aborted) button.disabled = false;
        });
    });
    host.append(button);
    return button;
  }
  async function follow(
    host: HTMLElement,
    summary: ProfileSummary,
  ): Promise<void> {
    const controller = options.controller;
    if (!controller?.hasSession()) {
      link(host, 'Entrar para seguir', '#perfil');
      return;
    }
    await controller.refresh();
    if (lifetime.signal.aborted) return;
    if (!controller.profile) {
      link(host, 'Criar perfil para seguir', '#perfil');
      return;
    }
    if (controller.profile?.profile.id === summary.profile.id) {
      link(host, 'Editar perfil público', '#perfil');
      return;
    }
    let state: ProfileFollow = profileFollow(
      await controller.perform('follow-state', { target: summary.profile.id }),
    );
    if (lifetime.signal.aborted) return;
    const button = control(
      host,
      state.following ? 'Seguindo' : 'Seguir',
      async () => {
        state = profileFollow(
          await controller.perform('follow', {
            target: summary.profile.id,
            following: !state.following,
            revision: state.revision,
          }),
        );
        if (!lifetime.signal.aborted) {
          button.textContent = state.following ? 'Seguindo' : 'Seguir';
          button.setAttribute('aria-pressed', String(state.following));
        }
      },
    );
    button.setAttribute('aria-pressed', String(state.following));
  }
  void load().catch(error);
  return () => {
    lifetime.abort();
    contentAbort.abort();
    page.replaceChildren();
  };
}
