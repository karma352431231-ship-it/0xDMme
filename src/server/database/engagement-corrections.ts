import type pg from 'pg';
import {
  EngagementQueryError,
  engagementCorrection,
  engagementTarget,
} from '../../shared/engagement-metrics/index.ts';
import type { EngagementTarget } from '../../shared/engagement-metrics/index.ts';
import { projectMetricEntity } from '../../shared/engagement-metrics/index.ts';
import type {
  TrafficCorrection,
  SnapshotCorrection,
} from '../../shared/engagement-metrics/index.ts';

type Client = Pick<pg.PoolClient, 'query'>;
interface Delta extends EngagementTarget {
  metric: string;
  bucket: string;
  category: string;
  delta: string;
}

async function priorOperation(client: Client, id: string) {
  return (
    await client.query<{ revision: string }>(
      'SELECT revision::text FROM hash_talk.engagement_operations WHERE id=$1',
      [id],
    )
  ).rows[0];
}

async function beginOperation(
  client: Client,
  operation: { id: string; kind: string; reason: string },
): Promise<string> {
  const state = (
    await client.query<{ revision: string }>(
      'UPDATE hash_talk.engagement_state SET correction_revision=correction_revision+1 WHERE singleton RETURNING correction_revision::text AS revision',
    )
  ).rows[0]!;
  await client.query(
    'INSERT INTO hash_talk.engagement_operations(id,revision,kind,reason) VALUES($1,$2,$3,$4)',
    [operation.id, state.revision, operation.kind, operation.reason],
  );
  return state.revision;
}

