import { explorePage } from '../../shared/community-discovery/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';

const suggestionCount = 4;

/**
 * A community without posts invites the first one and points to other
 * communities active this week. There is no similarity data: suggestions are
 * the same public "em alta" list as Explorar, without the current community.
 */
export function emptyCommunity(
  host: HTMLElement,
  options: {
    community: string;
    /** Opens the post composer; absent when this person cannot post. */
    compose: (() => void) | null;
    signal: AbortSignal;
  },
): void {
  const card = el('section', '', 'community-empty');
  card.append(
    el('h3', 'Nenhuma postagem ainda'),
    el('p', 'Comece a conversa nesta comunidade.'),
  );
  if (options.compose) {
    const start = el('button', 'Escrever a primeira postagem', 'primary');
    start.type = 'button';
    start.addEventListener('click', options.compose);
    card.append(start);
  }
  host.append(card);
  void suggestions(card, options).catch(() => {
    // Suggestions are optional; the invitation above stays useful without them.
  });
}

async function suggestions(
  card: HTMLElement,
  options: { community: string; signal: AbortSignal },
): Promise<void> {
  const page = explorePage(
    await communityRead(
      '/api/communities/explore?order=trending&period=week',
      AbortSignal.any([options.signal, AbortSignal.timeout(8000)]),
    ),
  );
  const items = page.items
    .map((item) => item.community)
    .filter((item) => item.id !== options.community && !item.archived)
    .slice(0, suggestionCount);
  if (!items.length || options.signal.aborted || !card.isConnected) return;
  const list = el('div', '', 'community-empty-suggestions');
  for (const item of items) list.append(row(item, options.signal));
  card.append(el('h4', 'Outras comunidades em alta'), list);
}

function row(item: Community, signal: AbortSignal): HTMLElement {
  const link = el('a', '', 'community-row-link'),
    avatar = communityAvatar(item.name),
    copy = el('span', '', 'community-row-copy');
  link.href = `#comunidades?id=${encodeURIComponent(item.id)}`;
  copy.append(
    el('strong', item.name),
    el(
      'small',
      `${item.followers} ${item.followers === 1 ? 'seguidor' : 'seguidores'}`,
    ),
  );
  link.append(avatar, copy);
  if (item.avatar)
    showPublicAvatar(avatar, {
      kind: 'community-photo',
      target: item.id,
      reference: item.avatar,
      signal,
    });
  return link;
}
