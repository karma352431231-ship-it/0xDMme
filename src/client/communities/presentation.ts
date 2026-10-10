import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { avatarInitials, avatarTone } from '../appearance/index.ts';
import { communityElement as el, communityLink as link } from './elements.ts';

const paths = {
  layers: ['m12 3 10 5-10 5L2 8z', 'm2 12 10 5 10-5', 'm2 16 10 5 10-5'],
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm16 8-3 5-5 3 3-5z'],
  globe: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    'M2 12h20',
    'M12 2c-6 6-6 14 0 20 6-6 6-14 0-20',
  ],
  up: ['M12 20V4', 'm5 11 7-7 7 7'],
  down: ['M12 4v16', 'm5 13 7 7 7-7'],
  comment: [
    'M21 11.5a9 9 0 0 1-9 9 9 9 0 0 1-4-.9L3 21l1.4-5a9 9 0 1 1 16.6-4.5',
  ],
  eye: [
    'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12',
    'M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  ],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  flag: ['M4 22V3', 'M4 4c5-5 10 5 16 0v11c-6 5-11-5-16 0'],
  mail: ['M3 5h18v14H3z', 'm3 5 9 7 9-7'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  plus: ['M12 5v14', 'M5 12h14'],
} as const;
export type CommunityIcon = keyof typeof paths;

export function communityIcon(name: CommunityIcon): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
export function iconLabel(node: HTMLElement, name: CommunityIcon): void {
  node.prepend(communityIcon(name));
}
/** Initials on a stable tone derived from the public name; a photo covers it. */
export function communityAvatar(name: string): HTMLElement {
  const avatar = el('span', '', 'community-avatar');
  avatar.append(
    el('span', avatarInitials(name) || '?', 'community-avatar-initial'),
  );
  avatar.dataset['tone'] = avatarTone(name);
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}
export function relativePostTime(createdAt: string, now = Date.now()): string {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(createdAt)) / 60_000),
  );
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return `há ${Math.floor(minutes / 1440)} d`;
}
/**
 * Who posted leads; the community is secondary. Feeds mixing communities show
 * the community photo and name; inside a community the author's own avatar.
 */
export function postHeader(
  node: HTMLElement,
  post: CommunityPost,
  group: { id: string; name: string },
  context: 'feed' | 'community' = 'feed',
): HTMLElement {
  const header = el('div', '', 'community-post-header'),
    avatar =
      context === 'feed' ? communityAvatar(group.name) : authorAvatar(post),
    identity = el('div', '', 'community-post-identity');
  header.append(avatar, identity);
  if (post.author) {
    link(
      identity,
      `@${post.author.handle}`,
      `#publico?handle=${encodeURIComponent(post.author.handle)}`,
    );
    identity.lastElementChild?.classList.add('community-post-author');
  } else identity.append(el('span', 'Conta removida', 'community-post-author'));
  const byline = el('div', '', 'community-post-byline');
  if (context === 'feed') {
    link(byline, group.name, `#comunidades?id=${group.id}`);
    byline.lastElementChild?.classList.add('community-post-community');
  }
  const time = el(
    'time',
    `${context === 'feed' ? ' · ' : ''}${relativePostTime(post.createdAt)}${post.editedAt ? ' · Editado' : ''}`,
  );
  time.dateTime = post.createdAt;
  time.title = new Date(post.createdAt).toLocaleString('pt-BR');
  byline.append(time);
  identity.append(byline);
  node.prepend(header);
  return avatar;
}
function authorAvatar(post: CommunityPost): HTMLElement {
  const label = post.author?.handle ?? '?';
  const avatar = el('span', '', 'community-avatar person');
  avatar.append(
    el('span', avatarInitials(label) || '?', 'community-avatar-initial'),
  );
  avatar.dataset['tone'] = avatarTone(label);
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}
export function postComments(
  container: HTMLElement,
  post: CommunityPost,
): void {
  const a = el('a', '', 'post-action post-comments');
  a.href = `#comunidades?id=${post.community}&post=${post.id}`;
  a.setAttribute(
    'aria-label',
    `Abrir postagem e ${post.replies} respostas diretas`,
  );
  a.append(
    communityIcon('comment'),
    el('span', String(post.replies)),
    el('span', 'comentários', 'post-action-caption'),
  );
  container.append(a);
}
export function postTagLink(node: HTMLElement, post: CommunityPost): void {
  if (!post.tag) return;
  link(
    node,
    post.tag.label,
    `#comunidades?id=${post.community}&tag=${post.tag.id}`,
  );
  node.lastElementChild?.classList.add('post-tag');
}

/**
 * Clicking a feed card opens the post, as its comments link does (the side
 * panel intercepts that link). Controls, media and selected text keep their own
 * behavior; the focused post and the replies under it are not shortcuts.
 */
export function openPostFromCard(event: MouseEvent): void {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;
  const card = event.target.closest<HTMLElement>('.community-post');
  if (!card || card.matches('.community-reply, .community-post-focus')) return;
  if (
    event.target.closest(
      'a, button, summary, details, input, textarea, select, label, video, audio, img, form',
    )
  )
    return;
  if (window.getSelection()?.toString()) return;
  card
    .querySelector<HTMLAnchorElement>(':scope > .post-actions a.post-comments')
    ?.click();
}
