import { communitySlug } from '../../shared/community-address/index.ts';
import { uuid } from '../../shared/account/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { communityElement as el, communityLink as link } from './elements.ts';
import { iconLabel } from './presentation.ts';

export function communityNavigation(
  container: HTMLElement,
  options: {
    view: string;
    selected: string | null;
    signedIn: boolean;
    /** Community whose settings the person may open (owner or moderator). */
    manage?: string | null;
    /** The kept way back to the feed position, when this page was opened from it. */
    back?: string | null;
    /** The community on screen once known: names the bar and receives new posts. */
    page?: { id: string; name: string } | null;
  },
): void {
  const active = options.selected ? 'communities' : options.view;
  document
    .querySelectorAll<HTMLAnchorElement>('[data-community-view]')
    .forEach((a) => {
      const current =
        a.dataset['communityView'] ===
        (active === 'following' ? 'feed' : active);
      if (current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  // Creating has its own back arrow and no list menu.
  if (options.view === 'create') return;
  const tools = el('nav', '', 'community-tools');
  tools.setAttribute('aria-label', t('Community access'));
  if (options.selected) {
    const back = link(
      tools,
      t('Back to feed'),
      options.back ?? '#communities?view=feed',
    );
    back.classList.add('feed-back-link');
    iconLabel(back, 'back');
  }
  const menu = el('details', '', 'community-more'),
    summary = el('summary', t('More options'));
  iconLabel(summary, 'more');
  menu.append(summary);
  menu.append(moreChoices(options));
  if (options.page)
    tools.append(el('span', options.page.name, 'community-page-title'));
  tools.append(menu);
  tools.append(
    options.page ? composeHereButton(options.page.id) : createCommunityButton(),
  );
  container.append(tools);
}

/** Inside a community the "+" writes there at once; creating stays in the feed. */
function composeHereButton(community: string): HTMLElement {
  const holder = el('div', '', 'community-create-menu');
  const button = el('button', '', 'community-create-fab');
  button.type = 'button';
  button.dataset['communityCompose'] = community;
  button.setAttribute('aria-label', t('community.post-action'));
  button.title = t('community.post-action');
  iconLabel(button, 'plus');
  holder.append(button);
  return holder;
}

/**
 * Lists in "⋯". My communities and the following feed are left out: the Mine
 * tab and the Following chip already lead there.
 */
function moreChoices(options: {
  signedIn: boolean;
  manage?: string | null;
}): HTMLElement {
  const choices = el('nav');
  choices.setAttribute('aria-label', t('Community lists and management'));
  if (options.manage)
    iconLabel(
      link(
        choices,
        t('Manage community'),
        `#communities?id=${options.manage}&view=manage`,
      ),
      'shield',
    );
  if (!options.signedIn) {
    link(choices, t('Sign in through Profile'), '#settings');
    return choices;
  }
  for (const [key, title, icon] of [
    ['saved', t('Saved'), 'bookmark'],
    ['hidden', t('Hidden'), 'hide'],
    ['replies', t('Replies to your content'), 'reply'],
    ['invitations', t('Ownership requests'), 'transfer'],
  ] as const) {
    const choice = link(choices, title, `#communities?view=${key}`);
    iconLabel(choice, icon);
    // The side menu lists Saved wherever it is on screen (community-actions.css).
    if (key === 'saved') choice.classList.add('community-more-saved');
  }
  return choices;
}

/**
 * The floating "+" opens two choices: post (same composer trigger the old
 * Post button used) or create a community. CSS places it bottom-right.
 */
function createCommunityButton(): HTMLDetailsElement {
  const menu = el('details', '', 'community-create-menu');
  menu.dataset['transientMenu'] = '';
  const summary = el('summary', '', 'community-create-fab');
  summary.setAttribute('aria-label', t('community.create-menu'));
  summary.title = t('community.create-menu');
  iconLabel(summary, 'plus');
  const choices = el('div', '', 'community-create-choices');
  const post = el(
    'button',
    t('community.post-action'),
    'community-create-choice',
  );
  post.type = 'button';
  post.dataset['communityCompose'] = '';
  iconLabel(post, 'pencil');
  const create = el('a', t('Create community'), 'community-create-choice');
  create.href = '#communities?view=create';
  iconLabel(create, 'community');
  choices.append(post, create);
  // A choice closes the menu; the composer or the create page takes over.
  choices.addEventListener('click', () => {
    menu.open = false;
  });
  menu.append(summary, choices);
  return menu;
}

/** Sidebar head, then any section drawn by `above`, then the list heading. */
export function communityDirectoryNavigation(
  container: HTMLElement,
  view: string,
  selected: string | null,
  above?: () => void,
): void {
  const head = el('header', '', 'community-directory-head');
  head.append(el('h2', t('Communities')));
  container.append(head, directoryLinks(view, selected));
  above?.();
  container.append(
    el('h2', view === 'dms' ? t('Handle messages') : t('Following')),
  );
}
/**
 * X-style side menu (owner request, 20/11/2026): only destinations with no
 * other place on this screen. Ranking stays for windows without the ranking
 * sidebar; Activity also sits in the rail, but the owner wants it here too.
 */
function directoryDestinations() {
  return [
    ['feed', t('Feed'), 'layers', '#communities?view=feed'],
    ['dms', t('Handle messages'), 'mail', '#communities?view=dms'],
    ['saved', t('Saved'), 'bookmark', '#communities?view=saved'],
    ['activity', t('Notifications'), 'bell', '#activity'],
    ['explore', t('Ranking'), 'compass', '#communities?view=explore'],
  ] as const;
}
function directoryLinks(view: string, selected: string | null): HTMLElement {
  const nav = el('nav', '', 'community-directory-nav');
  nav.setAttribute('aria-label', t('Community navigation'));
  for (const [key, title, icon, address] of directoryDestinations()) {
    const a = link(nav, title, address);
    iconLabel(a, icon);
    // Hidden where the ranking sidebar is on screen (page-wide.css).
    if (key === 'explore') a.classList.add('community-ranking-link');
    if (!selected && (view === key || (key === 'feed' && view === 'following')))
      a.setAttribute('aria-current', 'page');
  }
  return nav;
}

/** Where the arrow of an opened post leads: the list the reader came from, else its community. */
export function postReturnTarget(
  lastList: string | null,
  community: string,
): string {
  return lastList
    ? `#communities?${lastList}`
    : `#communities?id=${encodeURIComponent(community)}`;
}

const communityViews = new Set([
  'followers',
  'dms',
  'explore',
  'feed',
  'saved',
  'hidden',
  'communities',
  'following',
  'manage',
  'invitations',
  'create',
  'replies',
]);
/**
 * Known screens only; unknown links fall back to the feed. Settings belong to
 * one community, so `manage` without a community also opens the feed.
 */
export function communityView(view: string, selected: string | null): string {
  if (!communityViews.has(view)) return 'feed';
  return ['manage', 'followers'].includes(view) && !selected ? 'feed' : view;
}

/** Keep public address names distinct from IDs before their first lookup. */
export function communitySelection(params: URLSearchParams): {
  selected: string | null;
  slug: string | null;
} {
  const slug = params.get('slug');
  if (slug !== null) {
    const value = communitySlug(slug);
    return { selected: value, slug: value };
  }
  return {
    selected: params.has('id') ? uuid(params.get('id')) : null,
    slug: null,
  };
}
