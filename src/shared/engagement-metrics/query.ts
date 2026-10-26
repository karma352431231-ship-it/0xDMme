import { uuid } from '../account/index.ts';
import { engagementMetrics, isEngagementMetric } from './catalog.ts';
import type { EngagementMetric, MetricScope } from './catalog.ts';
import { publicPageCategories } from './collection.ts';
import type { PublicPageCategory } from './collection.ts';

export class EngagementQueryError extends Error {}

export type EngagementGrouping = 'none' | 'time' | 'community' | 'post';
export type EngagementEligibility = 'historical' | 'promotable';
export type EngagementBucket = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface EngagementOrder {
  readonly by: 'dimension' | EngagementMetric;
  readonly direction: 'asc' | 'desc';
}

/** An explicit interval is shared by every selected metric. Presets resolve upstream. */
export interface EngagementQuery {
  readonly metrics: readonly EngagementMetric[];
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
  readonly communityIds: readonly string[];
  readonly postIds: readonly string[];
  readonly pageCategories: readonly PublicPageCategory[];
  readonly removalCause: 'user' | 'cleanup' | null;
  readonly groupBy: EngagementGrouping;
  readonly bucket: EngagementBucket | null;
  readonly eligibility: EngagementEligibility;
  readonly orderBy: EngagementOrder;
  readonly limit: number;
  readonly cursor: string | null;
}

const queryFields = new Set([
  'metrics',
  'from',
  'to',
  'timezone',
  'communityIds',
  'postIds',
  'pageCategories',
  'removalCause',
  'groupBy',
  'bucket',
  'eligibility',
  'orderBy',
  'limit',
  'cursor',
]);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new EngagementQueryError('Expected a metric query object.');
  return value as Record<string, unknown>;
}

function selection(value: unknown): EngagementMetric[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 22)
    throw new EngagementQueryError('Select between 1 and 22 distinct metrics.');
  const selected: EngagementMetric[] = [];
  for (const item of value) {
    if (!isEngagementMetric(item) || selected.includes(item))
      throw new EngagementQueryError('Unknown or duplicate metric.');
    selected.push(item);
  }
  return selected;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 24)
    throw new EngagementQueryError('Use a canonical UTC ISO timestamp.');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value)
    throw new EngagementQueryError('Use a canonical UTC ISO timestamp.');
  return value;
}

function timezone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64)
    throw new EngagementQueryError(
      'An explicit reporting timezone is required.',
    );
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    throw new EngagementQueryError('Unsupported reporting timezone.');
  }
}

function entityIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new EngagementQueryError(
      'An entity filter needs 1 to 100 unique IDs.',
    );
  const result = value.map((id: unknown) => uuid(id));
  if (new Set(result).size !== result.length)
    throw new EngagementQueryError('Duplicate entity filter.');
  return result.sort();
}

function grouping(value: unknown): EngagementGrouping {
  if (
    value !== 'none' &&
    value !== 'time' &&
    value !== 'community' &&
    value !== 'post'
  )
    throw new EngagementQueryError('Unsupported report grouping.');
  return value;
}

function bucket(
  value: unknown,
  groupBy: EngagementGrouping,
): EngagementBucket | null {
  if (groupBy !== 'time') {
    if (value !== undefined)
      throw new EngagementQueryError('A time bucket requires time grouping.');
    return null;
  }
  if (
    typeof value !== 'string' ||
    !['minute', 'hour', 'day', 'week', 'month'].includes(value)
  )
    throw new EngagementQueryError(
      'Time grouping requires an explicit bucket.',
    );
  return value as EngagementBucket;
}

function eligibility(value: unknown): EngagementEligibility {
  if (value !== 'historical' && value !== 'promotable')
    throw new EngagementQueryError(
      'Choose historical or promotable eligibility.',
    );
  return value;
}

