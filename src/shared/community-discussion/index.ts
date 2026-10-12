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
export interface DiscussionPage {
  items: CommunityPost[];
  next: string | null;
}
export function discussionOrder(value: unknown): DiscussionOrder {
  if (
    value !== 'discussed' &&
    value !== 'votes' &&
    value !== 'recent' &&
    value !== 'oldest'
  )
    throw new AccountError(400, 'Ordenação da discussão inválida.');
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
    throw new AccountError(400, 'Cursor da discussão inválido.');
  let data: Record<string, unknown>;
  try {
    data = object(JSON.parse(value));
  } catch {
    throw new AccountError(400, 'Cursor da discussão inválido.');
  }
  keys(data, ['key', 'anchor', 'activity', 'score', 'time', 'id']);
  if (
    typeof data['key'] !== 'string' ||
    data['key'].length > 200 ||
    (key !== undefined && data['key'] !== key)
  )
    throw new AccountError(
      400,
      'Cursor pertence a outra discussão ou ordenação.',
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
  keys(data, ['items', 'next']);
  discussionCursor(data['next']);
  return {
    items: communityArray(data['items']).map(communityPost),
    next: data['next'] as string | null,
  };
}
export const discussionOrders = [
  ['discussed', 'Mais discutidos'],
  ['votes', 'Mais votados'],
  ['recent', 'Recentes'],
  ['oldest', 'Mais antigos'],
] as const;
