import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { communityPage } from '../../shared/communities/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { communityAvatar } from '../communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

// Photos shown before the “+N” control in the compact row.
const compactCount = 5;

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
function button(text: string, className: string): HTMLButtonElement {
  const node = element('button', text, className);
  node.type = 'button';
  return node;
}

/**
 * Communities followed by a public profile: a row of photos (up to five and a
 * “+N” that expands) and, expanded, the full list with names, read page by
 * page from the public endpoint as the person asks for more.
 */
export function profileCommunities(
  host: HTMLElement,
  input: {
    total: number;
    read: (after: string | null) => Promise<unknown>;
    signal: AbortSignal;
    error: (error: unknown) => void;
  },
): void {
  const { read, signal, error } = input;
  const compact = element('div', '', 'profile-communities-compact'),
    list = element('ul', '', 'profile-communities-list'),
    footer = element('div', '', 'profile-communities-footer'),
    more = button(t('Mais comunidades'), 'profile-communities-more'),
    less = button(t('Mostrar menos'), 'profile-communities-less'),
    toggle = button('', 'profile-communities-toggle');
  footer.append(more, less);
  list.hidden = footer.hidden = true;
  host.replaceChildren(element('h2', t('Comunidades')), compact, list, footer);
  const loaded: Community[] = [];
  let next: string | null = null;
  const avatar = (group: Community) => {
    const node = communityAvatar(group.name);
    if (group.avatar)
      showPublicAvatar(node, {
        kind: 'community-photo',
        target: group.id,
        reference: group.avatar,
        signal,
      });
    return node;
  };
  function expand(open: boolean): void {
    if (open && !list.childElementCount)
      list.append(...loaded.map((group) => row(group, avatar(group))));
    list.hidden = footer.hidden = !open;
    compact.hidden = open;
    more.hidden = next === null;
    toggle.setAttribute('aria-expanded', String(open));
    (open ? less : toggle).focus();
  }
  function fillCompact(total: number): void {
    if (!loaded.length) {
      compact.append(element('p', t('Nenhuma comunidade seguida.')));
      return;
    }
    for (const group of loaded.slice(0, compactCount)) {
      const link = element('a', '', 'profile-community-photo');
      link.href = `#communities?id=${group.id}`;
      link.title = group.name;
      link.setAttribute('aria-label', group.name);
      link.append(avatar(group));
      compact.append(link);
    }
    const hidden = total - Math.min(loaded.length, compactCount);
    toggle.textContent =
      hidden > 0
        ? `+${hidden.toLocaleString(currentLanguage())}`
        : t('Ver nomes');
    toggle.setAttribute(
      'aria-label',
      t('Ver a lista das {0} comunidades', [
        total.toLocaleString(currentLanguage()),
      ]),
    );
    toggle.setAttribute('aria-expanded', 'false');
    compact.append(toggle);
  }
  async function page(after: string | null): Promise<void> {
    const response = communityPage(await read(after));
    if (signal.aborted) return;
    next = response.next;
    loaded.push(...response.items);
    // The summary count can lag a follow made a moment ago.
    if (after === null) fillCompact(Math.max(input.total, loaded.length));
    else
      list.append(...response.items.map((group) => row(group, avatar(group))));
    more.hidden = next === null;
  }
  toggle.addEventListener('click', () => expand(true));
  less.addEventListener('click', () => expand(false));
  more.addEventListener('click', () => {
    if (more.disabled || next === null) return;
    more.disabled = true;
    void page(next)
      .catch(error)
      .finally(() => {
        if (!signal.aborted) more.disabled = false;
      });
  });
  void page(null).catch(error);
}

function row(group: Community, avatar: HTMLElement): HTMLLIElement {
  const item = element('li');
  const link = element('a', '', 'profile-community-row');
  link.href = `#communities?id=${group.id}`;
  link.append(avatar, element('span', group.name));
  item.append(link);
  return item;
}
