import { mutualFollowers } from '../../shared/profile-social/index.ts';
import type { MutualFollowers } from '../../shared/profile-social/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { PublicProfiles } from './controller.ts';

function profileLink(
  profile: MutualFollowers['items'][number],
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `#publico?handle=${encodeURIComponent(profile.handle)}`;
  link.textContent = `@${profile.handle}`;
  return link;
}
function preview(
  host: HTMLElement,
  page: MutualFollowers,
  signal: AbortSignal,
): void {
  const avatars = document.createElement('span'),
    text = document.createElement('span');
  avatars.className = 'mutual-followers-avatars';
  text.append('Seguido por ');
  const visible = page.items.slice(0, 3);
  for (const [index, profile] of visible.entries()) {
    const avatar = profileLink(profile);
    avatar.className = 'mutual-follower-avatar';
    avatar.textContent = profile.handle.slice(0, 2).toUpperCase();
    avatar.setAttribute('aria-label', `@${profile.handle}`);
    if (profile.avatar) {
      avatar.textContent = '';
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: profile.id,
        reference: profile.avatar,
        signal,
      });
    }
    avatars.append(avatar);
    if (index)
      text.append(
        index === visible.length - 1 && page.total === visible.length
          ? ' e '
          : ', ',
      );
    text.append(profileLink(profile));
  }
  const others = page.total - visible.length;
  if (others)
    text.append(
      ` e mais ${others.toLocaleString('pt-BR')} ${others === 1 ? 'pessoa que você segue' : 'pessoas que você segue'}`,
    );
  else text.append(', que você segue');
  host.append(avatars, text);
}
/** No anonymous graph read. Keep this personalized projection out of the public summary/cache. */
export function mountMutualFollowers(
  host: HTMLElement,
  input: {
    target: string;
    controller: PublicProfiles | undefined;
    signal: AbortSignal;
  },
): void {
  const { controller, signal } = input;
  if (!controller?.profile || controller.profile.profile.id === input.target)
    return;
  const section = document.createElement('section'),
    status = document.createElement('p');
  section.className = 'mutual-followers';
  section.setAttribute('aria-label', 'Seguidores em comum');
  status.setAttribute('role', 'status');
  host.append(section);
  const usable = () => !signal.aborted && section.isConnected;
  const fail = (error: unknown): void => {
    if (usable())
      status.textContent =
        error instanceof Error
          ? error.message
          : 'Seguidores em comum indisponíveis.';
  };
  const read = async (after: string | null): Promise<MutualFollowers> =>
    mutualFollowers(
      await controller.perform('mutual-followers', {
        target: input.target,
        after,
      }),
    );
  const render = (page: MutualFollowers): void => {
    if (!usable() || !page.items.length) return;
    preview(section, page, signal);
    const list = document.createElement('div'),
      more = document.createElement('button');
    list.className = 'mutual-followers-list';
    more.type = 'button';
    more.textContent = 'Ver seguidores em comum';
    more.setAttribute('aria-expanded', 'false');
    let next = page.next,
      expanded = false;
    const append = (value: MutualFollowers): void => {
      list.append(...value.items.map(profileLink));
      next = value.next;
      more.hidden = !next;
      more.textContent = 'Ver mais';
    };
    more.addEventListener('click', () => {
      if (more.disabled) return;
      if (!expanded) {
        expanded = true;
        more.setAttribute('aria-expanded', 'true');
        append(page);
        return;
      }
      more.disabled = true;
      void read(next)
        .then((value) => {
          if (usable()) append(value);
        })
        .catch(fail)
        .finally(() => {
          more.disabled = false;
        });
    });
    if (page.total > 3) section.append(more, list);
    section.append(status);
  };
  void read(null)
    .then(render)
    .catch((error: unknown) => {
      section.append(status);
      fail(error);
    });
}
