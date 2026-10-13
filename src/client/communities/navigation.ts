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
  const tools = el('nav', '', 'community-tools');
  tools.setAttribute('aria-label', t('Acessos de comunidades'));
  if (options.selected) link(tools, t('← Feed'), '#comunidades?view=feed');
  const menu = el('details', '', 'community-more'),
    summary = el('summary', t('Mais opções'));
  iconLabel(summary, 'more');
  menu.append(summary);
  const choices = el('nav');
  choices.setAttribute('aria-label', t('Listas e gestão de comunidades'));
  if (options.manage)
    link(
      choices,
      t('Gerenciar comunidade'),
      `#comunidades?id=${options.manage}&view=manage`,
    );
  for (const [key, title] of [
    ['communities', t('Minhas comunidades')],
    ['following', t('Feed de seguidos')],
    ['saved', t('Salvos')],
    ['hidden', t('Ocultos')],
    ['replies', t('Respostas ao seu conteúdo')],
    ['invitations', t('Transferências')],
    ['create', t('Criar comunidade')],
  ] as const) {
    if (options.signedIn) link(choices, title, `#comunidades?view=${key}`);
  }
  if (!options.signedIn) link(choices, t('Entrar pelo Perfil'), '#perfil');
  menu.append(choices);
  tools.append(menu);
  container.append(tools);
}

export function communityDirectoryNavigation(
  container: HTMLElement,
  view: string,
  selected: string | null,
): void {
  const head = el('header', '', 'community-directory-head');
  head.append(el('h2', t('Comunidades')));
  link(head, '', '#comunidades?view=create');
  const create = head.lastElementChild as HTMLAnchorElement;
  create.className = 'icon-button';
  create.setAttribute('aria-label', t('Criar comunidade'));
  create.title = t('Criar comunidade');
  iconLabel(create, 'plus');
  const tabs = el('nav', '', 'community-directory-tabs');
  tabs.setAttribute('aria-label', t('Comunidades ou mensagens pelo @'));
  for (const [key, title] of [
    ['feed', t('Comunidades')],
    ['dms', t('Mensagens @')],
  ] as const) {
    link(tabs, title, `#comunidades?view=${key}`);
    if ((view === 'dms') === (key === 'dms'))
      tabs.lastElementChild?.setAttribute('aria-current', 'page');
  }
  const nav = el('nav', '', 'community-directory-nav');
  nav.setAttribute('aria-label', t('Navegação de comunidades'));
  for (const [key, title, icon] of [
    ['feed', t('Feed'), 'layers'],
    ['explore', t('Ranking'), 'compass'],
  ] as const) {
    link(nav, title, `#comunidades?view=${key}`);
    const a = nav.lastElementChild as HTMLAnchorElement;
    iconLabel(a, icon);
    if (!selected && (view === key || (key === 'feed' && view === 'following')))
      a.setAttribute('aria-current', 'page');
  }
  container.append(
    head,
    tabs,
    nav,
    el('h2', view === 'dms' ? t('Mensagens @') : t('Seguidas')),
  );
}

/** Where the arrow of an opened post leads: the list the reader came from, else its community. */
export function postReturnTarget(
  lastList: string | null,
  community: string,
): string {
  return lastList
    ? `#comunidades?${lastList}`
    : `#comunidades?id=${encodeURIComponent(community)}`;
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
