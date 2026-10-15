import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { communityFollowers } from '../../shared/community-followers/index.ts';
import type {
  CommunityFollowerTab,
  CommunityFollowers,
} from '../../shared/community-followers/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { Communities } from './controller.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
interface FollowersAccess {
  id: string;
  signedIn: boolean;
  controller: Communities;
  signal: AbortSignal;
}
function identity(
  profile: CommunityFollowers['items'][number],
  signal: AbortSignal,
): HTMLElement {
  const link = el('a', '', 'community-follower');
  link.href = `#users?id=${profile.id}`;
  const avatar = el(
    'span',
    profile.handle.slice(0, 2).toUpperCase(),
    'community-follower-avatar',
  );
  if (profile.avatar) {
    avatar.textContent = '';
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: profile.id,
      reference: profile.avatar,
      signal,
    });
  }
  link.append(avatar, el('strong', `@${profile.handle}`));
  if (profile.role)
    link.append(
      el(
        'span',
        profile.role === 'owner' ? t('Dono') : t('Moderador'),
        'community-follower-role',
      ),
    );
  return link;
}
async function read(
  input: FollowersAccess,
  kind: CommunityFollowerTab,
  after: string | null,
): Promise<CommunityFollowers> {
  return communityFollowers(
    input.signedIn
      ? await input.controller.request('followers-page', {
          id: input.id,
          tab: kind,
          after,
        })
      : await communityRead(
          `/api/communities/${input.id}/followers?tab=${kind}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
          input.signal,
        ),
  );
}
/** A small photo for the overlapping row of profiles in common. */
function stackedAvatar(
  profile: CommunityFollowers['items'][number],
  signal: AbortSignal,
): HTMLElement {
  const avatar = el(
    'span',
    profile.handle.slice(0, 2).toUpperCase(),
    'community-follower-avatar',
  );
  avatar.setAttribute('aria-hidden', 'true');
  if (profile.avatar) {
    avatar.textContent = '';
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: profile.id,
      reference: profile.avatar,
      signal,
    });
  }
  return avatar;
}
/**
 * “Seguida por @a, @b e mais N que você segue”, as social networks phrase it:
 * up to two names, then how many other profiles the reader follows.
 */
export function knownFollowersText(page: CommunityFollowers): string {
  const names = page.items.slice(0, 2).map((profile) => `@${profile.handle}`);
  const rest = page.total - names.length;
  if (rest > 0)
    return t('Seguida por {0} e mais {1} que você segue', [
      names.join(', '),
      rest.toLocaleString(currentLanguage()),
    ]);
  return t('Seguida por {0}', [
    new Intl.ListFormat(currentLanguage()).format(names),
  ]);
}
/** Overlapping photos and the sentence, one link to the followers page. */
function knownFollowers(
  host: HTMLElement,
  page: CommunityFollowers,
  input: FollowersAccess,
): void {
  const link = el('a', '', 'community-known-link');
  link.href = `#communities?id=${input.id}&view=followers`;
  const stack = el('span', '', 'community-known-stack');
  stack.append(
    ...page.items
      .slice(0, 3)
      .map((profile) => stackedAvatar(profile, input.signal)),
  );
  const text = knownFollowersText(page);
  // The line may cut the sentence short; the whole of it stays available.
  link.title = text;
  link.append(stack, el('span', text, 'community-known-text'));
  host.append(link);
}
/**
 * One line under the community name: the follower count, which opens its
 * own page, then the profiles in common for signed-in readers.
 */
export function mountCommunityFollowerPreview(
  host: HTMLElement,
  input: FollowersAccess & { total: number },
): void {
  const line = el('div', '', 'community-followers'),
    count = el('a', '', 'community-followers-link');
  count.append(
    el('strong', input.total.toLocaleString(currentLanguage())),
    el('span', ` ${input.total === 1 ? t('seguidor') : t('seguidores')}`),
  );
  count.href = `#communities?id=${input.id}&view=followers`;
  line.append(count);
  host.append(line);
  if (!input.signedIn) return;
  const preview = el('span', '', 'community-known-followers');
  line.append(preview);
  void read(input, 'known', null)
    .then((page) => {
      if (input.signal.aborted || !line.isConnected || !page.items.length)
        return;
      knownFollowers(preview, page, input);
    })
    .catch(() => {
      if (!input.signal.aborted)
        preview.textContent = t('Perfis em comum indisponíveis agora.');
    });
}
/** Separate page with a public roster and signed personalized tab. */
export function mountCommunityFollowerPage(
  host: HTMLElement,
  input: FollowersAccess & { name: string },
): void {
  const panel = el('section', '', 'community-followers-panel'),
    back = el('a', t('← {0}', [input.name])),
    tabs = el('nav'),
    list = el('div', '', 'community-followers-list'),
    status = el('p'),
    more = el('button', t('Ver mais'));
  back.href = `#communities?id=${input.id}`;
  more.type = 'button';
  tabs.setAttribute('aria-label', t('Listas de seguidores'));
  status.setAttribute('role', 'status');
  more.hidden = true;
  let tab: CommunityFollowerTab = 'staff',
    next: string | null = null,
    generation = 0,
    loading = false;
  const usable = () => !input.signal.aborted && panel.isConnected;
  function paint(page: CommunityFollowers, append: boolean): void {
    if (!append) list.replaceChildren();
    list.append(
      ...page.items.map((profile) => identity(profile, input.signal)),
    );
    next = page.next;
    more.hidden = !next;
    status.textContent = page.total
      ? t('{0} {1}', [
          page.total.toLocaleString(currentLanguage()),
          tab === 'staff'
            ? t('na administração')
            : tab === 'known'
              ? t('perfis que você segue nesta comunidade')
              : page.total === 1
                ? t('seguidor')
                : t('seguidores'),
        ])
      : t('Nenhum perfil nesta lista.');
  }
  async function load(append: boolean): Promise<void> {
    const current = ++generation;
    loading = true;
    more.disabled = true;
    status.textContent = t('Carregando seguidores…');
    try {
      const page = await read(input, tab, append ? next : null);
      if (!usable() || current !== generation) return;
      paint(page, append);
    } catch (error: unknown) {
      if (usable() && current === generation)
        status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Seguidores indisponíveis.');
    } finally {
      if (current === generation) {
        loading = false;
        more.disabled = false;
      }
    }
  }
  const buttons: Array<{
    kind: CommunityFollowerTab;
    button: HTMLButtonElement;
  }> = [];
  for (const [kind, label] of [
    ['staff', t('Dono e moderadores')],
    ['all', t('Seguidores')],
    ['known', t('Perfis que você segue')],
  ] as const) {
    if (kind === 'known' && !input.signedIn) continue;
    const button = el('button', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(kind === tab));
    button.addEventListener('click', () => {
      tab = kind;
      for (const entry of buttons)
        entry.button.setAttribute('aria-pressed', String(entry.kind === tab));
      void load(false);
    });
    tabs.append(button);
    buttons.push({ kind, button });
  }
  more.addEventListener('click', () => {
    if (!loading && next) void load(true);
  });
  panel.append(back, el('h1', input.name), tabs, list, status, more);
  host.append(panel);
  void load(false);
}
