import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { UpvoteNotice } from '../../shared/public-upvotes/index.ts';
import type { FollowNotice } from '../../shared/follow-notices/index.ts';
import type {
  ReplyNotification,
  ReplyTarget,
} from '../../shared/community-posts/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { noticeThumbnail } from './notice-thumbnail.ts';
import { publicIdentityAvatar } from '../public-identity/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
import { publicationQuote, publicationTitle } from './publications.ts';

/** What Activity reads of a reply notice; older sources omit read state. */
export type ActivityReply = Pick<
  ReplyNotification,
  'reply' | 'community' | 'createdAt' | 'kind' | 'preview'
> & { read?: boolean; target?: ReplyTarget };

/**
 * Option A (05/11/2026): one card per piece of the reader's own content, with
 * its upvotes on one line and its replies beneath it. Posts from followed
 * profiles stay one card each, and new followers share one profile card.
 * Grouping is presentation only; every arrival keeps its own read receipt.
 */
export interface ContentCard {
  key: string;
  kind: 'post' | 'reply' | 'profile' | 'watched';
  community: string;
  /** The content the card opens: the reader's own post or reply. */
  target: string;
  headline: string;
  latest: string;
  upvotes: UpvoteNotice[];
  replies: ActivityReply[];
  follows: FollowNotice[];
  /** First public media of the content, shown as a small square. */
  thumbnail?: PublicPostMedia;
}
const shownReplies = 2;

function card(
  cards: Map<string, ContentCard>,
  key: string,
  fields: Pick<ContentCard, 'kind' | 'community' | 'target' | 'headline'>,
): ContentCard {
  const found = cards.get(key);
  if (found) return found;
  const created = {
    key,
    ...fields,
    latest: '',
    upvotes: [],
    replies: [],
    follows: [],
  };
  cards.set(key, created);
  return created;
}
function arrived(target: ContentCard, at: string): void {
  if (Date.parse(at) > Date.parse(target.latest || '1970-01-01')) {
    target.latest = at;
  }
}
/** The first media seen for the content names it; later arrivals keep it. */
function keepThumbnail(card: ContentCard, media: PublicPostMedia | undefined) {
  if (media && !card.thumbnail) card.thumbnail = media;
}
function replyTargetText(target: ReplyTarget) {
  return publicationQuote({ ...target, media: false }, target.kind);
}

/** Newest activity first; a new reply lifts an older post's card to the top. */
export function contentCards(input: {
  replies: readonly ActivityReply[];
  upvotes: readonly UpvoteNotice[];
  follows: readonly FollowNotice[];
}): ContentCard[] {
  const cards = new Map<string, ContentCard>();
  for (const upvote of input.upvotes) {
    const found = card(cards, 'content:' + upvote.post, {
      kind: upvote.kind,
      community: upvote.community,
      target: upvote.post,
      headline: upvote.text,
    });
    found.upvotes.push(upvote);
    keepThumbnail(found, upvote.thumbnail);
    arrived(found, upvote.createdAt);
  }
  for (const reply of input.replies) {
    const target = reply.target;
    const found = target
      ? card(cards, 'content:' + target.id, {
          kind: target.kind,
          community: reply.community,
          target: target.id,
          headline: replyTargetText(target),
        })
      : card(cards, 'watched:' + reply.reply, {
          kind: 'watched',
          community: reply.community,
          target: reply.reply,
          headline: publicationQuote(reply.preview, reply.kind ?? 'reply'),
        });
    found.replies.push(reply);
    keepThumbnail(found, (target ?? reply.preview)?.thumbnail);
    arrived(found, reply.createdAt);
  }
  if (input.follows.length) {
    const profile = card(cards, 'profile', {
      kind: 'profile',
      community: '',
      target: '',
      headline: '',
    });
    for (const follow of input.follows) {
      profile.follows.push(follow);
      arrived(profile, follow.createdAt);
    }
  }
  const newest = (a: { createdAt: string }, b: { createdAt: string }) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
  // A card shows its newest replies first; a new one replaces the oldest shown.
  for (const found of cards.values()) found.replies.sort(newest);
  return [...cards.values()].sort(
    (a, b) => Date.parse(b.latest) - Date.parse(a.latest),
  );
}

