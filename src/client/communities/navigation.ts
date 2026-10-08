import { communityElement as el, communityLink as link } from './elements.ts';
import { iconLabel } from './presentation.ts';

export function communityNavigation(
  container: HTMLElement,
  options: { view: string; selected: string | null; signedIn: boolean },
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
  tools.setAttribute('aria-label', 'Acessos de comunidades');
  if (options.selected) link(tools, '← Feed', '#comunidades?view=feed');
  if (options.signedIn) {
    link(tools, 'Mensagens pelo @', '#comunidades?view=dms');
    iconLabel(tools.lastElementChild as HTMLElement, 'mail');
  }
  const menu = el('details', '', 'community-more'),
    summary = el('summary', 'Mais opções');
  iconLabel(summary, 'more');
  menu.append(summary);
  const choices = el('nav');
  choices.setAttribute('aria-label', 'Listas e gestão de comunidades');
  for (const [key, title] of [
    ['communities', 'Minhas comunidades'],
    ['following', 'Feed de seguidos'],
    ['saved', 'Salvos'],
    ['hidden', 'Ocultos'],
    ['replies', 'Respostas ao seu conteúdo'],
    ['managed', 'Gerenciar comunidades'],
    ['invitations', 'Transferências'],
    ['create', 'Criar comunidade'],
  ] as const) {
    if (options.signedIn) link(choices, title, `#comunidades?view=${key}`);
  }
  if (!options.signedIn) link(choices, 'Entrar pelo Perfil', '#perfil');
  menu.append(choices);
  tools.append(menu);
  container.append(tools);
}

export function communityDirectoryNavigation(
  container: HTMLElement,
  view: string,
  selected: string | null,
): void {
  const nav = el('nav', '', 'community-directory-nav');
  nav.setAttribute('aria-label', 'Navegação de comunidades');
  for (const [key, title, icon] of [
    ['feed', 'Feed geral', 'layers'],
    ['explore', 'Ranking', 'compass'],
  ] as const) {
    link(nav, title, `#comunidades?view=${key}`);
    const a = nav.lastElementChild as HTMLAnchorElement;
    iconLabel(a, icon);
    if (!selected && (view === key || (key === 'feed' && view === 'following')))
      a.setAttribute('aria-current', 'page');
  }
  container.append(nav, el('h2', 'Suas comunidades'));
}