async function writeDelta(
  client: Client,
  operation: string,
  item: Delta,
): Promise<void> {
  await client.query(
    `INSERT INTO hash_talk.engagement_counts(metric,bucket,scope,entity,shard,cause,category,value)
       VALUES($1,$2,$3,$4,0,'none',$5,$6)
     ON CONFLICT(metric,bucket,scope,entity,shard,cause,category)
     DO UPDATE SET value=hash_talk.engagement_counts.value+excluded.value`,
    [
      item.metric,
      item.bucket,
      item.scope,
      item.entity,
      item.category,
      item.delta,
    ],
  );
  await client.query(
    `INSERT INTO hash_talk.engagement_adjustments(operation,metric,bucket,scope,entity,delta)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [operation, item.metric, item.bucket, item.scope, item.entity, item.delta],
  );
}

async function existingTarget(
  client: Client,
  target: EngagementTarget,
): Promise<string | null> {
  if (target.scope === 'project') return null;
  const found = await client.query<{ community: string }>(
    `SELECT e.community::text FROM hash_talk.engagement_entities e
     JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=e.community AND NOT c.erased
     WHERE e.scope=$1 AND e.id=$2 AND NOT e.erased`,
    [target.scope, target.entity],
  );
  if (!found.rows[0])
    throw new EngagementQueryError('The public entity is missing or erased.');
  return found.rows[0].community;
}

/** Compare only reproducible current gauges through the domain's narrow contract. */
export async function reconcileEngagement(
  client: Client,
  options: { scope?: string; entity?: string; repair?: boolean },
) {
  const target = engagementTarget(options.scope ?? 'project', options.entity);
  await existingTarget(client, target);
  const gauges = await client.query<{
    metric: string;
    expected: string;
    recorded: string;
  }>(
    `SELECT source.metric,source.value::text AS expected,
       coalesce((SELECT sum(value) FROM hash_talk.engagement_counts n
         WHERE n.metric=source.metric AND n.scope=$1 AND n.entity=$2),0)::text AS recorded
     FROM hash_talk.engagement_current_gauges($1,$2) source ORDER BY source.metric`,
    [target.scope, target.entity],
  );
  const differences = gauges.rows.filter(
    (row) => row.expected !== row.recorded,
  );
  if (!options.repair || !differences.length)
    return {
      target,
      gauges: gauges.rows,
      repaired: false,
      operation: null,
      revision: null,
    };
  const id = crypto.randomUUID();
  const revision = await beginOperation(client, {
    id,
    kind: 'reconciliation',
    reason: 'source_reconciliation',
  });
  const bucket = (
    await client.query<{ bucket: Date }>(
      "SELECT date_trunc('minute',clock_timestamp()) AS bucket",
    )
  ).rows[0]!.bucket.toISOString();
  for (const row of differences)
    await writeDelta(client, id, {
      ...target,
      metric: row.metric,
      bucket,
      category: 'all',
      delta: (BigInt(row.expected) - BigInt(row.recorded)).toString(),
    });
  return {
    target,
    gauges: gauges.rows,
    repaired: true,
    operation: id,
    revision,
  };
}

/** Receipts make operator retries idempotent, including after detail erasure. */
export async function correctEngagement(client: Client, input: unknown) {
  const correction = engagementCorrection(input);
  const prior = await priorOperation(client, correction.id);
  if (prior)
    return {
      applied: false,
      operation: correction.id,
      revision: prior.revision,
    };
  const revision =
    correction.kind === 'traffic'
      ? await correctTraffic(client, correction)
      : await correctSnapshot(client, correction);
  return { applied: true, operation: correction.id, revision };
}

async function correctionTargets(
  client: Client,
  correction: TrafficCorrection,
): Promise<EngagementTarget[]> {
  const project: EngagementTarget = {
    scope: 'project',
    entity: projectMetricEntity,
  };
  const community = await existingTarget(client, correction);
  if (correction.scope === 'project') return [project];
  if (correction.scope === 'community') return [project, correction];
  return [project, { scope: 'community', entity: community! }, correction];
}

async function correctTraffic(
  client: Client,
  correction: TrafficCorrection,
): Promise<string> {
  const targets = await correctionTargets(client, correction);
  for (const target of targets) {
    const found = await client.query<{ value: string }>(
      `SELECT coalesce(sum(value),0)::text AS value FROM hash_talk.engagement_counts
       WHERE metric=$1 AND bucket=$2 AND scope=$3 AND entity=$4 AND category=$5`,
      [
        correction.metric,
        correction.bucket,
        target.scope,
        target.entity,
        correction.category,
      ],
    );
    if (BigInt(found.rows[0]!.value) + BigInt(correction.delta) < 0n)
      throw new EngagementQueryError(
        'The correction would make a qualified count negative.',
      );
  }
  const revision = await beginOperation(client, correction);
  for (const target of targets)
    await writeDelta(client, correction.id, { ...correction, ...target });
  return revision;
}

async function correctSnapshot(
  client: Client,
  correction: SnapshotCorrection,
): Promise<string> {
  const found = await client.query<{
    value: string;
    revision: string;
    complete: boolean;
    generation: string;
  }>(
    `SELECT value::text,revision::text,complete,generation::text FROM hash_talk.engagement_snapshots
     WHERE cutoff=$1 AND period='day' AND metric='public_site_visitors_estimated' AND scope='project'
     ORDER BY revision DESC LIMIT 1 FOR UPDATE`,
    [correction.cutoff],
  );
  const snapshot = found.rows[0];
  if (!snapshot || snapshot.revision !== correction.expectedRevision)
    throw new EngagementQueryError(
      'The visitor snapshot is missing or its revision changed.',
    );
  if (BigInt(correction.value) >= BigInt(snapshot.value))
    throw new EngagementQueryError(
      'A visitor correction must reduce the existing estimate.',
    );
  const revision = await beginOperation(client, correction);
  await client.query(
    `INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete,revision,generation)
     VALUES($1,'day','public_site_visitors_estimated','project',$2,$3,$4,$5,$6)`,
    [
      correction.cutoff,
      projectMetricEntity,
      correction.value,
      snapshot.complete,
      revision,
      snapshot.generation,
    ],
  );
  await client.query(
    `INSERT INTO hash_talk.engagement_adjustments(operation,metric,bucket,scope,entity,delta)
     VALUES($1,'public_site_visitors_estimated',$2,'project',$3,$4)`,
    [
      correction.id,
      correction.cutoff,
      projectMetricEntity,
      (BigInt(correction.value) - BigInt(snapshot.value)).toString(),
    ],
  );
  return revision;
}
