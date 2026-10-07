import { AccountError, keys, object, uuid } from '../account/index.ts';
import {
  community,
  communityArray,
  communityBoolean,
  communityCursor,
  communityText,
} from '../communities/index.ts';
import type { Community } from '../communities/index.ts';
import { publicAvatar } from '../public-media/index.ts';
import {
  communityPost,
  postCount,
  postTime,
} from '../community-posts/index.ts';
import type { CommunityPost } from '../community-posts/index.ts';

export type FeedOrder = 'recent' | 'votes' | 'replies';
export type DiscoveryPeriod = 'day' | 'week' | 'month' | 'all';
export type FeedScope = 'all' | 'following' | 'saved' | 'hidden';
export interface FeedFilter {
  scope: FeedScope;
  order: FeedOrder;
  period: DiscoveryPeriod;
  community: string | null;
  tag: string | null;
}
export interface ExploreFilter {
  order: 'size' | 'activity';
  period: DiscoveryPeriod;
}
export interface RankCursor {
  filter: string;
  anchor: string;
  rank: number;
  time: string;
  id: string;
}
export interface FeedEntry {
  post: CommunityPost;
  community: { id: string; name: string; avatar?: string | null };
}
export interface FeedPage {
  items: FeedEntry[];
  next: string | null;
}
export interface ExplorePage {
  items: { community: Community; activity: number }[];
  next: string | null;
}
export interface PostPreference {
  saved: boolean;
  hidden: boolean;
  revision: number;
}

export function discoveryPeriod(value: unknown): DiscoveryPeriod {
  if (
    value !== 'day' &&
    value !== 'week' &&
    value !== 'month' &&
    value !== 'all'
  )
    throw new AccountError(400, 'Período inválido.');
  return value;
}
export function feedOrder(value: unknown): FeedOrder {
  if (value !== 'recent' && value !== 'votes' && value !== 'replies')
    throw new AccountError(400, 'Ordenação inválida.');
  return value;
}
export function feedFilter(value: unknown): FeedFilter {
  const data = object(value);
  keys(data, ['scope', 'order', 'period', 'community', 'tag']);
  const scope = data['scope'];
  if (
    scope !== 'all' &&
    scope !== 'following' &&
    scope !== 'saved' &&
    scope !== 'hidden'
  )
    throw new AccountError(400, 'Feed inválido.');
  const communityId = communityCursor(data['community']),
    tag = communityCursor(data['tag']);
  if (tag && !communityId) throw new AccountError(400, 'Tag exige comunidade.');
  return {
    scope,
    order: feedOrder(data['order']),
    period: discoveryPeriod(data['period']),
    community: communityId,
    tag,
  };
}
export function exploreFilter(value: unknown): ExploreFilter {
  const data = object(value);
  keys(data, ['order', 'period']);
  const order = data['order'];
  if (order !== 'size' && order !== 'activity')
    throw new AccountError(400, 'Classificação inválida.');
  return { order, period: discoveryPeriod(data['period']) };
}
export function discoveryKey(value: FeedFilter | ExploreFilter): string {
  return JSON.stringify(value);
}
export function rankCursor(value: unknown, filter?: string): RankCursor | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 500)
    throw new AccountError(400, 'Cursor de descoberta inválido.');
  let data: Record<string, unknown>;
  try {
    data = object(JSON.parse(value));
  } catch {
    throw new AccountError(400, 'Cursor de descoberta inválido.');
  }
  keys(data, ['filter', 'anchor', 'rank', 'time', 'id']);
  const key = communityText(data['filter'], 240);
  if (filter !== undefined && key !== filter)
    throw new AccountError(400, 'Cursor pertence a outros filtros.');
  return {
    filter: key,
    anchor: postTime(data['anchor']),
    rank: postCount(data['rank'], true),
    time: postTime(data['time']),
    id: uuid(data['id']),
  };
}
export function discoveryWindow(
  period: DiscoveryPeriod,
  anchor: string,
): string | null {
  const days = { day: 1, week: 7, month: 30, all: null }[period];
  return days === null
    ? null
    : new Date(Date.parse(anchor) - days * 86_400_000).toISOString();
}
function nextCursor(value: unknown): string | null {
  rankCursor(value);
  return value as string | null;
}
export function feedPage(value: unknown): FeedPage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map((value) => {
      const row = object(value),
        group = object(row['community']);
      keys(row, ['post', 'community']);
      keys(
        group,
        Object.hasOwn(group, 'avatar')
          ? ['id', 'name', 'avatar']
          : ['id', 'name'],
      );
      const post = communityPost(row['post']),
        id = uuid(group['id']);
      if (post.community !== id)
        throw new AccountError(400, 'Comunidade do feed inválida.');
      return {
        post,
        community: {
          id,
          name: communityText(group['name'], 100),
          avatar: publicAvatar(group['avatar'] ?? null, 'community-photo', id),
        },
      };
    }),
    next: nextCursor(data['next']),
  };
}
export function explorePage(value: unknown): ExplorePage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map((value) => {
      const row = object(value);
      keys(row, ['community', 'activity']);
      return {
        community: community(row['community']),
        activity: postCount(row['activity']),
      };
    }),
    next: nextCursor(data['next']),
  };
}
export function postPreference(value: unknown): PostPreference {
  const data = object(value);
  keys(data, ['saved', 'hidden', 'revision']);
  return {
    saved: communityBoolean(data['saved']),
    hidden: communityBoolean(data['hidden']),
    revision: postCount(data['revision']),
  };
}
