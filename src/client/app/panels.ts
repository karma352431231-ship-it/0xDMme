import { appAddress, navigateApp } from '../app-navigation/index.ts';
/** Desktop panel arrangement (docs/UI_PAINEIS_E_TEMAS.md); a device-only preference. */
import { appRoute } from '../../shared/app-routes/index.ts';
import {
  communityTarget,
  panelLayouts,
  splitTarget,
  splitHref,
  standalonePanelHref,
  samePanelTarget,
  isPlainNavigationClick,
} from './panel-route.ts';
import type {
  PanelLayout,
  CommunityTarget,
  PublicChatTarget,
} from './panel-route.ts';
export { communityTarget, panelLayouts } from './panel-route.ts';
export type { PanelLayout, CommunityTarget } from './panel-route.ts';
export const layoutPreferenceKey = '0xdmme:layout';
/** all: Contatos | Conversa | Feed · nochat: Contatos | Feed · solo: Contatos | Conversa. */

/** Attributes that mark clickable layout controls. */
export const panelControlAttributes = [
  'data-layout-mode',
  'data-chat-collapse',
  'data-chat-split',
  'data-feed-collapse',
  'data-scope-choice',
] as const;
export const panelControlSelector = panelControlAttributes
  .map((name) => `[${name}]`)
  .join(', ');
/**
 * State written on the app shell. The click handler matches ancestors with
 * `closest()`, so a shell state attribute must never also mark a control.
 */
export const shellStateAttributes = [
  'data-layout',
  'data-contact-scope',
  'data-chat-scope',
] as const;

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function storedLayout(storage: PreferenceStorage): PanelLayout {
  try {
    const value = storage.getItem(layoutPreferenceKey);
    return panelLayouts.find((layout) => layout === value) ?? 'all';
  } catch {
    return 'all';
  }
}

/** Opening any conversation brings the chat column back; the feed stays as chosen. */
export function withChat(layout: PanelLayout): PanelLayout {
  return layout === 'nochat' ? 'all' : layout;
}

/** The “Conversa ao lado” toggle only switches the chat column. */
export function toggledChat(layout: PanelLayout): PanelLayout {
  return layout === 'nochat' ? 'all' : 'nochat';
}

/** Community operations the workspace needs; the module keeps its own state and requests. */
export interface PanelCommunities {
  mountFeed: (container: HTMLElement, params: URLSearchParams) => void;
  leaveFeed: () => void;
  openDm: (container: HTMLElement, id: string | null, local: boolean) => void;
  closeDm: () => void;
  dmDirectory: (node: HTMLElement, valid: () => boolean) => Promise<void>;
  /** Compact public profile in the feed panel; returns its closer. */
  showProfile: (container: HTMLElement, handle: string) => () => void;
}

type Scope = 'private' | 'public';

/**
 * Desktop workspace: Contatos | Conversa | Feed with a collapsible chat column.
 * Below 1280 px the feed stays on its own page; below 701 px mobile navigation is unchanged.
 */
