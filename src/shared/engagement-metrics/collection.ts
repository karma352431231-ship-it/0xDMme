import { AccountError, keys, object, uuid } from '../account/index.ts';

export const publicPageCategories = [
  'directory',
  'feed',
  'profile',
  'community',
  'post',
] as const;
export type PublicPageCategory = (typeof publicPageCategories)[number];
export interface PublicTrafficTarget {
  category: PublicPageCategory;
  community: string | null;
  post: string | null;
}
export interface EngagementObservation extends PublicTrafficTarget {
  id: string;
  kind: 'page' | 'share' | 'copy';
}
export interface EngagementVisitor {
  id: string;
  marker: string;
}

function observation(value: unknown): EngagementObservation {
  const item = object(value);
  keys(item, ['id', 'kind', 'category', 'community', 'post']);
  const kind = item['kind'];
  const category = item['category'];
  if (kind !== 'page' && kind !== 'share' && kind !== 'copy')
    throw new AccountError(400, 'Unsupported public observation.');
  if (
    typeof category !== 'string' ||
    !publicPageCategories.includes(category as PublicPageCategory)
  )
    throw new AccountError(400, 'Unsupported public page category.');
  const community = item['community'] === null ? null : uuid(item['community']);
  const post = item['post'] === null ? null : uuid(item['post']);
  const result: EngagementObservation = {
    id: uuid(item['id']),
    kind,
    category: category as PublicPageCategory,
    community,
    post,
  };
  targetShape(result);
  return result;
}

/** Separate transport: a visitor mark has no page, community or post dimension. */
export function engagementVisitor(value: unknown): EngagementVisitor {
  const item = object(value);
  keys(item, ['id', 'marker']);
  const marker = item['marker'];
  if (typeof marker !== 'string' || !/^[a-f0-9]{32}$/u.test(marker))
    throw new AccountError(400, 'Invalid public visitor marker.');
  return { id: uuid(item['id']), marker };
}

function targetShape(item: EngagementObservation): void {
  if (item.category === 'post') {
    if (!item.post || !item.community)
      throw new AccountError(400, 'A public post needs its community.');
    return;
  }
  if (item.post !== null)
    throw new AccountError(400, 'Unexpected public post identifier.');
  if (item.category === 'community') {
    if (!item.community)
      throw new AccountError(400, 'A public community needs its identifier.');
    return;
  }
  if (item.community !== null || item.kind !== 'page')
    throw new AccountError(400, 'Unexpected public observation dimension.');
}

export function engagementObservations(
  value: unknown,
): EngagementObservation[] {
  const input = object(value);
  keys(input, ['items']);
  const items = input['items'];
  if (!Array.isArray(items) || items.length < 1 || items.length > 24)
    throw new AccountError(
      400,
      'A public observation batch needs 1 to 24 items.',
    );
  const result = items.map((item: unknown) => observation(item));
  if (new Set(result.map((item) => item.id)).size !== result.length)
    throw new AccountError(400, 'Duplicate public observation.');
  return result;
}
