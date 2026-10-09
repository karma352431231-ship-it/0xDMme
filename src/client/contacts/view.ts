import { paintAvatar } from '../identity-display/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';

function searchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}
export function contactSearchMatches(text: string, query: string): boolean {
  return searchText(text).includes(searchText(query));
}

/** Filter only the current, already-loaded page. No discovery/network request. */
export function searchContacts<T extends Peer>(
  items: readonly T[],
  query: string,
): T[] {
  return items.filter((item) =>
    contactSearchMatches(
      `${item.name} ${item.address} ${item.ecosystem}`,
      query,
    ),
  );
}

/** Names and decrypted labels enter textContent, never an HTML template. */
export function contactRow(input: {
  title: string;
  detail: string;
  seed: string;
}): {
  row: HTMLLIElement;
  actions: HTMLDivElement;
} {
  const row = document.createElement('li'),
    avatar = document.createElement('span'),
    body = document.createElement('div'),
    title = document.createElement('strong'),
    detail = document.createElement('span'),
    actions = document.createElement('div');
  row.className = 'contact-row';
  avatar.className = 'contact-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  paintAvatar(avatar, { label: input.title, seed: input.seed });
  body.className = 'contact-row-body';
  title.textContent = input.title;
  detail.className = 'contact-row-detail';
  detail.textContent = input.detail;
  body.append(title, detail);
  actions.className = 'contact-row-actions';
  row.append(avatar, body, actions);
  return { row, actions };
}

export function contactMenu(
  actions: HTMLElement,
  name: string,
): HTMLDialogElement {
  const trigger = document.createElement('button'),
    menu = document.createElement('dialog'),
    heading = document.createElement('h3'),
    close = document.createElement('button');
  trigger.type = close.type = 'button';
  trigger.className = 'contact-menu-trigger';
  trigger.innerHTML = chatIcon('more');
  trigger.setAttribute('aria-label', `Opções de ${name}`);
  trigger.setAttribute('aria-haspopup', 'dialog');
  menu.className = 'contact-menu';
  menu.setAttribute('aria-label', `Opções de ${name}`);
  heading.textContent = name;
  close.textContent = 'Fechar';
  close.className = 'contact-menu-close';
  close.type = 'button';
  close.addEventListener('click', () => menu.close());
  trigger.addEventListener('click', () => menu.showModal());
  menu.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button'))
        menu.close();
    },
    { capture: true },
  );
  menu.append(heading, close);
  actions.append(trigger, menu);
  return menu;
}

export function emptyContacts(list: HTMLElement, text: string): void {
  const item = document.createElement('li');
  item.className = 'contact-empty';
  item.textContent = text;
  list.append(item);
}

export function selectContactTab(
  host: HTMLElement,
  group: string,
  tab: string,
): void {
  host
    .querySelectorAll<HTMLButtonElement>(`[data-contact-tab="${group}"]`)
    .forEach((button) => {
      const selected = button.dataset['tab'] === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  host
    .querySelectorAll<HTMLElement>(`[data-contact-panel="${group}"]`)
    .forEach((panel) => {
      panel.hidden = panel.dataset['tab'] !== tab;
    });
}

export function bindContactTabs(host: HTMLElement): void {
  host
    .querySelectorAll<HTMLButtonElement>('[data-contact-tab]')
    .forEach((button) => {
      const select = () =>
        selectContactTab(
          host,
          button.dataset['contactTab'] ?? '',
          button.dataset['tab'] ?? '',
        );
      button.addEventListener('click', select);
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const tabs = [
          ...host.querySelectorAll<HTMLButtonElement>(
            `[data-contact-tab="${button.dataset['contactTab']}"]`,
          ),
        ];
        const last = tabs.length - 1,
          current = tabs.indexOf(button);
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : (current + (event.key === 'ArrowLeft' ? last : 1)) %
                tabs.length;
        const next = tabs[index];
        if (!next || next.disabled) return;
        next.click();
        next.focus();
      });
    });
}
