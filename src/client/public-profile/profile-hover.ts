import { fetchApi, readApiJson } from '../api-response/index.ts';
import { publicHandle } from '../../shared/public-profile/index.ts';
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
  handle: string,
  signal: AbortSignal,
): Promise<ProfileSummary> {
  const held = cache.get(handle);
  if (held && Date.now() - held.at < cacheTime) return held.value;
  const response = await fetchApi(
    'public-profile/read',
    `/api/public-profiles/${encodeURIComponent(handle)}/page`,
    {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    },
  );
  const value = profileSummary(
    await readApiJson(response, 'public-profile/read'),
  );
  if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
  cache.set(handle, { at: Date.now(), value });
  return value;
}
function handleOf(link: HTMLAnchorElement): string | null {
  const [path, query = ''] = (link.getAttribute('href') ?? '').split('?');
  if (path !== '#publico') return null;
  try {
    return publicHandle(new URLSearchParams(query).get('handle'));
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
  return `${value.toLocaleString('pt-BR')} ${value === 1 ? one : many}`;
}

/** Profile preview: photo, @, description, a few figures and Seguir. */
export function profileHoverProvider(
  controller: PublicProfiles,
): HoverCardProvider {
  return (link) => {
    const handle = handleOf(link);
    if (!handle) return null;
    return async (card, signal) => {
      const value = await summary(handle, signal);
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
      (name as HTMLAnchorElement).href =
        `#publico?handle=${encodeURIComponent(value.profile.handle)}`;
      const banner = line('div', '', 'public-profile-banner hover-card-banner');
      if (value.banner)
        showPublicAvatar(banner, {
          kind: 'profile-banner',
          target: value.profile.id,
          reference: value.banner,
          signal,
        });
      card.append(banner, head, name);
      if (value.description)
        card.append(line('p', value.description, 'hover-card-text'));
      card.append(
        line(
          'p',
          [
            count(value.followers, 'seguidor', 'seguidores'),
            count(value.posts, 'post', 'posts'),
            count(value.replies, 'resposta', 'respostas'),
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
              error instanceof Error ? error.message : 'Ação indisponível.',
              'hover-card-error',
            ),
          );
        },
      });
    };
  };
}
