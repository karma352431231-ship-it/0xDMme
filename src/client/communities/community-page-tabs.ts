import { t } from '../../shared/i18n/index.ts';
import { communityElement as el } from './elements.ts';

/**
 * Posts and "About and rules" as tabs of a community page. Without anything to
 * say besides the posts there are no tabs. The hidden panel stays mounted, so
 * switching keeps the list and its scroll position.
 */
export function communityPageTabs(
  host: HTMLElement,
  panels: { posts: HTMLElement; about: HTMLElement | null },
): void {
  const { posts, about } = panels;
  if (!about) {
    host.append(posts);
    return;
  }
  const tabs = el('nav', '', 'community-page-tabs');
  tabs.setAttribute('aria-label', t('community.sections'));
  about.hidden = true;
  const buttons = [
    { label: t('Posts'), show: posts, hide: about },
    { label: t('About and community rules'), show: about, hide: posts },
  ].map(({ label, show, hide }, index) => {
    const button = el('button', label);
    button.type = 'button';
    button.setAttribute('aria-current', String(index === 0));
    button.addEventListener('click', () => {
      show.hidden = false;
      hide.hidden = true;
      for (const node of buttons)
        node.setAttribute('aria-current', String(node === button));
    });
    return button;
  });
  tabs.append(...buttons);
  host.append(tabs, posts, about);
}
