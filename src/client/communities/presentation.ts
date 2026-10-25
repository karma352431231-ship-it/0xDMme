import { communityHref } from '../../shared/app-routes/index.ts';
import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { defaultPostTag } from '../../shared/community-posts/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { avatarInitials, avatarTone } from '../appearance/index.ts';
import { communityElement as el, communityLink as link } from './elements.ts';

const paths = {
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  layers: ['m12 3 10 5-10 5L2 8z', 'm2 12 10 5 10-5', 'm2 16 10 5 10-5'],
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm16 8-3 5-5 3 3-5z'],
  globe: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    'M2 12h20',
    'M12 2c-6 6-6 14 0 20 6-6 6-14 0-20',
  ],
  share: ['M4 10V5h13', 'm14 2 3 3-3 3', 'M20 14v5H7', 'm10 16-3 3 3 3'],
  transfer: ['M4 8h15', 'm16 5 3 3-3 3', 'M20 16H5', 'm8 13-3 3 3 3'],
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
  clip: [
    'm20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  ],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  check: ['m5 12.5 4.5 4.5L19 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['m14 6-6 6 6 6'],
  community: [
    'M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20',
    'M8.5 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
    'M19 8v6',
    'M22 11h-6',
  ],
  reply: ['m9 14-5-5 5-5', 'M4 9h10a6 6 0 0 1 6 6v5'],
  hide: [
    'M3 3l18 18',
    'M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6',
    'M6.6 6.6C3.9 8.3 2 12 2 12s3.5 6 10 6a9.7 9.7 0 0 0 5.4-1.6',
  ],
  block: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm5 5 14 14'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 6v6l4 2'],
  image: ['M3 4h18v16H3z', 'm3 16 5-5 4 4 3-3 6 6', 'M15 9h.01'],
  emoji: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    'M8 14a4 4 0 0 0 8 0',
    'M8 9h.01M16 9h.01',
  ],
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
  if (minutes < 1) return t('activity.now');
  if (minutes < 60) return t('{0} min ago', [minutes]);
  if (minutes < 1440) return t('{0} h ago', [Math.floor(minutes / 60)]);
  return t('{0} d ago', [Math.floor(minutes / 1440)]);
}
/**
 * Every post uses its public author identity. The community remains a secondary link.
 */
export function postHeader(
  node: HTMLElement,
  post: CommunityPost,
  group: { id: string; name: string },
  context: 'feed' | 'community' = 'feed',
): HTMLElement {
  const header = el('div', '', 'community-post-header'),
    avatar = authorAvatar(post),
    identity = el('div', '', 'community-post-identity');
  header.append(avatar, identity);
  if (post.author) {
    link(
      identity,
      `@${post.author.handle}`,
      `#users?handle=${encodeURIComponent(post.author.handle)}`,
    );
    identity.lastElementChild?.classList.add('community-post-author');
    authorBadges(identity, post);
  } else
    identity.append(el('span', t('Removed account'), 'community-post-author'));
  const byline = el('div', '', 'community-post-byline');
  if (context === 'feed') {
    link(byline, group.name, communityHref(group));
    byline.lastElementChild?.classList.add('community-post-community');
  }
  const time = el(
    'time',
    `${context === 'feed' ? ' · ' : ''}${relativePostTime(post.createdAt)}${post.editedAt ? t('post.edited') : ''}`,
  );
  time.dateTime = post.createdAt;
  time.title = new Date(post.createdAt).toLocaleString(currentLanguage());
  byline.append(time);
  identity.append(byline);
  node.prepend(header);
  return avatar;
}
function authorBadges(identity: HTMLElement, post: CommunityPost): void {
  for (const badge of post.authorBadges ?? []) {
    if (badge.kind === 'owner') continue;
    const mark = el(
      'span',
      badge.kind === 'custom'
        ? badge.label
        : { owner: '👑', moderator: '🛡️', new: '🌱' }[badge.kind],
      'community-author-badge',
    );
    const label =
      badge.kind === 'custom'
        ? badge.label
        : t(badge.kind === 'moderator' ? 'Moderator' : 'New member');
    mark.title = label;
    mark.setAttribute('aria-label', label);
    mark.dataset['kind'] = badge.kind;
    identity.append(mark);
  }
}
function authorAvatar(post: CommunityPost): HTMLElement {
  const label = post.author?.handle ?? '?';
  const avatar = post.author
    ? el('a', '', 'community-avatar person')
    : el('span', '', 'community-avatar person');
  if (post.author) {
    avatar.setAttribute(
      'href',
      `#users?handle=${encodeURIComponent(post.author.handle)}`,
    );
    avatar.setAttribute(
      'aria-label',
      t("Open @{0}'s profile", [post.author.handle]),
    );
  } else avatar.setAttribute('aria-hidden', 'true');
  avatar.append(
    el('span', avatarInitials(label) || '?', 'community-avatar-initial'),
  );
  avatar.dataset['tone'] = avatarTone(label);
  return avatar;
}
export function postComments(
  container: HTMLElement,
  post: CommunityPost,
): void {
  const a = el('a', '', 'post-action post-comments');
  a.href = `#communities?id=${post.community}&post=${post.id}`;
  a.setAttribute(
    'aria-label',
    t('Open post and {0} direct replies', [post.replies]),
  );
  a.append(
    communityIcon('comment'),
    el('span', String(post.replies)),
    el('span', t('comments'), 'post-action-caption'),
  );
  container.append(a);
}
/** Each tag of the post links to its community filtered by that tag. */
/** Text, title and approved media all missing: the post only had media still under review. */
export function postPendingMedia(node: HTMLElement, post: CommunityPost): void {
  if (post.text || post.title || post.media?.length) return;
  node.append(el('p', t('Media awaiting approval.')));
}
/** Default tags read in the viewer's language; names managers chose stay as written. */
export function postTagName(label: string): string {
  switch (defaultPostTag(label)) {
    case 'Discussion':
      return t('Discussion');
    case 'Opinion':
      return t('Opinion');
    case 'Memes':
      return t('Memes');
    default:
      return label;
  }
}
export function postTagLink(node: HTMLElement, post: CommunityPost): void {
  if (!post.tags.length) return;
  const row = el('div', '', 'post-tags');
  for (const tag of post.tags) {
    link(
      row,
      postTagName(tag.label),
      `#communities?id=${post.community}&tag=${tag.id}`,
    );
    row.lastElementChild?.classList.add('post-tag');
  }
  node.append(row);
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
      'a, button, summary, details, input, textarea, select, label, video, audio, img, form, dialog',
    )
  )
    return;
  if (window.getSelection()?.toString()) return;
  const target =
    card.querySelector<HTMLAnchorElement>(
      ':scope > .post-actions a.post-discussion',
    ) ??
    card.querySelector<HTMLAnchorElement>(
      ':scope > .post-actions a.post-comments',
    );
  target?.click();
}
