import { uuid } from '../account/index.ts';
import { EngagementQueryError } from './query.ts';
import { publicPageCategories } from './collection.ts';
import type { PublicPageCategory } from './collection.ts';

export const projectMetricEntity = '00000000-0000-0000-0000-000000000000';
export type EngagementTarget = {
  scope: 'project' | 'community' | 'post';
  entity: string;
};
export type TrafficCorrection = EngagementTarget & {
  kind: 'traffic';
  id: string;
  metric:
    | 'public_page_views'
    | 'post_views_estimated'
    | 'reply_views_estimated'
    | 'share_actions_started'
    | 'links_copied';
  bucket: string;
  category: PublicPageCategory | 'all';
  delta: string;
  reason: 'invalid_traffic' | 'measurement_error';
};
export interface SnapshotCorrection {
  kind: 'snapshot';
  id: string;
  cutoff: string;
  expectedRevision: string;
  value: string;
  reason: 'invalid_traffic' | 'measurement_error';
}
export type EngagementCorrection = TrafficCorrection | SnapshotCorrection;

export function operationTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length !== 24 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new EngagementQueryError('Use a canonical UTC operation timestamp.');
  return value;
}

export function operationInteger(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/u.test(value))
    throw new EngagementQueryError('Use a nonnegative decimal integer string.');
  if (BigInt(value) > 9_223_372_036_854_775_807n)
    throw new EngagementQueryError('The operation exceeds the bigint range.');
  return value;
}

export function engagementTarget(
  scope: unknown,
  entity: unknown,
): EngagementTarget {
  if (!['project', 'community', 'post'].includes(String(scope)))
    throw new EngagementQueryError('Choose project, community or post scope.');
  if (scope === 'project') {
    if (entity !== undefined && entity !== projectMetricEntity)
      throw new EngagementQueryError('Project scope has no public entity ID.');
    return { scope, entity: projectMetricEntity };
  }
  return {
    scope: scope as 'community' | 'post',
    entity: operationUuid(entity),
  };
}

function operationUuid(value: unknown): string {
  try {
    return uuid(value);
  } catch {
    throw new EngagementQueryError(
      'Use a valid operation or public entity UUID.',
    );
  }
}

function correctionObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EngagementQueryError('Expected a correction object.');
  return value as Record<string, unknown>;
}

function validateFields(data: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(data).some((key) => !fields.includes(key)))
    throw new EngagementQueryError('Unknown correction field.');
  if (
    !['invalid_traffic', 'measurement_error'].includes(String(data['reason']))
  )
    throw new EngagementQueryError('Choose a supported correction reason.');
}

/** Operator corrections remove qualified traffic; accepted creation totals are immutable. */
export function engagementCorrection(value: unknown): EngagementCorrection {
  const data = correctionObject(value);
  return data['kind'] === 'snapshot'
    ? snapshotCorrection(data)
    : trafficCorrection(data);
}

function snapshotCorrection(data: Record<string, unknown>): SnapshotCorrection {
  const reason = data['reason'] as 'invalid_traffic' | 'measurement_error';
  validateFields(data, [
    'id',
    'kind',
    'cutoff',
    'expectedRevision',
    'value',
    'reason',
  ]);
  return {
    kind: 'snapshot',
    id: operationUuid(data['id']),
    reason,
    cutoff: operationTimestamp(data['cutoff']),
    expectedRevision: operationInteger(data['expectedRevision']),
    value: operationInteger(data['value']),
  };
}

function trafficCorrection(data: Record<string, unknown>): TrafficCorrection {
  validateFields(data, [
    'id',
    'kind',
    'metric',
    'bucket',
    'scope',
    'entity',
    'category',
    'delta',
    'reason',
  ]);
  if (
    data['kind'] !== 'traffic' ||
    ![
      'public_page_views',
      'post_views_estimated',
      'reply_views_estimated',
      'share_actions_started',
      'links_copied',
    ].includes(String(data['metric']))
  )
    throw new EngagementQueryError(
      'Only observed public traffic supports traffic corrections.',
    );
  const bucket = operationTimestamp(data['bucket']);
  if (Date.parse(bucket) % 60_000 !== 0)
    throw new EngagementQueryError('Correct one complete metric minute.');
  const category = data['category'];
  if (
    data['metric'] === 'public_page_views'
      ? !publicPageCategories.includes(category as PublicPageCategory)
      : category !== 'all'
  )
    throw new EngagementQueryError(
      'Use a category supported by the corrected metric.',
    );
  const target = engagementTarget(data['scope'], data['entity']);
  const requiredScope =
    data['metric'] !== 'public_page_views' || category === 'post'
      ? 'post'
      : category === 'community'
        ? 'community'
        : 'project';
  if (target.scope !== requiredScope)
    throw new EngagementQueryError(
      'Correct the most specific scope of the observed traffic.',
    );
  return {
    ...target,
    kind: 'traffic',
    id: operationUuid(data['id']),
    reason: data['reason'] as TrafficCorrection['reason'],
    bucket,
    metric: data['metric'] as TrafficCorrection['metric'],
    category: category as TrafficCorrection['category'],
    delta: correctionDelta(data['delta']),
  };
}

function correctionDelta(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('-'))
    throw new EngagementQueryError(
      'Traffic corrections must remove a positive number of observations.',
    );
  const magnitude = operationInteger(value.slice(1));
  if (magnitude === '0')
    throw new EngagementQueryError('A correction cannot be zero.');
  return '-' + magnitude;
}
