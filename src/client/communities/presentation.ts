import type { CommunityPost } from '../../shared/community-posts/index.ts';
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
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  flag: ['M4 22V3', 'M4 4c5-5 10 5 16 0v11c-6 5-11-5-16 0'],
  mail: ['M3 5h18v14H3z', 'm3 5 9 7 9-7'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
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
export function communityAvatar(name: string): HTMLElement {
  const avatar = el('span', '', 'community-avatar');
  avatar.append(
    el(
      'span',
      Array.from(name.trim())[0]?.toLocaleUpperCase('pt-BR') ?? '?',
      'community-avatar-initial',
    ),
  );
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
export function postHeader(
  node: HTMLElement,
  post: CommunityPost,
  group: { id: string; name: string },
): HTMLElement {
  const header = el('div', '', 'community-post-header'),
    avatar = communityAvatar(group.name),
    identity = el('div', '', 'community-post-identity');
  header.append(avatar, identity);
  link(identity, group.name, `#comunidades?id=${group.id}`);
  identity.lastElementChild?.classList.add('community-post-community');
  const byline = el('div', '', 'community-post-byline');
  if (post.author)
    link(
      byline,
      `@${post.author.handle}`,
      `#publico?handle=${encodeURIComponent(post.author.handle)}`,
    );
  else byline.append(el('span', 'Conta removida'));
  const time = el(
    'time',
    ` · ${relativePostTime(post.createdAt)}${post.editedAt ? ' · Editado' : ''}`,
  );
  time.dateTime = post.createdAt;
  time.title = new Date(post.createdAt).toLocaleString('pt-BR');
  byline.append(time);
  identity.append(byline);
  node.prepend(header);
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
