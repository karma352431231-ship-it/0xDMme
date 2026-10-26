import type pg from 'pg';
import { EngagementQueryError } from '../../shared/engagement-metrics/index.ts';
import type {
  EngagementSnapshot,
  EngagementSnapshotPage,
} from '../../shared/engagement-metrics/index.ts';
import {
  engagementTarget,
  operationInteger,
  operationTimestamp,
} from '../../shared/engagement-metrics/index.ts';

interface SnapshotCursor {
  asOf: string;
  revision: string;
  generation: string;
  before: string | null;
  last: Pick<
    EngagementSnapshot,
    'cutoff' | 'period' | 'metric' | 'scope' | 'entity'
  >;
}

function readCursor(value: string): SnapshotCursor {
  if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(value))
    throw new EngagementQueryError('Invalid snapshot cursor.');
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    return validateCursor(parsed);
  } catch {
    throw new EngagementQueryError('Invalid snapshot cursor.');
  }
}

function validateCursor(value: unknown): SnapshotCursor {
  if (!value || typeof value !== 'object') throw new Error('Invalid cursor.');
  const data = value as Record<string, unknown>;
  if (!data['last'] || typeof data['last'] !== 'object')
    throw new Error('Invalid cursor.');
  const last = data['last'] as Record<string, unknown>;
  if (
    !['day', 'week', 'month'].includes(String(last['period'])) ||
    ![
      'public_site_visitors_estimated',
      'public_contributors_distinct',
    ].includes(String(last['metric'])) ||
    !['project', 'community'].includes(String(last['scope']))
  )
    throw new Error('Invalid cursor.');
  const target = engagementTarget(last['scope'], last['entity']);
  return {
    asOf: operationTimestamp(data['asOf']),
    revision: operationInteger(data['revision']),
    generation: operationInteger(data['generation']),
    before: data['before'] === null ? null : operationTimestamp(data['before']),
    last: {
      cutoff: operationTimestamp(last['cutoff']),
      period: last['period'] as EngagementSnapshot['period'],
      metric: last['metric'] as EngagementSnapshot['metric'],
      scope: target.scope as 'project' | 'community',
      entity: target.entity,
    },
  };
}

interface SnapshotRequest {
  limit: number;
  before: string | null;
  cursor: SnapshotCursor | null;
}

function snapshotRequest(input: {
  before?: string;
  cursor?: string;
  limit?: number;
}): SnapshotRequest {
  const limit = input.limit ?? 1000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new EngagementQueryError(
      'Snapshot page size must be between 1 and 1000.',
    );
  if (input.before && input.cursor)
    throw new EngagementQueryError(
      'Resume a snapshot cursor without a new cutoff.',
    );
  const cursor = input.cursor ? readCursor(input.cursor) : null;
  const before = cursor
    ? cursor.before
    : input.before
      ? operationTimestamp(input.before)
      : null;
  return { limit, before, cursor };
}

async function snapshotBaseline(
  client: pg.PoolClient,
  cursor: SnapshotCursor | null,
) {
  const state = (
    await client.query<{ now: Date; revision: string; generation: string }>(
      'SELECT clock_timestamp() AS now,correction_revision::text AS revision,snapshot_generation::text AS generation FROM hash_talk.engagement_state WHERE singleton',
    )
  ).rows[0]!;
  const asOf = cursor ? cursor.asOf : state.now.toISOString();
  const revision = cursor ? cursor.revision : state.revision;
  const generation = cursor ? cursor.generation : state.generation;
  if (
    asOf > state.now.toISOString() ||
    BigInt(revision) > BigInt(state.revision) ||
    BigInt(generation) > BigInt(state.generation)
  )
    throw new EngagementQueryError('Snapshot cursor is ahead of collection.');
  return { asOf, revision, generation };
}

function snapshotPage(
  found: EngagementSnapshot[],
  request: SnapshotRequest,
  baseline: { asOf: string; revision: string; generation: string },
): EngagementSnapshotPage {
  const { asOf, revision, generation } = baseline;
  const rows = found.slice(0, request.limit);
  const last = rows.at(-1);
  const next =
    found.length > request.limit && last
      ? Buffer.from(
          JSON.stringify({
            asOf,
            revision,
            generation,
            before: request.before,
            last: {
              cutoff: last.cutoff,
              period: last.period,
              metric: last.metric,
              scope: last.scope,
              entity: last.entity,
            },
          }),
        ).toString('base64url')
      : null;
  return {
    rows,
    next,
    asOf,
    correctionRevision: revision,
    snapshotGeneration: generation,
  };
}

/** A complete key, rather than just a timestamp, resumes a crowded cutoff. */
export async function engagementSnapshots(
  pool: pg.Pool,
  input: { before?: string; cursor?: string; limit?: number } = {},
): Promise<EngagementSnapshotPage> {
  const request = snapshotRequest(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const baseline = await snapshotBaseline(client, request.cursor);
    const found = await snapshotRows(client, {
      ...baseline,
      before: request.before,
      last: request.cursor ? request.cursor.last : null,
      limit: request.limit,
    });
    const page = snapshotPage(found, request, baseline);
    await client.query('COMMIT');
    return page;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function snapshotRows(
  client: pg.PoolClient,
  options: {
    asOf: string;
    revision: string;
    generation: string;
    before: string | null;
    last: SnapshotCursor['last'] | null;
    limit: number;
  },
): Promise<EngagementSnapshot[]> {
  const { asOf, revision, generation, before, last, limit } = options;
  const position = last ?? {
    cutoff: null,
    period: null,
    metric: null,
    scope: null,
    entity: null,
  };
  const found = await client.query<EngagementSnapshot>(
    `SELECT to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS cutoff,
       period,metric,scope,entity::text,value::text,complete,revision::text
     FROM (SELECT DISTINCT ON(cutoff,period,metric,scope,entity) s.*
       FROM hash_talk.engagement_snapshots s
       WHERE cutoff<=$1 AND revision<=$2 AND generation<=$10 AND ($3::timestamptz IS NULL OR cutoff<$3)
         AND (scope='project' OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities e
           WHERE e.scope='community' AND e.id=s.entity AND NOT e.erased))
       ORDER BY cutoff DESC,period,metric,scope,entity,revision DESC) latest
     WHERE $4::timestamptz IS NULL OR cutoff<$4 OR
       (cutoff=$4 AND (period,metric,scope,entity)>($5,$6,$7,$8::uuid))
     ORDER BY cutoff DESC,period,metric,scope,entity LIMIT $9`,
    [
      asOf,
      revision,
      before,
      position.cutoff,
      position.period,
      position.metric,
      position.scope,
      position.entity,
      limit + 1,
      generation,
    ],
  );
  return found.rows;
}
