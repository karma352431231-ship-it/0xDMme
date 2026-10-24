import { AccountError, keys, object, uuid } from '../account/index.ts';
import { communityArray } from '../communities/index.ts';
import {
  communityPost,
  postCount,
  postTime,
} from '../community-posts/index.ts';
import type { CommunityPost } from '../community-posts/index.ts';

export type DiscussionOrder = 'discussed' | 'votes' | 'recent' | 'oldest';
export interface DiscussionCursor {
  key: string;
  anchor: string;
  activity: number;
  score: number;
  time: string;
  id: string;
}
export interface DiscussionSelection {
  order: DiscussionOrder;
  after: string | null;
  preview?: 'top' | undefined;
}
export interface DiscussionPage {
  items: CommunityPost[];
  next: string | null;
  /** Opt-in only: one visible highest-voted child per item. */
  previews?: CommunityPost[];
}
export function discussionPreview(value: unknown): 'top' | undefined {
  if (value === undefined || value === 'top') return value;
  throw new AccountError(400, 'Invalid discussion preview.');
}
export function discussionOrder(value: unknown): DiscussionOrder {
  if (
    value !== 'discussed' &&
    value !== 'votes' &&
    value !== 'recent' &&
    value !== 'oldest'
  )
    throw new AccountError(400, 'Invalid discussion ordering.');
  return value;
}
export function discussionKey(
  community: string,
  parent: string,
  order: DiscussionOrder,
) {
  return JSON.stringify([
    1,
    uuid(community),
    uuid(parent),
    discussionOrder(order),
  ]);
}
export function discussionCursor(
  value: unknown,
  key?: string,
): DiscussionCursor | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 700)
    throw new AccountError(400, 'Invalid discussion cursor.');
  let data: Record<string, unknown>;
  try {
    data = object(JSON.parse(value));
  } catch {
    throw new AccountError(400, 'Invalid discussion cursor.');
  }
  keys(data, ['key', 'anchor', 'activity', 'score', 'time', 'id']);
  if (
    typeof data['key'] !== 'string' ||
    data['key'].length > 200 ||
    (key !== undefined && data['key'] !== key)
  )
    throw new AccountError(
      400,
      'Cursor belongs to another discussion or ordering.',
    );
  return {
    key: data['key'],
    anchor: postTime(data['anchor']),
    activity: postCount(data['activity']),
    score: postCount(data['score'], true),
    time: postTime(data['time']),
    id: uuid(data['id']),
  };
}
export function discussionPage(value: unknown): DiscussionPage {
  const data = object(value);
  const hasPreviews = Object.hasOwn(data, 'previews');
  keys(data, hasPreviews ? ['items', 'next', 'previews'] : ['items', 'next']);
  discussionCursor(data['next']);
  const items = communityArray(data['items']).map(communityPost);
  return {
    items,
    next: data['next'] as string | null,
    ...(hasPreviews ? { previews: previewPosts(data['previews'], items) } : {}),
  };
}
function previewPosts(value: unknown, items: CommunityPost[]): CommunityPost[] {
  const parents = new Map(items.map((post) => [post.id, post])),
    seen = new Set<string>(),
    previews = communityArray(value).map(communityPost);
  for (const post of previews) {
    const parent = parents.get(post.parent ?? '');
    if (
      !parent ||
      parent.status !== 'visible' ||
      post.status !== 'visible' ||
      post.community !== parent.community ||
      post.root !== (parent.root ?? parent.id) ||
      seen.has(parent.id)
    )
      throw new AccountError(400, 'Invalid discussion preview.');
    seen.add(parent.id);
  }
  return previews;
}
export const discussionOrders = [
  ['discussed', 'community.sort-most-discussed'],
  ['votes', 'Top voted'],
  ['recent', 'Recent'],
  ['oldest', 'Oldest'],
] as const;
