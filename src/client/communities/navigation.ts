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
    const back = link(tools, t('Back to feed'), '#communities?view=feed');
    back.classList.add('feed-back-link');
    iconLabel(back, 'back');
  }
  const menu = el('details', '', 'community-more'),
    summary = el('summary', t('More options'));
  iconLabel(summary, 'more');
  menu.append(summary);
  menu.append(moreChoices(options));
  tools.append(menu);
  if (options.signedIn) tools.append(createCommunityButton());
  container.append(tools);
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
    ['invitations', t('Transfers'), 'transfer'],
  ] as const)
    iconLabel(link(choices, title, `#communities?view=${key}`), icon);
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

export function communityDirectoryNavigation(
  container: HTMLElement,
  view: string,
  selected: string | null,
): void {
  const head = el('header', '', 'community-directory-head');
  head.append(el('h2', t('Communities')));
  const tabs = el('nav', '', 'community-directory-tabs');
  tabs.setAttribute('aria-label', t('Communities or handle messages'));
  for (const [key, title] of [
    ['feed', t('Communities')],
    ['dms', t('Handle messages')],
  ] as const) {
    link(tabs, title, `#communities?view=${key}`);
    if ((view === 'dms') === (key === 'dms'))
      tabs.lastElementChild?.setAttribute('aria-current', 'page');
  }
  const nav = el('nav', '', 'community-directory-nav');
  nav.setAttribute('aria-label', t('Community navigation'));
  for (const [key, title, icon] of [
    ['feed', t('Feed'), 'layers'],
    ['explore', t('Ranking'), 'compass'],
  ] as const) {
    link(nav, title, `#communities?view=${key}`);
    const a = nav.lastElementChild as HTMLAnchorElement;
    iconLabel(a, icon);
    if (!selected && (view === key || (key === 'feed' && view === 'following')))
      a.setAttribute('aria-current', 'page');
  }
  container.append(
    head,
    tabs,
    nav,
    el('h2', view === 'dms' ? t('Handle messages') : t('Following')),
  );
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
