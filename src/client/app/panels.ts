/** Desktop panel arrangement (docs/UI_PAINEIS_E_TEMAS.md); a device-only preference. */
export const layoutPreferenceKey = '0xdmme:layout';
export const panelLayouts = ['all', 'nochat', 'solo'] as const;
/** all: Contatos | Conversa | Feed · nochat: Contatos | Feed · solo: Contatos | Conversa. */
export type PanelLayout = (typeof panelLayouts)[number];

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

export type CommunityTarget =
  | { kind: 'dm'; id: string | null; local: boolean }
  | { kind: 'feed'; params: URLSearchParams };

/** Reads in-app community links so panels can open them without leaving the workspace. */
export function communityTarget(href: string): CommunityTarget | null {
  const [path, query = ''] = href.split('?');
  if (path !== '#comunidades') return null;
  const params = new URLSearchParams(query);
  if (params.get('view') === 'dms')
    return {
      kind: 'dm',
      id: params.get('dm'),
      local: params.get('history') === 'local',
    };
  return { kind: 'feed', params };
}

/** Community operations the workspace needs; the module keeps its own state and requests. */
export interface PanelCommunities {
  mountFeed: (container: HTMLElement, params: URLSearchParams) => void;
  leaveFeed: () => void;
  openDm: (container: HTMLElement, id: string | null, local: boolean) => void;
  closeDm: () => void;
  dmDirectory: (node: HTMLElement, valid: () => boolean) => Promise<void>;
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
}) {
  const { shell, feedBody, publicChat, publicDirectory, communities } = input;
  const wide = matchMedia('(min-width: 1280px)');
  const split = matchMedia('(min-width: 701px)');
  let layout: PanelLayout = storedLayout(localStorage);
  let page = '';
  let feedMounted = false;
  let feedParams = new URLSearchParams('view=feed');
  let directoryGeneration = 0;

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
      communities.mountFeed(feedBody, feedParams);
      markFeedTab();
    } else if (!feedVisible() && feedMounted) {
      feedMounted = false;
      communities.leaveFeed();
      feedBody.replaceChildren();
    }
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
    shell.dataset['chatScope'] = 'public';
    communities.openDm(publicChat, id, local);
    save(withChat(layout));
  }
  function click(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(panelControlSelector);
    if (control) {
      layoutControl(control);
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>(
      'a[href^="#comunidades"]',
    );
    if (link && page === 'conversas' && openInPanel(link))
      event.preventDefault();
  }
  /** Keeps community links inside the workspace instead of leaving the chat. */
  function openInPanel(link: HTMLAnchorElement): boolean {
    const target = communityTarget(link.getAttribute('href') ?? '');
    if (target?.kind === 'dm' && split.matches) {
      openPublic(target.id, target.local);
      return true;
    }
    const inPanel =
      feedBody.contains(link) || link.hasAttribute('data-feed-tab');
    if (target?.kind !== 'feed' || !feedMounted || !inPanel) return false;
    feedParams = target.params;
    communities.mountFeed(feedBody, feedParams);
    markFeedTab();
    return true;
  }
  function markFeedTab(): void {
    const view = feedParams.has('id') ? '' : (feedParams.get('view') ?? 'feed');
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
      save(mode);
      if (page !== 'conversas') location.hash = '#conversas';
    } else if (control.hasAttribute('data-chat-collapse')) save('nochat');
    else if (control.hasAttribute('data-chat-split')) save(toggledChat(layout));
    else if (control.hasAttribute('data-feed-collapse')) save('solo');
  }
  document.addEventListener('click', click);
  wide.addEventListener('change', apply);
  setScope('private');
  shell.dataset['chatScope'] = 'private';
  apply();
  return {
    /** Called after each route; the route already left any feed it had mounted. */
    routed(next: string): void {
      page = next;
      feedMounted = false;
      if (page !== 'conversas' && shell.dataset['chatScope'] === 'public') {
        // A hidden public chat must not keep polling after leaving the workspace.
        communities.closeDm();
        shell.dataset['chatScope'] = 'private';
      }
      apply();
      if (page === 'conversas' && shell.dataset['contactScope'] === 'public')
        void renderPublicDirectory();
    },
    /** A private chat or group was opened from the list or from elsewhere. */
    privateChatOpened(): void {
      if (shell.dataset['chatScope'] === 'public') communities.closeDm();
      shell.dataset['chatScope'] = 'private';
      save(withChat(layout));
    },
    sessionChanged(): void {
      if (shell.dataset['contactScope'] === 'public')
        void renderPublicDirectory();
    },
  };
}
