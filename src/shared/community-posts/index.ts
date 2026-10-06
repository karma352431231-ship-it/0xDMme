import { AccountError, keys, object, uuid } from '../account/index.ts';
import {
  communityArray,
  communityBoolean,
  communityCursor,
  communityRevision,
  communityText,
} from '../communities/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

export interface PostContent {
  title: string;
  text: string;
  tag: string | null;
}
export interface PostTag {
  id: string;
  label: string;
  active: boolean;
  revision: number;
}
export interface CommunityPost {
  id: string;
  community: string;
  author: PublicProfile | null;
  title: string;
  text: string;
  tag: PostTag | null;
  createdAt: string;
  editedAt: string | null;
  revision: number;
  status: 'visible' | 'removed' | 'deleted';
  parent: string | null;
  root: string | null;
  score: number;
  replies: number;
}
export interface PostRemoval {
  id: string;
  reason: string;
  createdAt: string;
  restored: boolean;
  appeal: string | null;
  decision: string | null;
}
export interface PostState {
  post: CommunityPost;
  own: boolean;
  manager: boolean;
  canEdit: boolean;
  canDelete: boolean;
  content: PostContent | null;
  removal: PostRemoval | null;
  vote: PostVote;
}
export interface PostPage {
  items: CommunityPost[];
  next: string | null;
}
export interface TagPage {
  items: PostTag[];
  next: string | null;
}
export interface PrivatePostPage {
  items: PostState[];
  next: string | null;
}
export function postTime(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length !== 24 ||
    !Number.isFinite(Date.parse(value))
  )
    throw new AccountError(400, 'Horário do post inválido.');
  if (new Date(value).toISOString() !== value)
    throw new AccountError(400, 'Horário do post inválido.');
  return value;
}
export function postCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length !== 61)
    throw new AccountError(400, 'Cursor de posts inválido.');
  const [time, id] = value.split('/');
  return `${postTime(time)}/${uuid(id)}`;
}
export function postContent(value: unknown): PostContent {
  const data = object(value);
  keys(data, ['title', 'text', 'tag']);
  const title = communityText(data['title'], 200, true);
  if (/[\n\t]/u.test(title))
    throw new AccountError(400, 'Título deve ocupar uma linha.');
  return {
    title,
    text: communityText(data['text'], 4000),
    tag: communityCursor(data['tag']),
  };
}
export function postTagLabel(value: unknown): string {
  const label = communityText(value, 36);
  if (/[\n\t]/u.test(label))
    throw new AccountError(400, 'Tag deve ocupar uma linha.');
  return label;
}
export function postTag(value: unknown): PostTag {
  const data = object(value);
  keys(data, ['id', 'label', 'active', 'revision']);
  return {
    id: uuid(data['id']),
    label: postTagLabel(data['label']),
    active: communityBoolean(data['active']),
    revision: communityRevision(data['revision']),
  };
}
export function communityPost(value: unknown): CommunityPost {
  const data = object(value);
  keys(data, [
    'id',
    'community',
    'author',
    'title',
    'text',
    'tag',
    'createdAt',
    'editedAt',
    'revision',
    'status',
    'parent',
    'root',
    'score',
    'replies',
  ]);
  const status = data['status'];
  if (status !== 'visible' && status !== 'removed' && status !== 'deleted')
    throw new AccountError(400, 'Estado do post inválido.');
  const author = data['author'] === null ? null : publicProfile(data['author']),
    tag = data['tag'] === null ? null : postTag(data['tag']);
  const title = communityText(data['title'], 200, true),
    text = communityText(data['text'], 4000, status !== 'visible');
  const hiddenFields = [title, text, author, tag].some(
    (field) => field !== '' && field !== null,
  );
  if (status !== 'visible' && hiddenFields)
    throw new AccountError(400, 'Marcador de post contém dados restritos.');
  return {
    id: uuid(data['id']),
    community: uuid(data['community']),
    author,
    title,
    text,
    tag,
    createdAt: postTime(data['createdAt']),
    editedAt: data['editedAt'] === null ? null : postTime(data['editedAt']),
    revision: communityRevision(data['revision']),
    status,
    ...postTree(data),
    score: postCount(data['score'], true),
    replies: postCount(data['replies']),
  };
}
export function postPage(value: unknown): PostPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(communityPost),
    next: postCursor(data['next']),
  };
}
export function tagPage(value: unknown): TagPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(postTag),
    next: communityCursor(data['next']),
  };
}
export function privatePostPage(value: unknown): PrivatePostPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(postState),
    next: postCursor(data['next']),
  };
}
function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : communityText(value, maximum);
}
export function postRemoval(value: unknown): PostRemoval {
  const data = object(value);
  keys(data, ['id', 'reason', 'createdAt', 'restored', 'appeal', 'decision']);
  return {
    id: uuid(data['id']),
    reason: communityText(data['reason'], 1000),
    createdAt: postTime(data['createdAt']),
    restored: communityBoolean(data['restored']),
    appeal: nullableText(data['appeal'], 2000),
    decision: nullableText(data['decision'], 1000),
  };
}
export function postState(value: unknown): PostState {
  const data = object(value);
  keys(data, [
    'post',
    'own',
    'manager',
    'canEdit',
    'canDelete',
    'content',
    'removal',
    'vote',
  ]);
  const own = communityBoolean(data['own']),
    manager = communityBoolean(data['manager']);
  const content =
      data['content'] === null ? null : postContent(data['content']),
    removal = data['removal'] === null ? null : postRemoval(data['removal']);
  if (!own && !manager && (content || removal))
    throw new AccountError(400, 'Estado do post contém dados restritos.');
  return {
    post: communityPost(data['post']),
    own,
    manager,
    canEdit: communityBoolean(data['canEdit']),
    canDelete: communityBoolean(data['canDelete']),
    content,
    removal,
    vote: postVote(data['vote']),
  };
}
/** Links never load previews or embed external media. Only explicit HTTP(S) navigation. */
export function postLink(value: string): string | null {
  if (value.length > 2048 || /[\s\p{Cc}\p{Cf}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export interface PostVote {
  position: -1 | 0 | 1;
  revision: number;
}
export function votePosition(value: unknown): -1 | 0 | 1 {
  if (value !== -1 && value !== 0 && value !== 1)
    throw new AccountError(400, 'Voto inválido.');
  return value;
}
export function postCount(value: unknown, signed = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    (!signed && value < 0)
  )
    throw new AccountError(400, 'Contagem inválida.');
  return value;
}
export function postVote(value: unknown): PostVote {
  const data = object(value);
  keys(data, ['position', 'revision']);
  return {
    position: votePosition(data['position']),
    revision: postCount(data['revision']),
  };
}
function postTree(data: Record<string, unknown>) {
  const parent = communityCursor(data['parent']),
    root = communityCursor(data['root']);
  if (
    (parent === null) !== (root === null) ||
    parent === data['id'] ||
    root === data['id']
  )
    throw new AccountError(400, 'Árvore inválida.');
  if (parent && (data['title'] !== '' || data['tag'] !== null))
    throw new AccountError(400, 'Resposta não admite título/tag.');
  return { parent, root };
}
export interface ReplyNotification {
  reply: string;
  post: string;
  community: string;
  createdAt: string;
  read: boolean;
}
export interface ReplyNotificationPage {
  items: ReplyNotification[];
  next: string | null;
}
export function replyNotificationPage(value: unknown): ReplyNotificationPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map((value) => {
      const row = object(value);
      keys(row, ['reply', 'post', 'community', 'createdAt', 'read']);
      return {
        reply: uuid(row['reply']),
        post: uuid(row['post']),
        community: uuid(row['community']),
        createdAt: postTime(row['createdAt']),
        read: communityBoolean(row['read']),
      };
    }),
    next: postCursor(data['next']),
  };
}
