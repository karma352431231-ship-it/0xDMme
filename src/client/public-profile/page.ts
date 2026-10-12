import { profileSocialControls } from './social-controls.ts';
import { publicBlockState } from '../../shared/profile-social/index.ts';
import type { PublicBlockState } from '../../shared/profile-social/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../api-response/index.ts';
import { publicHandle } from '../../shared/public-profile/index.ts';
import { profileSummary } from '../../shared/profile-social/index.ts';
import type { ProfileSummary } from '../../shared/profile-social/index.ts';
import { feedPage } from '../../shared/community-discovery/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { profileCommunities } from './communities-panel.ts';
import { renderActivityEntry } from '../communities/index.ts';
import type { PublicProfiles } from './controller.ts';
import { editPublicProfileHash } from './follow.ts';

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
    let block: PublicBlockState = { blocked: false, revision: 0 };
    const controller = options.controller;
    if (controller?.hasSession()) {
      await controller.refresh();
      if (
        controller.profile &&
        controller.profile.profile.id !== summary.profile.id
      )
        block = publicBlockState(
          await controller.perform('block-state', {
            target: summary.profile.id,
          }),
        );
    }
    if (!lifetime.signal.aborted) render(summary, base, block);
  }
  function render(
    summary: ProfileSummary,
    base: string,
    block: PublicBlockState,
  ): void {
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
        if (block.blocked) {
          contentAbort.abort();
          timeline.replaceChildren(
            element(
              'p',
              'Este usuário está bloqueado. Suas publicações e respostas ficam ocultas para você.',
            ),
          );
        } else void activity(null).catch(error);
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
    if (!block.blocked)
      link(
        actions,
        'Solicitar DM',
        `#comunidades?view=dms&dm=${summary.profile.id}`,
      );
    void follow(actions, summary, block).catch(error);
    profileCommunities(communities, {
      total: summary.communities,
      read: (after) =>
        read(
          `${base}/communities${after ? `?after=${encodeURIComponent(after)}` : ''}`,
        ),
      signal: lifetime.signal,
      error,
    });
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
        options.controller?.profile
          ? await options.controller.perform('activity', {
              target: summary.profile.id,
              tab,
              after,
            })
          : await read(`${base}/activity?${query}`, signal),
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
    block: PublicBlockState,
  ): Promise<void> {
    const controller = options.controller;
    if (!controller?.hasSession()) {
      link(host, 'Entrar para seguir', '#perfil');
      return;
    }
    if (!controller.profile) await controller.refresh();
    if (lifetime.signal.aborted) return;
    if (!controller.profile) {
      link(host, 'Criar perfil para seguir', '#perfil');
      return;
    }
    if (controller.profile.profile.id === summary.profile.id) {
      link(host, 'Editar perfil público', editPublicProfileHash);
      return;
    }
    await profileSocialControls(host, summary, {
      controller,
      signal: lifetime.signal,
      error,
      block,
      changed: load,
    });
  }
  void load().catch(error);
  return () => {
    lifetime.abort();
    contentAbort.abort();
    page.replaceChildren();
  };
}
