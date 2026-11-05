import { t } from '../../shared/i18n/index.ts';
import { communityElement as el } from './elements.ts';

/** Matches the panel width in the phone filter row (communities/page-phone.css). */
const phonePanelWidth = 168;
const screenInset = 12;

/**
 * On phones the filter row scrolls sideways and would clip a panel inside it,
 * so that panel is fixed to the screen at the place computed here. Scrolling
 * or resizing would detach it from its button, so either one closes it.
 */
function anchorPanel(
  menu: HTMLDetailsElement,
  summary: HTMLElement,
  panel: HTMLElement,
): void {
  let listening: AbortController | null = null;
  summary.addEventListener('click', () => {
    const box = summary.getBoundingClientRect();
    const left = Math.min(
      box.left,
      window.innerWidth - phonePanelWidth - screenInset,
    );
    panel.style.setProperty('--discovery-menu-top', `${box.bottom + 6}px`);
    panel.style.setProperty(
      '--discovery-menu-left',
      `${Math.max(screenInset, left)}px`,
    );
  });
  menu.addEventListener('toggle', () => {
    listening?.abort();
    listening = null;
    if (!menu.open) return;
    const current = new AbortController();
    listening = current;
    const close = () => {
      current.abort();
      menu.open = false;
    };
    window.addEventListener('scroll', close, {
      capture: true,
      passive: true,
      signal: current.signal,
    });
    window.addEventListener('resize', close, { signal: current.signal });
  });
}

/** Compact menu for order/period choices; same values and validation as before. */
export function discoveryMenu(
  container: HTMLElement,
  label: string,
  selection: { value: string; options: readonly (readonly [string, string])[] },
  changed: (value: string) => void,
): HTMLDetailsElement {
  const menu = el('details', '', 'discovery-menu'),
    summary = el('summary'),
    value = el('span', '', 'discovery-menu-value'),
    options = el('div', '', 'discovery-menu-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', label);
  summary.append(value);
  menu.append(summary, options);
  anchorPanel(menu, summary, options);
  let current = selection.value;
  const show = () => {
    const title =
      selection.options.find(([key]) => key === current)?.[1] ?? current;
    value.textContent = title;
    summary.setAttribute('aria-label', t('{0}: {1}', [label, title]));
    options.querySelectorAll('button').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.value === current));
    });
  };
  const choose = (key: string) => {
    menu.open = false;
    if (key === current) return;
    current = key;
    show();
    changed(key);
  };
  for (const [key, title] of selection.options) {
    const option = el('button', title);
    option.type = 'button';
    option.value = key;
    option.addEventListener('click', () => choose(key));
    options.append(option);
  }
  show();
  container.append(menu);
  return menu;
}
export const feedOrders = [
  ['mixed', t('Highlights')],
  ['recent', t('Recent')],
  ['votes', t('Top voted')],
  ['replies', t('Most discussed')],
] as const;
export const discoveryPeriods = [
  ['day', t('24 hours')],
  ['week', t('7 days')],
  ['month', t('30 days')],
  ['all', t('All history')],
] as const;