/** "@a", "@a and @b" or "@a, @b and 3 others", followed by what they did. */
export function actorsPhrase(
  handles: readonly string[],
  action: 'upvoted' | 'followed',
): string {
  const [first = '', second = ''] = handles;
  const others = handles.length - 2;
  const family =
    action === 'upvoted'
      ? ([
          '@{0} upvoted',
          '@{0} and @{1} upvoted',
          '@{0}, @{1} and {2} others upvoted',
        ] as const)
      : ([
          '@{0} started following you',
          '@{0} and @{1} started following you',
          '@{0}, @{1} and {2} others started following you',
        ] as const);
  if (handles.length === 1) return t(family[0], [first]);
  if (handles.length === 2) return t(family[1], [first, second]);
  return t(family[2], [
    first,
    second,
    others.toLocaleString(currentLanguage()),
  ]);
}
export function relativeTime(iso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return t('activity.now');
  if (minutes < 60) return t('{0} min ago', [minutes]);
  if (minutes < 1440) return t('{0} h ago', [Math.floor(minutes / 60)]);
  return new Date(iso).toLocaleDateString(currentLanguage());
}

type Mark = (ids: readonly string[]) => Promise<void>;
export interface ContentCardActions {
  signal: AbortSignal;
  current: () => boolean;
  changed: () => void;
  /** The reply or followed post text, with its compact media preview. */
  quote: (text: string) => HTMLElement;
  read: { upvotes: Mark; replies: Mark; follows: Mark };
  /** Keys of cards the reader opened with "See more", kept across redraws. */
  expanded: Set<string>;
}