export function startPanels(input: {
  shell: HTMLElement;
  feedBody: HTMLElement;
  publicChat: HTMLElement;
  publicDirectory: HTMLElement;
  communities: PanelCommunities;
  /** A public conversation opened: the right column shows Chat again. */
  publicChatOpened: () => void;
}) {
  const { shell, feedBody, publicChat, publicDirectory, communities } = input;
  const wide = matchMedia('(min-width: 1280px)');
  const split = matchMedia('(min-width: 701px)');
  let layout: PanelLayout = storedLayout(localStorage);
  let page = '';
  let feedMounted = false;
  let feedParams = new URLSearchParams('view=feed');
  let closeProfile: (() => void) | null = null;
  let directoryGeneration = 0;
  let panelTarget: CommunityTarget = { kind: 'feed', params: feedParams };
  let publicTarget: PublicChatTarget | null = null;

  function save(next: PanelLayout): void {
    layout = next;
    try {
      localStorage.setItem(layoutPreferenceKey, next);
    } catch {
      // The arrangement still applies to this visit; nothing private depends on it.
    }
    apply();
  }
  function feedVisible(): boolean {
    return page === 'conversas' && wide.matches && layout !== 'solo';
  }
  function apply(): void {
    shell.dataset['layout'] = layout;
    shell
      .querySelectorAll<HTMLButtonElement>('[data-layout-mode]')
      .forEach((button) => {
        const mode = button.dataset['layoutMode'];
        const current =
          page === 'conversas' &&
          (mode === layout || (mode === 'all' && layout === 'nochat'));
        button.setAttribute('aria-pressed', String(current));
      });
    shell
      .querySelectorAll<HTMLButtonElement>('[data-chat-split]')
      .forEach((button) => {
        button.setAttribute('aria-pressed', String(layout !== 'nochat'));
      });
    if (feedVisible() && !feedMounted) {
      feedMounted = true;
      if (panelTarget.kind === 'profile') showProfile(panelTarget.handle);
      else showFeed(feedParams);
    } else if (!feedVisible() && feedMounted) {
      feedMounted = false;
      leaveProfile();
      communities.leaveFeed();
      feedBody.replaceChildren();
    }
  }
  function leaveProfile(): void {
    closeProfile?.();
    closeProfile = null;
  }
  function showFeed(params: URLSearchParams): void {
    leaveProfile();
    feedParams = params;
    panelTarget = { kind: 'feed', params };
    communities.mountFeed(feedBody, params);
    markFeedTab();
  }
  /** The profile replaces the feed in the panel; the chat column stays as it is. */
  function showProfile(handle: string): void {
    leaveProfile();
    communities.leaveFeed();
    closeProfile = communities.showProfile(feedBody, handle);
    panelTarget = { kind: 'profile', handle };
    markFeedTab(null);
  }
  function setScope(scope: Scope): void {
    shell.dataset['contactScope'] = scope;
    shell
      .querySelectorAll<HTMLButtonElement>('[data-scope-choice]')
      .forEach((button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset['scopeChoice'] === scope),
        );
      });
    if (scope === 'public') void renderPublicDirectory();
  }
  async function renderPublicDirectory(): Promise<void> {
    const generation = ++directoryGeneration;
    publicDirectory.replaceChildren();
    await communities.dmDirectory(
      publicDirectory,
      () => generation === directoryGeneration,
    );
  }
  function openPublic(id: string | null, local: boolean): void {
    publicTarget = { id, local };
    shell.dataset['chatScope'] = 'public';
    communities.openDm(publicChat, id, local);
    input.publicChatOpened();
    save(withChat(layout));
  }
  function closePublic(): void {
    if (shell.dataset['chatScope'] === 'public') communities.closeDm();
    publicTarget = null;
    shell.dataset['chatScope'] = 'private';
  }
  function restorePublic(dm: PublicChatTarget | null): void {
    if (!dm) {
      closePublic();
      return;
    }
    if (!split.matches) return;
    if (dm.id !== publicTarget?.id || dm.local !== publicTarget.local)
      openPublic(dm.id, dm.local);
  }
  function readPanelRoute(): ReturnType<typeof splitTarget> | false {
    const standalone = standalonePanelHref(
      appAddress(),
      wide.matches,
      split.matches,
    );
    if (standalone) {
      navigateApp(standalone);
      return false;
    }
    const target = splitTarget(appAddress());
    if (target) layout = target.layout;
    else if (appRoute(appAddress())?.params.get('layout') === 'chat')
      layout = 'solo';
    if (target) {
      panelTarget = target.target;
      if (target.target.kind === 'feed') feedParams = target.target.params;
    }
    return target;
  }
  function click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    // The "Arquivadas" row mirrors the archived chip, which owns the filter.
    if (event.target.closest('[data-archived-shortcut]')) {
      shell
        .querySelector<HTMLButtonElement>(
          '.directory-filters [data-conversation-filter="archived"]',
        )
        ?.click();
      return;
    }
    const control = event.target.closest<HTMLElement>(panelControlSelector);
    if (control) {
      layoutControl(control);
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>(
      'a[href^="/communities"], a[href^="/users"], a[href^="#comunidades"], a[href^="#publico"], a[href^="#communities"], a[href^="#users"]',
    );
    if (link && !isPlainNavigationClick(event)) return;
    if (link && page === 'conversas' && openInPanel(link))
      event.preventDefault();
  }
  /** Keeps community links inside the workspace instead of leaving the chat. */
  function openInPanel(link: HTMLAnchorElement): boolean {
    const target = communityTarget(link.getAttribute('href') ?? '');
    if (!target) return false;
    if (target.kind === 'dm') return openDmInPanel(target);
    if (!feedMounted) return false;
    // A profile opens beside the chat from the feed or from a public DM.
    if (target.kind === 'profile') {
      navigateApp(
        splitHref({
          layout: withChat(layout),
          target,
          dm: publicTarget,
        }),
      );
      return true;
    }
    if (!feedBody.contains(link) && !link.hasAttribute('data-feed-tab'))
      return false;
    navigateApp(splitHref({ layout, target, dm: publicTarget }));
    return true;
  }
  function openDmInPanel(target: {
    id: string | null;
    local: boolean;
  }): boolean {
    if (!split.matches) return false;
    openPublic(target.id, target.local);
    navigateApp(
      splitHref({
        layout: withChat(layout),
        target: panelTarget,
        dm: publicTarget,
      }),
    );
    return true;
  }
  /** `null` marks no tab: the panel shows a profile, not a feed section. */
  function markFeedTab(params: URLSearchParams | null = feedParams): void {
    const view =
      !params || params.has('id') || params.has('slug')
        ? ''
        : (params.get('view') ?? 'feed');
    const tab = view === 'following' ? 'feed' : view;
    shell
      .querySelectorAll<HTMLAnchorElement>('[data-feed-tab]')
      .forEach((link) => {
        if (link.dataset['feedTab'] === tab)
          link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
  }
  function layoutControl(control: HTMLElement): void {
    const scope = control.dataset['scopeChoice'];
    if (scope === 'private' || scope === 'public') {
      setScope(scope);
      return;
    }
    const mode = control.dataset['layoutMode'];
    if (mode === 'all' || mode === 'solo') {
      navigateApp(
        splitHref({
          layout: mode,
          target: panelTarget,
          dm: publicTarget,
        }),
      );
      return;
    }
    let next = layout;
    if (control.hasAttribute('data-chat-collapse')) next = 'nochat';
    else if (control.hasAttribute('data-chat-split'))
      next = toggledChat(layout);
    else if (control.hasAttribute('data-feed-collapse')) next = 'solo';
    navigateApp(
      splitHref({
        layout: next,
        target: panelTarget,
        dm: publicTarget,
      }),
    );
  }
  document.addEventListener('click', click);
  wide.addEventListener('change', apply);
  setScope('private');
  shell.dataset['chatScope'] = 'private';
  apply();
  function publishAddress(): void {
    if (
      !wide.matches ||
      splitTarget(appAddress()) ||
      page !== 'conversas' ||
      layout === 'solo'
    )
      return;
    history.replaceState(
      null,
      '',
      splitHref({ layout, target: panelTarget, dm: publicTarget }),
    );
  }
  return {
    /** A resolved public name updates the remembered route without remounting drafts. */
    canonicalized(address: string): void {
      const route = splitTarget(address);
      if (!route) return;
      panelTarget = route.target;
      if (route.target.kind === 'feed') feedParams = route.target.params;
    },
    /** Called after each route; the route already left any feed it had mounted. */
    routed(next: string): void {
      const previous = panelTarget,
        previousPage = page;
      const target = readPanelRoute();
      if (target === false) return;
      page = next;
      if (previousPage !== page || !samePanelTarget(previous, panelTarget)) {
        feedMounted = false;
        leaveProfile();
      }
      if (page !== 'conversas') closePublic();
      save(layout);
      if (target) restorePublic(target.dm);
      publishAddress();
      if (page === 'conversas' && shell.dataset['contactScope'] === 'public')
        void renderPublicDirectory();
    },
    /** A private chat or group was opened from the list or from elsewhere. */
    privateChatOpened(): void {
      publicTarget = null;
      if (shell.dataset['chatScope'] === 'public') communities.closeDm();
      shell.dataset['chatScope'] = 'private';
      save(withChat(layout));
      const href = wide.matches
        ? splitHref({ layout, target: panelTarget, dm: null })
        : '#chats';
      if (appAddress() !== href) navigateApp(href);
    },
    sessionChanged(): void {
      if (shell.dataset['contactScope'] === 'public')
        void renderPublicDirectory();
    },
  };
}
