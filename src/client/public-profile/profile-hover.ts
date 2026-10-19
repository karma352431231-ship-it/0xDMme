import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import { appRoute } from '../../shared/app-routes/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { uuid } from '../../shared/account/index.ts';
import {
  publicHandle,
  publicProfile,
} from '../../shared/public-profile/index.ts';
import { profileSummary } from '../../shared/profile-social/index.ts';
import type { ProfileSummary } from '../../shared/profile-social/index.ts';
import type { HoverCardProvider } from '../hover-card/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { PublicProfiles } from './controller.ts';
import { followControl } from './follow.ts';

const cacheTime = 60_000,
  cacheSize = 32;
const cache = new Map<string, { at: number; value: ProfileSummary }>();

/** Public summary without cookies, kept briefly so repeated hovers stay cheap. */
async function summary(
  target: { id: string } | { handle: string },
  signal: AbortSignal,
): Promise<ProfileSummary> {
  const key = 'id' in target ? `id:${target.id}` : `handle:${target.handle}`;
  const held = cache.get(key);
  if (held && Date.now() - held.at < cacheTime) return held.value;
  const handle =
    'id' in target
      ? publicProfile(
          await read(`/api/public-profiles/id/${target.id}`, signal),
        ).handle
      : target.handle;
  const value = profileSummary(
    await read(
      `/api/public-profiles/${encodeURIComponent(handle)}/page`,
      signal,
    ),
  );
  if ('id' in target && value.profile.id !== target.id)
    throw new Error('Public profile changed.');
  if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}
async function read(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetchApi('public-profile/read', path, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  });
  return readApiJson(response, 'public-profile/read');
}
function targetOf(
  link: HTMLAnchorElement,
): { id: string } | { handle: string } | null {
  const route = appRoute(link.getAttribute('href') ?? '');
  if (route?.page !== 'users') return null;
  try {
    const params = route.params;
    return params.has('id')
      ? { id: uuid(params.get('id')) }
      : { handle: publicHandle(params.get('handle')) };
  } catch {
    return null;
  }
}
function line(tag: string, text: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function count(value: number, one: string, many: string): string {
  return t('{0} {1}', [
    value.toLocaleString(currentLanguage()),
    value === 1 ? one : many,
  ]);
}

/** Profile preview: photo, @, description, a few figures and Seguir. */
export function profileHoverProvider(
  controller: PublicProfiles,
): HoverCardProvider {
  return (link) => {
    const target = targetOf(link);
    if (!target) return null;
    return async (card, signal) => {
      const value = await summary(target, signal);
      if (signal.aborted) return;
      const head = line('div', '', 'hover-card-head'),
        avatar = line('span', '@', 'hover-card-avatar person'),
        actions = line('div', '', 'hover-card-actions');
      if (value.profile.avatar) {
        avatar.textContent = '';
        showPublicAvatar(avatar, {
          kind: 'avatar',
          target: value.profile.id,
          reference: value.profile.avatar,
          signal,
        });
      }
      head.append(avatar, actions);
      const name = line('a', `@${value.profile.handle}`, 'hover-card-title');
      (name as HTMLAnchorElement).href = `#users?id=${value.profile.id}`;
      const banner = line('div', '', 'public-profile-banner hover-card-banner');
      if (value.banner)
        showPublicAvatar(banner, {
          kind: 'profile-banner',
          target: value.profile.id,
          reference: value.banner,
          signal,
        });
      card.append(banner, head, name);
      if (value.description) {
        const description = line('p', '', 'hover-card-text');
        renderMentions(description, value.description);
        card.append(description);
      }
      card.append(
        line(
          'p',
          [
            count(value.followers, t('follower'), t('followers')),
            count(value.posts, 'post', 'posts'),
            count(value.replies, t('reply'), t('replies')),
          ].join(' · '),
          'hover-card-stats',
        ),
      );
      await followControl(actions, {
        controller,
        target: value.profile.id,
        signal,
        failed: (error) => {
          card.append(
            line(
              'p',
              error instanceof Error
                ? translatedError(error.message)
                : t('Action unavailable.'),
              'hover-card-error',
            ),
          );
        },
      });
    };
  };
}
