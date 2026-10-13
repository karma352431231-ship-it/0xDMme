import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import type { HoverCardProvider } from '../hover-card/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { Communities } from './controller.ts';
import { readCommunity } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';
import { communityState } from '../../shared/communities/index.ts';

const cacheTime = 60_000,
  cacheSize = 32;
const cache = new Map<string, { at: number; value: Community }>();

async function community(id: string, signal: AbortSignal): Promise<Community> {
  const held = cache.get(id);
  if (held && Date.now() - held.at < cacheTime) return held.value;
  const value = await readCommunity(
    id,
    AbortSignal.any([signal, AbortSignal.timeout(8000)]),
  );
  if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
  cache.set(id, { at: Date.now(), value });
  return value;
}
/** Only a plain community link previews; post, tag and view links do not. */
function communityOf(link: HTMLAnchorElement): string | null {
  const [path, query = ''] = (link.getAttribute('href') ?? '').split('?');
  if (path !== '#comunidades') return null;
  const params = new URLSearchParams(query);
  const id = params.get('id');
  return id && [...params.keys()].length === 1 ? id : null;
}

/** Community preview: photo, name, description, followers and Seguir. */
export function communityHoverProvider(input: {
  controller: Communities;
  signedIn: () => boolean;
}): HoverCardProvider {
  return (link) => {
    const id = communityOf(link);
    if (!id) return null;
    return async (card, signal) => {
      const value = await community(id, signal);
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
      name.href = `#comunidades?id=${encodeURIComponent(value.id)}`;
      const banner = previewBanner(value, avatar, signal);
      card.append(banner, head, name);
      if (value.description) {
        const description = el('p', '', 'hover-card-text');
        renderMentions(description, value.description);
        card.append(description);
      }
      const figures = [
        t('{0} {1}', [
          value.followers.toLocaleString(currentLanguage()),
          value.followers === 1 ? t('seguidor') : t('seguidores'),
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
    button.textContent = following ? t('Seguindo') : t('Seguir');
    button.setAttribute('aria-pressed', String(following));
  };
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void input.controller
      .request('follow', { id: input.id, following: !following })
      .then((value) => {
        following = communityState(value).following;
        cache.delete(input.id);
        if (!input.signal.aborted) paint();
      })
      .catch((error: unknown) => {
        input.card.append(
          el(
            'p',
            error instanceof Error
              ? translatedError(error.message)
              : t('Ação indisponível.'),
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
