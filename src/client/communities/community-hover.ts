import { appRoute, communityHref } from '../../shared/app-routes/index.ts';
import { classificationBadges } from './classification.ts';
import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import type { HoverCardProvider } from '../hover-card/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { Communities, CommunityReference } from './controller.ts';
import { readCommunity } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';
import { communityState } from '../../shared/communities/index.ts';

const cacheTime = 60_000,
  cacheSize = 32;
const cache = new Map<string, { at: number; value: Community }>();

async function community(
  target: CommunityReference,
  signal: AbortSignal,
): Promise<Community> {
  const key =
    typeof target === 'string' ? 'id:' + target : 'slug:' + target.slug;
  const held = cache.get(key);
  if (held && Date.now() - held.at < cacheTime) return held.value;
  const value = await readCommunity(
    target,
    AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  );
  if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
  return value;
}
/** Only a plain community link previews; post, tag and view links do not. */
function communityOf(link: HTMLAnchorElement): CommunityReference | null {
  const route = appRoute(link.getAttribute('href') ?? '');
  if (route?.page !== 'communities') return null;
  const params = route.params;
  if (params.size !== 1) return null;
  const slug = params.get('slug');
  return slug ? { slug } : params.get('id');
}

/** Community preview: photo, name, description, followers and Seguir. */
export function communityHoverProvider(input: {
  controller: Communities;
  signedIn: () => boolean;
}): HoverCardProvider {
  return (link) => {
    const target = communityOf(link);
    if (!target) return null;
    return async (card, signal) => {
      const value = await community(target, signal);
      if (signal.aborted) return;
      const head = el('div', '', 'hover-card-head'),
        avatar = communityAvatar(value.name),
        actions = el('div', '', 'hover-card-actions');
      avatar.classList.add('hover-card-avatar');
      if (value.avatar)
        showPublicAvatar(avatar, {
          kind: 'community-photo',
          target: value.id,
          reference: value.avatar,
          signal,
        });
      head.append(avatar, actions);
      const name = el('a', value.name, 'hover-card-title');
      name.href = communityHref(value);
      const banner = previewBanner(value, avatar, signal);
      card.append(
        banner,
        head,
        name,
        classificationBadges(value.classification),
      );
      if (value.description) {
        const description = el('p', '', 'hover-card-text');
        renderMentions(description, value.description);
        card.append(description);
      }
      const figures = [
        t('{0} {1}', [
          value.followers.toLocaleString(currentLanguage()),
          value.followers === 1 ? t('follower') : t('followers'),
        ]),
      ];
      if (value.archived) figures.push('arquivada');
      card.append(el('p', figures.join(' · '), 'hover-card-stats'));
      if (input.signedIn() && !value.archived)
        await followButton(actions, { ...input, id: value.id, signal, card });
    };
  };
}
async function followButton(
  host: HTMLElement,
  input: {
    controller: Communities;
    id: string;
    signal: AbortSignal;
    card: HTMLElement;
  },
): Promise<void> {
  let following = (await input.controller.state(input.id)).following;
  if (input.signal.aborted) return;
  const button = el('button');
  button.type = 'button';
  const paint = (): void => {
    button.textContent = following ? t('follow.following') : t('Follow');
    button.setAttribute('aria-pressed', String(following));
  };
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void input.controller
      .request('follow', { id: input.id, following: !following })
      .then((value) => {
        following = communityState(value).following;
        for (const [key, held] of cache)
          if (held.value.id === input.id) cache.delete(key);
        if (!input.signal.aborted) paint();
      })
      .catch((error: unknown) => {
        input.card.append(
          el(
            'p',
            error instanceof Error
              ? translatedError(error.message)
              : t('Action unavailable.'),
            'hover-card-error',
          ),
        );
      })
      .finally(() => {
        if (!input.signal.aborted) button.disabled = false;
      });
  });
  paint();
  host.append(button);
}

function previewBanner(
  value: Community,
  avatar: HTMLElement,
  signal: AbortSignal,
): HTMLElement {
  const banner = el('div', '', 'community-banner hover-card-banner');
  banner.dataset['tone'] = avatar.dataset['tone'] ?? '0';
  if (value.banner)
    showPublicAvatar(banner, {
      kind: 'community-banner',
      target: value.id,
      reference: value.banner,
      signal,
    });
  return banner;
}
