import { createHash } from 'node:crypto';
import type pg from 'pg';
import { engagementCoverage } from './engagement-health.ts';
import {
  engagementDefinitionVersion,
  engagementInterval,
  engagementMetrics,
  engagementPresets,
  engagementQuery,
  EngagementQueryError,
} from '../../shared/engagement-metrics/index.ts';
import type {
  EngagementMetric,
  EngagementPreset,
  EngagementQuery,
  EngagementReport,
  EngagementRow,
  EngagementValue,
  EngagementCoverage,
} from '../../shared/engagement-metrics/index.ts';
import { object } from '../../shared/account/index.ts';

interface ReportState {
  cutoff: Date;
  started: Date;
  heartbeat: Date | null;
  authorErased: Date | null;
  communityErased: Date | null;
  revision: string;
  contributorsReset: Date | null;
}
interface RawValue {
  dimension: string;
  metric: EngagementMetric;
  value: string;
}

function request(
  input: unknown,
  state: ReportState,
): { query: EngagementQuery; liveVisitors: boolean } {
  const data = { ...object(input) };
  const preset = data['preset'];
  delete data['preset'];
  const timezone = data['timezone'] ?? 'America/Fortaleza';
  let interval = {};
  if (preset !== undefined) {
    if (Object.hasOwn(data, 'from') || Object.hasOwn(data, 'to'))
      throw new EngagementQueryError(
        'Choose a preset or an explicit interval.',
      );
    if (
      typeof preset !== 'string' ||
      !engagementPresets.includes(preset as EngagementPreset)
    )
      throw new EngagementQueryError('Unsupported report preset.');
    if (typeof timezone !== 'string')
      throw new EngagementQueryError('Invalid report timezone.');
    interval = engagementInterval({
      preset: preset as EngagementPreset,
      cutoff: state.cutoff.toISOString(),
      startedAt: state.started.toISOString(),
      timezone,
    });
  }
  return {
    query: engagementQuery({
      groupBy: 'none',
      eligibility: 'historical',
      orderBy: { by: 'dimension', direction: 'asc' },
      limit: 100,
      ...data,
      timezone,
      ...interval,
    }),
    liveVisitors: preset === 'last24h',
  };
}

function digest(query: EngagementQuery): string {
  return createHash('sha256')
    .update(
      JSON.stringify(query, (key: string, value: unknown) =>
        key === 'cursor' ? undefined : value,
      ),
    )
    .digest('hex');
}

function pageOffset(query: EngagementQuery): number {
  if (query.cursor === null) return 0;
  const data = object(
    JSON.parse(
      Buffer.from(query.cursor, 'base64url').toString('utf8'),
    ) as unknown,
  );
  if (
    data['digest'] !== digest(query) ||
    typeof data['offset'] !== 'number' ||
    !Number.isInteger(data['offset']) ||
    data['offset'] < 1 ||
    data['offset'] > 100_000
  )
    throw new EngagementQueryError(
      'The report cursor does not match this explicit query.',
    );
  return data['offset'];
}

function scope(query: EngagementQuery): string {
  if (
    query.postIds.length ||
    query.groupBy === 'post' ||
    query.eligibility === 'promotable'
  )
    return 'post';
  if (query.communityIds.length || query.groupBy === 'community')
    return 'community';
  return 'project';
}