function ordering(
  value: unknown,
  metrics: readonly EngagementMetric[],
): EngagementOrder {
  const data = record(value);
  if (Object.keys(data).length !== 2 || !Object.hasOwn(data, 'by'))
    throw new EngagementQueryError('Invalid report ordering.');
  const by = data['by'];
  if (by !== 'dimension' && (!isEngagementMetric(by) || !metrics.includes(by)))
    throw new EngagementQueryError('Order by a selected metric or dimension.');
  const direction = data['direction'];
  if (direction !== 'asc' && direction !== 'desc')
    throw new EngagementQueryError('Invalid ordering direction.');
  return { by, direction };
}

function pageLimit(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 1000
  )
    throw new EngagementQueryError('Report limit must be between 1 and 1000.');
  return value;
}

function cursor(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/u.test(value))
    throw new EngagementQueryError('Invalid report cursor.');
  return value;
}

function requireScope(metric: EngagementMetric, scope: MetricScope): void {
  if (!engagementMetrics[metric].scopes.includes(scope))
    throw new EngagementQueryError(
      `${metric} does not support ${scope} scope.`,
    );
}

function compatible(query: EngagementQuery): void {
  for (const metric of query.metrics) {
    requireMetricFilters(metric, query);
    if (query.communityIds.length) requireScope(metric, 'community');
    if (query.postIds.length) requireScope(metric, 'post');
    if (query.groupBy === 'community' || query.groupBy === 'post')
      requireScope(metric, query.groupBy);
    if (
      query.groupBy === 'time' &&
      engagementMetrics[metric].aggregation === 'current'
    )
      throw new EngagementQueryError(
        `${metric} has no historical time buckets.`,
      );
    if (query.eligibility === 'promotable') requireScope(metric, 'community');
  }
}

function requireMetricFilters(
  metric: EngagementMetric,
  query: EngagementQuery,
): void {
  if (query.pageCategories.length && metric !== 'public_page_views')
    throw new EngagementQueryError(
      'Page categories only filter public_page_views.',
    );
  if (
    query.removalCause !== null &&
    !['upvotes_removed', 'downvotes_removed'].includes(metric)
  )
    throw new EngagementQueryError('Removal cause only filters vote removals.');
  if (query.eligibility === 'promotable' && metric === 'public_page_views')
    throw new EngagementQueryError(
      'Public page views do not support post-promotion eligibility.',
    );
}

function pageCategories(value: unknown): PublicPageCategory[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 5)
    throw new EngagementQueryError('Select 1 to 5 page categories.');
  const result = value.map((category: unknown) => {
    if (
      typeof category !== 'string' ||
      !publicPageCategories.includes(category as PublicPageCategory)
    )
      throw new EngagementQueryError('Unsupported page category.');
    return category as PublicPageCategory;
  });
  if (new Set(result).size !== result.length)
    throw new EngagementQueryError('Duplicate page category.');
  return result.sort();
}

function removalCause(value: unknown): 'user' | 'cleanup' | null {
  if (value === undefined) return null;
  if (value !== 'user' && value !== 'cleanup')
    throw new EngagementQueryError('Invalid vote removal cause.');
  return value;
}

/** Reject incompatible filters for the whole selection instead of ignoring them. */
export function engagementQuery(value: unknown): EngagementQuery {
  const data = record(value);
  if (Object.keys(data).some((key) => !queryFields.has(key)))
    throw new EngagementQueryError('Unknown metric query field.');
  const metrics = selection(data['metrics']);
  const groupBy = grouping(data['groupBy']);
  const query: EngagementQuery = {
    metrics,
    from: timestamp(data['from']),
    to: timestamp(data['to']),
    timezone: timezone(data['timezone']),
    communityIds: entityIds(data['communityIds']),
    postIds: entityIds(data['postIds']),
    pageCategories: pageCategories(data['pageCategories']),
    removalCause: removalCause(data['removalCause']),
    groupBy,
    bucket: bucket(data['bucket'], groupBy),
    eligibility: eligibility(data['eligibility']),
    orderBy: ordering(data['orderBy'], metrics),
    limit: pageLimit(data['limit']),
    cursor: cursor(data['cursor']),
  };
  if (query.from >= query.to)
    throw new EngagementQueryError(
      'A report interval must have from before to.',
    );
  compatible(query);
  return query;
}