const iconPaths = {
  up: ['M12 20V4', 'm5 11 7-7 7 7'],
  reply: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12Z'],
  follow: [
    'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1',
    'M8.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19 8v6',
    'M22 11h-6',
  ],
} as const;
function icon(name: keyof typeof iconPaths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('activity-card-icon', 'is-' + name);
  for (const d of iconPaths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function faces(profiles: readonly PublicProfile[], signal: AbortSignal) {
  const stack = element('span', '', 'activity-card-faces');
  for (const profile of profiles.slice(0, 3))
    stack.append(publicIdentityAvatar(profile, signal));
  return stack;
}
function line(name: keyof typeof iconPaths, ...content: Node[]): HTMLElement {
  const node = element('div', '', 'activity-card-line');
  node.append(icon(name), ...content);
  return node;
}
function unreadIds<T extends { read?: boolean }>(
  items: readonly T[],
  id: (item: T) => string,
): string[] {
  return items.filter((item) => item.read !== true).map(id);
}
function isRead(card: ContentCard): boolean {
  return [...card.upvotes, ...card.replies, ...card.follows].every(
    (item) => item.read === true,
  );
}
function cardLabel(card: ContentCard): string {
  if (card.kind === 'post') return t('Your post');
  if (card.kind === 'reply') return t('Your reply');
  if (card.kind === 'profile') return t('New followers');
  const reply = card.replies[0]!;
  return publicationTitle(reply.preview?.author, reply.kind ?? 'reply');
}
function cardHref(card: ContentCard): string {
  if (card.kind === 'profile')
    return `#users?handle=${encodeURIComponent(card.follows[0]!.actor.handle)}`;
  return `#communities?id=${card.community}&post=${card.target}`;
}

/** Marks every unread arrival in the card, each with its own receipt. */
async function readCard(card: ContentCard, read: ContentCardActions['read']) {
  const upvotes = unreadIds(card.upvotes, (item) => item.id),
    replies = unreadIds(card.replies, (item) => item.reply),
    follows = unreadIds(card.follows, (item) => item.id);
  await Promise.all([
    upvotes.length ? read.upvotes(upvotes) : null,
    replies.length ? read.replies(replies) : null,
    follows.length ? read.follows(follows) : null,
  ]);
}
function settled(
  row: HTMLElement,
  items: readonly { read?: boolean }[],
  card: ContentCard,
  changed: () => void,
): void {
  for (const item of items) item.read = true;
  row.dataset['read'] = String(isRead(card));
  changed();
}

function replyLine(
  reply: ActivityReply,
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): HTMLElement {
  const preview = reply.preview;
  const link = noticeLink({
    label: '',
    href: `#communities?id=${reply.community}&post=${reply.reply}`,
    read: reply.read === true,
    acknowledge: () => actions.read.replies([reply.reply]),
    current: actions.current,
    acknowledged: () => settled(row, [reply], card, actions.changed),
  });
  link.classList.add('activity-card-reply');
  link.dataset['read'] = String(reply.read === true);
  if (preview?.author) link.append(element('b', '@' + preview.author));
  link.append(
    element('span', publicationQuote(preview, reply.kind ?? 'reply')),
  );
  return line(
    'reply',
    ...(preview?.identity
      ? [publicIdentityAvatar(preview.identity, actions.signal)]
      : []),
    link,
    ...(preview?.thumbnail
      ? [
          noticeThumbnail(preview.thumbnail, {
            signal: actions.signal,
            small: true,
          }),
        ]
      : []),
  );
}
/** Opens every reply of the card in place, newest first, and closes them again. */
function moreReplies(
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): HTMLElement | null {
  const hidden = card.replies.length - shownReplies;
  if (hidden <= 0) return null;
  const open = actions.expanded.has(card.key);
  const button = element(
    'button',
    open
      ? t('Show fewer replies')
      : hidden === 1
        ? t('See 1 more reply')
        : t('See {0} more replies', [hidden.toLocaleString(currentLanguage())]),
    'activity-card-more',
  );
  button.type = 'button';
  button.setAttribute('aria-expanded', String(open));
  button.addEventListener('click', () => {
    if (open) actions.expanded.delete(card.key);
    else actions.expanded.add(card.key);
    row.replaceWith(...contentCardRows([card], actions));
  });
  return button;
}
function upvoteLine(card: ContentCard, signal: AbortSignal): HTMLElement {
  const actors = card.upvotes.map((item) => item.actor);
  return line(
    'up',
    faces(actors, signal),
    element(
      'span',
      actorsPhrase(
        actors.map((actor) => actor.handle),
        'upvoted',
      ),
    ),
  );
}

function cardHead(card: ContentCard): HTMLElement {
  const head = element('div', '', 'activity-card-head');
  head.append(
    element('small', cardLabel(card)),
    element('small', relativeTime(card.latest), 'activity-card-time'),
  );
  return head;
}
function primaryLink(
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): HTMLAnchorElement {
  const label =
    card.kind === 'profile'
      ? actorsPhrase(
          card.follows.map((item) => item.actor.handle),
          'followed',
        )
      : card.headline;
  const link = noticeLink({
    label,
    href: cardHref(card),
    read: isRead(card),
    acknowledge: () => readCard(card, actions.read),
    current: actions.current,
    acknowledged: () =>
      settled(
        row,
        [...card.upvotes, ...card.replies, ...card.follows],
        card,
        actions.changed,
      ),
  });
  link.classList.add('activity-card-title');
  return link;
}
/** The card's title with the content's thumbnail beside it, under the head. */
function titled(
  card: ContentCard,
  link: HTMLElement,
  signal: AbortSignal,
): HTMLElement {
  const body = element('div', '', 'activity-card-body');
  body.append(link);
  if (card.thumbnail) body.append(noticeThumbnail(card.thumbnail, { signal }));
  return body;
}
function ownContent(
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): Node[] {
  const shown = actions.expanded.has(card.key)
    ? card.replies
    : card.replies.slice(0, shownReplies);
  const replies = shown.map((reply) => replyLine(reply, card, row, actions));
  return [
    titled(card, primaryLink(card, row, actions), actions.signal),
    ...(card.upvotes.length ? [upvoteLine(card, actions.signal)] : []),
    ...replies,
    ...[moreReplies(card, row, actions)].filter(
      (node): node is HTMLElement => node !== null,
    ),
  ];
}
function watchedContent(
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): Node[] {
  const reply = card.replies[0]!;
  const link = primaryLink(card, row, actions);
  link.replaceChildren(
    reply.preview?.status === 'visible'
      ? actions.quote(card.headline)
      : element('span', card.headline),
  );
  const author = reply.preview?.identity;
  const body = titled(card, link, actions.signal);
  if (author) body.prepend(publicIdentityAvatar(author, actions.signal));
  return [body];
}
function profileContent(
  card: ContentCard,
  row: HTMLElement,
  actions: ContentCardActions,
): Node[] {
  return [
    line(
      'follow',
      faces(
        card.follows.map((item) => item.actor),
        actions.signal,
      ),
      primaryLink(card, row, actions),
    ),
  ];
}

export function contentCardRows(
  cards: readonly ContentCard[],
  actions: ContentCardActions,
): HTMLElement[] {
  return cards.map((card) => {
    const row = element('li', '', 'activity-row activity-card');
    row.dataset['read'] = String(isRead(card));
    row.dataset['kind'] = card.kind;
    const content =
      card.kind === 'profile'
        ? profileContent(card, row, actions)
        : card.kind === 'watched'
          ? watchedContent(card, row, actions)
          : ownContent(card, row, actions);
    row.append(cardHead(card), ...content);
    const primary = row.querySelector<HTMLElement>('.activity-card-title');
    if (primary) bindNoticeRow(row, primary);
    return row;
  });
}
