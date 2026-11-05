import { communityHref } from '../../shared/app-routes/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { communityPage } from '../../shared/communities/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { communityAvatar } from '../communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

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

/** The Communities tab: a named list, one server page at a time. */
export function profileCommunities(
  host: HTMLElement,
  input: {
    read: (after: string | null) => Promise<unknown>;
    signal: AbortSignal;
    error: (error: unknown) => void;
  },
): void {
  const { read, signal, error } = input;
  const list = element('ul', '', 'profile-communities-list'),
    more = element('button', t('More communities'), 'profile-communities-more');
  more.type = 'button';
  more.hidden = true;
  host.replaceChildren(list, more);
  let next: string | null = null;
  async function page(after: string | null): Promise<void> {
    const response = communityPage(await read(after));
    if (signal.aborted) return;
    next = response.next;
    list.append(...response.items.map((group) => row(group, signal)));
    if (after === null && !response.items.length)
      host.replaceChildren(
        element('p', t('No followed communities.'), 'public-profile-empty'),
      );
    more.hidden = next === null;
  }
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

function row(group: Community, signal: AbortSignal): HTMLLIElement {
  const item = element('li'),
    link = element('a', '', 'profile-community-row'),
    avatar = communityAvatar(group.name);
  if (group.avatar)
    showPublicAvatar(avatar, {
      kind: 'community-photo',
      target: group.id,
      reference: group.avatar,
      signal,
    });
  link.href = communityHref(group);
  link.append(avatar, element('span', group.name));
  item.append(link);
  return item;
}