function dimension(query: EngagementQuery, alias: string): string {
  if (query.groupBy === 'none') return "'project'";
  if (query.groupBy === 'time')
    return `to_char((date_trunc($10,${alias}.bucket AT TIME ZONE $9) AT TIME ZONE $9) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  if (query.groupBy === 'community' && scope(query) === 'post')
    return 'e.community::text';
  return `${alias}.entity::text`;
}

function parameters(
  query: EngagementQuery,
  effective: { from: string; to: string },
): unknown[] {
  return [
    query.metrics,
    effective.from,
    effective.to,
    scope(query),
    query.communityIds,
    query.postIds,
    query.eligibility === 'promotable',
    Object.keys(engagementMetrics).filter(
      (id) =>
        engagementMetrics[id as EngagementMetric].aggregation === 'current',
    ),
    query.timezone,
    query.bucket ?? 'day',
    query.pageCategories,
    query.removalCause,
  ];
}

async function additive(
  client: pg.PoolClient,
  query: EngagementQuery,
  effective: { from: string; to: string },
): Promise<RawValue[]> {
  const found = await client.query<RawValue>(
    `SELECT ${dimension(query, 'n')} AS dimension,n.metric,sum(n.value)::text AS value
     FROM hash_talk.engagement_counts n
     LEFT JOIN hash_talk.engagement_entities e ON e.scope=n.scope AND e.id=n.entity
     LEFT JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=e.community
     WHERE n.metric=ANY($1::text[]) AND (n.metric=ANY($8::text[]) OR n.bucket>=$2::timestamptz)
       AND (n.metric=ANY($8::text[]) OR n.bucket<$3::timestamptz) AND n.scope=$4
       AND (n.scope='project' OR (NOT e.erased AND NOT c.erased))
       AND (cardinality($5::uuid[])=0 OR e.community=ANY($5::uuid[]))
       AND (cardinality($6::uuid[])=0 OR e.id=ANY($6::uuid[]) OR
         (n.metric IN ('replies_created','replies_published','reply_views_estimated') AND (e.root=ANY($6::uuid[]) OR e.parent=ANY($6::uuid[]))))
       AND $9::text IS NOT NULL AND $10::text IS NOT NULL
       AND (cardinality($11::text[])=0 OR n.category=ANY($11::text[]))
       AND ($12::text IS NULL OR n.cause=$12)
       AND (NOT $7::boolean OR (e.eligible AND c.eligible AND (e.root IS NULL OR EXISTS
         (SELECT 1 FROM hash_talk.engagement_entities r WHERE r.scope='post' AND r.id=e.root AND r.eligible AND NOT r.erased))))
     GROUP BY 1,n.metric ORDER BY 1,n.metric LIMIT 100001`,
    parameters(query, effective),
  );
  if (found.rows.length > 100_000)
    throw new EngagementQueryError(
      'Report exceeds the row budget; narrow the interval or filters.',
    );
  return found.rows;
}

async function contributors(
  client: pg.PoolClient,
  query: EngagementQuery,
): Promise<RawValue[]> {
  const dim =
    query.groupBy === 'none'
      ? "'project'"
      : query.groupBy === 'time'
        ? `to_char((date_trunc($5,p.published_at AT TIME ZONE $4) AT TIME ZONE $4) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
        : 'p.community::text';
  const found = await client.query<RawValue>(
    `SELECT ${dim} AS dimension,'public_contributors_distinct' AS metric,count(DISTINCT p.author)::text AS value
     FROM hash_talk.engagement_contributors p
     JOIN hash_talk.engagement_entities e ON e.scope='post' AND e.id=p.post AND NOT e.erased
     JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=p.community AND NOT c.erased
     WHERE p.published_at>=$1 AND p.published_at<$2
       AND $4::text IS NOT NULL AND $5::text IS NOT NULL
       AND (cardinality($3::uuid[])=0 OR p.community=ANY($3::uuid[]))
       AND (NOT $6::boolean OR (e.eligible AND c.eligible AND (e.root IS NULL OR EXISTS
         (SELECT 1 FROM hash_talk.engagement_entities r WHERE r.scope='post' AND r.id=e.root AND r.eligible AND NOT r.erased))))
     GROUP BY 1 LIMIT 100001`,
    [
      query.from,
      query.to,
      query.communityIds,
      query.timezone,
      query.bucket ?? 'day',
      query.eligibility === 'promotable',
    ],
  );
  if (found.rows.length > 100_000)
    throw new EngagementQueryError(
      'Contributor report exceeds the row budget.',
    );
  return found.rows;
}

async function activeCommunities(
  client: pg.PoolClient,
  query: EngagementQuery,
): Promise<RawValue[]> {
  const result = await client.query<{ value: string }>(
    `SELECT count(DISTINCT e.community)::text AS value FROM hash_talk.engagement_counts n
     JOIN hash_talk.engagement_entities e ON e.scope=n.scope AND e.id=n.entity AND NOT e.erased
     JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=e.community AND NOT c.erased
     WHERE n.scope=CASE WHEN $3::boolean THEN 'post' ELSE 'community' END AND n.metric IN ('posts_published','replies_published')
       AND n.bucket>=$1 AND n.bucket<$2 AND (NOT $3::boolean OR (e.eligible AND c.eligible AND (e.root IS NULL OR EXISTS
         (SELECT 1 FROM hash_talk.engagement_entities r WHERE r.scope='post' AND r.id=e.root AND r.eligible AND NOT r.erased))))`,
    [query.from, query.to, query.eligibility === 'promotable'],
  );
  return [
    {
      dimension: 'project',
      metric: 'communities_active',
      value: result.rows[0]!.value,
    },
  ];
}

async function visitors(
  client: pg.PoolClient,
  query: EngagementQuery,
  live: boolean,
): Promise<RawValue[]> {
  if (!live) {
    const snapshot = await client.query<{ value: string }>(
      `SELECT value::text FROM hash_talk.engagement_snapshots WHERE metric='public_site_visitors_estimated'
       AND scope='project' AND period='day' AND cutoff=$2 AND cutoff-interval '24 hours'=$1
       ORDER BY revision DESC LIMIT 1`,
      [query.from, query.to],
    );
    return snapshot.rows.map((row) => ({
      dimension: 'project',
      metric: 'public_site_visitors_estimated',
      value: row.value,
    }));
  }
  const result = await client.query<{ value: string }>(
    'SELECT count(*)::text AS value FROM hash_talk.engagement_visitors WHERE seen_at>=$1 AND seen_at<$2',
    [query.from, query.to],
  );
  return [
    {
      dimension: 'project',
      metric: 'public_site_visitors_estimated',
      value: result.rows[0]!.value,
    },
  ];
}

function value(
  metric: EngagementMetric,
  raw: string | undefined,
  reason: string | undefined,
): EngagementValue {
  return {
    value: reason ? null : (raw ?? '0'),
    reason: reason ?? null,
    unit: engagementMetrics[metric].unit,
  };
}

function rows(
  query: EngagementQuery,
  raw: RawValue[],
  unavailable: Partial<Record<EngagementMetric, string>>,
): EngagementRow[] {
  const dimensions = new Map<string, Map<EngagementMetric, string>>();
  if (query.groupBy === 'none') dimensions.set('project', new Map());
  for (const item of raw) {
    const group =
      dimensions.get(item.dimension) ?? new Map<EngagementMetric, string>();
    group.set(item.metric, item.value);
    dimensions.set(item.dimension, group);
  }
  if (dimensions.size * query.metrics.length > 100_000)
    throw new EngagementQueryError('Report exceeds the 100,000-value budget.');
  return [...dimensions].map(([dimension, values]) => ({
    dimension,
    values: Object.fromEntries(
      query.metrics.map((metric) => [
        metric,
        value(metric, values.get(metric), unavailable[metric]),
      ]),
    ),
  }));
}

function compare(
  query: EngagementQuery,
  a: EngagementRow,
  b: EngagementRow,
): number {
  if (query.orderBy.by !== 'dimension')
    return compareMetric(
      { metric: query.orderBy.by, direction: query.orderBy.direction },
      a,
      b,
    );
  const result = a.dimension.localeCompare(b.dimension);
  return query.orderBy.direction === 'asc' ? result : -result;
}

function compareMetric(
  order: { metric: EngagementMetric; direction: 'asc' | 'desc' },
  a: EngagementRow,
  b: EngagementRow,
): number {
  const left = rowCount(a, order.metric);
  const right = rowCount(b, order.metric);
  const tie = a.dimension.localeCompare(b.dimension);
  if (left === null || right === null)
    return left === null ? (right === null ? tie : 1) : -1;
  const result = integerOrder(left, right);
  return (order.direction === 'asc' ? result : -result) || tie;
}

function rowCount(row: EngagementRow, metric: EngagementMetric): string | null {
  return row.values[metric]?.value ?? null;
}

function integerOrder(left: string, right: string): number {
  const a = BigInt(left),
    b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** One repeatable-read snapshot for every selected metric and bounded export page. */
export async function engagementReport(
  pool: pg.Pool,
  input: unknown,
  options: { all?: boolean } = {},
): Promise<EngagementReport> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = (
      await client.query<ReportState>(
        'SELECT date_trunc(\'milliseconds\',clock_timestamp())+interval \'1 millisecond\' AS cutoff,started_at AS started,heartbeat_at AS heartbeat,author_erased_at AS "authorErased",community_erased_at AS "communityErased",correction_revision::text AS revision,contributors_reset_at AS "contributorsReset" FROM hash_talk.engagement_state WHERE singleton',
      )
    ).rows[0];
    if (!state)
      throw new EngagementQueryError('Engagement collection has not started.');
    const { query, liveVisitors } = request(input, state);
    const report = await selected(client, {
      query,
      state,
      liveVisitors,
      all: options.all === true,
    });
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function selected(
  client: pg.PoolClient,
  options: {
    query: EngagementQuery;
    state: ReportState;
    liveVisitors: boolean;
    all: boolean;
  },
): Promise<EngagementReport> {
  const { query, state, liveVisitors, all } = options;
  const effective = {
    from: new Date(
      Math.floor(Date.parse(query.from) / 60_000) * 60_000,
    ).toISOString(),
    to: new Date(
      Math.ceil(Date.parse(query.to) / 60_000) * 60_000,
    ).toISOString(),
  };
  const raw = await additive(client, query, effective);
  await emptyDimensions(client, query, raw);
  const unavailable = await distinctValues(client, {
    query,
    state,
    liveVisitors,
    raw,
  });
  if (!(await filtersExist(client, query)))
    for (const metric of query.metrics)
      unavailable[metric] = 'entity_missing_or_erased';
  if (query.to <= state.started.toISOString())
    for (const metric of query.metrics)
      if (engagementMetrics[metric].aggregation !== 'current')
        unavailable[metric] = 'before_collection_started';
  if (query.from >= state.cutoff.toISOString())
    for (const metric of query.metrics)
      if (engagementMetrics[metric].aggregation !== 'current')
        unavailable[metric] = 'after_report_cutoff';
  const page = rows(query, raw, unavailable).sort((a, b) =>
    compare(query, a, b),
  );
  const coverage = await engagementCoverage(client, {
    from: query.from,
    to: query.to,
  });
  return finish({ query, state, all, effective, page, unavailable, coverage });
}

async function filtersExist(
  client: pg.PoolClient,
  query: EngagementQuery,
): Promise<boolean> {
  if (!query.communityIds.length && !query.postIds.length) return true;
  const result = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total
    FROM hash_talk.engagement_entities e JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=e.community
    WHERE NOT e.erased AND NOT c.erased AND ((e.scope='community' AND e.id=ANY($1::uuid[]))
      OR (e.scope='post' AND e.id=ANY($2::uuid[])))`,
    [query.communityIds, query.postIds],
  );
  return (
    Number(result.rows[0]!.total) ===
    query.communityIds.length + query.postIds.length
  );
}

async function emptyDimensions(
  client: pg.PoolClient,
  query: EngagementQuery,
  raw: RawValue[],
): Promise<void> {
  if (query.groupBy !== 'community' && query.groupBy !== 'post') return;
  const found = await client.query<{ dimension: string }>(
    `SELECT e.id::text AS dimension FROM hash_talk.engagement_entities e
    JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=e.community
    WHERE e.scope=$1 AND NOT e.erased AND NOT c.erased
      AND (cardinality($2::uuid[])=0 OR e.community=ANY($2::uuid[]))
      AND (cardinality($3::uuid[])=0 OR e.id=ANY($3::uuid[]) OR e.root=ANY($3::uuid[]) OR e.parent=ANY($3::uuid[]))
      AND (NOT $4::boolean OR (e.eligible AND c.eligible AND (e.root IS NULL OR EXISTS
        (SELECT 1 FROM hash_talk.engagement_entities r WHERE r.scope='post' AND r.id=e.root AND r.eligible AND NOT r.erased))))
    ORDER BY e.id LIMIT 100001`,
    [
      query.groupBy,
      query.communityIds,
      query.postIds,
      query.eligibility === 'promotable',
    ],
  );
  if (found.rows.length > 100_000)
    throw new EngagementQueryError(
      'Too many report entities; narrow the filter.',
    );
  const seen = new Set(raw.map((item) => item.dimension));
  for (const item of found.rows)
    if (!seen.has(item.dimension))
      raw.push({ ...item, metric: query.metrics[0]!, value: '0' });
}

async function distinctValues(
  client: pg.PoolClient,
  options: {
    query: EngagementQuery;
    state: ReportState;
    liveVisitors: boolean;
    raw: RawValue[];
  },
) {
  const { query, state, liveVisitors, raw } = options;
  const unavailable: Partial<Record<EngagementMetric, string>> = {};
  for (const metric of query.metrics) {
    if (engagementMetrics[metric].aggregation !== 'distinct') continue;
    const measured = await distinctMetric(client, {
      metric,
      query,
      state,
      liveVisitors,
    });
    raw.push(...measured.rows);
    if (measured.reason) unavailable[metric] = measured.reason;
  }
  return unavailable;
}

interface DistinctMeasurement {
  rows: RawValue[];
  reason: string | null;
}
async function distinctMetric(
  client: pg.PoolClient,
  options: {
    metric: EngagementMetric;
    query: EngagementQuery;
    state: ReportState;
    liveVisitors: boolean;
  },
): Promise<DistinctMeasurement> {
  const { metric, query, state, liveVisitors } = options;
  if (metric === 'public_contributors_distinct')
    return contributorMeasurement(client, query, state);
  if (query.groupBy !== 'none')
    return {
      rows: [],
      reason: 'this_distinct_metric_has_no_retained_time_buckets',
    };
  if (metric === 'communities_active') {
    if (
      query.eligibility === 'historical' &&
      state.communityErased &&
      query.from < state.communityErased.toISOString()
    )
      return { rows: [], reason: 'deleted_community_history_not_retained' };
    return { rows: await activeCommunities(client, query), reason: null };
  }
  const counts = await visitors(client, query, liveVisitors);
  return {
    rows: counts,
    reason: counts.length
      ? null
      : 'use_live_last24h_or_an_exact_daily_snapshot_interval',
  };
}

async function contributorMeasurement(
  client: pg.PoolClient,
  query: EngagementQuery,
  state: ReportState,
): Promise<DistinctMeasurement> {
  const expired =
    Date.parse(query.from) < state.cutoff.getTime() - 30 * 86_400_000;
  const erased =
    query.eligibility === 'historical' &&
    state.authorErased !== null &&
    query.from < state.authorErased.toISOString();
  const restoredWithoutReferences =
    state.contributorsReset !== null &&
    query.from < state.contributorsReset.toISOString();
  if (!expired && !erased && !restoredWithoutReferences)
    return { rows: await contributors(client, query), reason: null };
  if (query.eligibility !== 'historical' || query.groupBy === 'time')
    return {
      rows: [],
      reason: 'outside_retained_distinct_contributor_coverage',
    };
  return contributorSnapshot(client, query);
}

async function contributorSnapshot(
  client: pg.PoolClient,
  query: EngagementQuery,
): Promise<DistinctMeasurement> {
  const found = await client.query<RawValue>(
    `SELECT CASE WHEN scope='project' THEN 'project' ELSE entity::text END AS dimension,metric,value::text
     FROM hash_talk.engagement_snapshots s WHERE metric='public_contributors_distinct'
       AND complete
       AND scope=$3 AND cutoff=$2 AND cutoff-CASE period WHEN 'day' THEN interval '24 hours' WHEN 'week' THEN interval '7 days' ELSE interval '30 days' END=$1
       AND (scope='project' OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities e WHERE e.scope='community' AND e.id=s.entity AND NOT e.erased))
       AND (cardinality($4::uuid[])=0 OR entity=ANY($4::uuid[]))`,
    [
      query.from,
      query.to,
      query.groupBy === 'none' ? 'project' : 'community',
      query.communityIds,
    ],
  );
  if (query.groupBy === 'none' && query.communityIds.length)
    return {
      rows: [],
      reason: 'cross_community_distinct_snapshot_cannot_be_summed',
    };
  return {
    rows: found.rows,
    reason: found.rows.length
      ? null
      : 'distinct_history_erased_or_expired_without_a_matching_snapshot',
  };
}

function finish(options: {
  query: EngagementQuery;
  state: ReportState;
  all: boolean;
  effective: { from: string; to: string };
  page: EngagementRow[];
  unavailable: Partial<Record<EngagementMetric, string>>;
  coverage: EngagementCoverage[];
}): EngagementReport {
  const { query, state, all, effective, page, unavailable, coverage } = options;
  const offset = pageOffset(query);
  if (all && offset !== 0)
    throw new EngagementQueryError('A full export cannot start from a cursor.');
  const next =
    !all && offset + query.limit < page.length
      ? Buffer.from(
          JSON.stringify({
            offset: offset + query.limit,
            digest: digest(query),
          }),
        ).toString('base64url')
      : null;
  return {
    definitionVersion: engagementDefinitionVersion,
    generatedAt: state.cutoff.toISOString(),
    cutoff: state.cutoff.toISOString(),
    startedAt: state.started.toISOString(),
    heartbeatAt: state.heartbeat?.toISOString() ?? null,
    correctionRevision: state.revision,
    coverage,
    query,
    effectiveInterval: effective,
    resolutionSeconds: 60,
    complete: reportComplete(query, state, unavailable, coverage),
    caveats: [
      'Browser observations are best effort; estimates are browsers, not people, and are not bot-proof.',
      'Additive boundaries expand to whole minutes; the latest minute is provisional at the common cutoff.',
      'The common cutoff is the exclusive end of the current millisecond; stored public observations use millisecond precision.',
      'Current values describe the report snapshot, independently of the selected event interval.',
      'Deleted entities and author references are excluded from detailed and distinct reports; project event totals survive.',
      'Share actions overlap copied links and do not prove external delivery.',
      'Calendar snapshot cutoffs are actual worker observation times; missing historical periods are not reconstructed.',
      'Continuation pages reevaluate current eligibility; use one process export for a stable reporting snapshot.',
      'Coverage ranges aggregate known server failures; browser losses and process-local failures lost on restart cannot all be detected.',
      'This database is one reporting dataset. Synthetic and staging traffic must use separate test databases.',
    ],
    unavailable,
    rows: all ? page : page.slice(offset, offset + query.limit),
    next,
  };
}

function reportComplete(
  query: EngagementQuery,
  state: ReportState,
  unavailable: Partial<Record<EngagementMetric, string>>,
  coverage: EngagementCoverage[],
): boolean {
  return (
    query.from >= state.started.toISOString() &&
    query.to <= state.cutoff.toISOString() &&
    Object.keys(unavailable).length === 0 &&
    !hasBrowserCollectionGap(query, coverage)
  );
}

function hasBrowserCollectionGap(
  query: EngagementQuery,
  coverage: EngagementCoverage[],
): boolean {
  const observed = [
    'public_page_views',
    'public_site_visitors_estimated',
    'share_actions_started',
    'links_copied',
  ];
  return (
    coverage.length > 0 &&
    query.metrics.some((metric) => observed.includes(metric))
  );
}
