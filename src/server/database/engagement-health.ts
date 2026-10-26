import type pg from 'pg';
import type { EngagementCoverage } from '../../shared/engagement-metrics/index.ts';

interface HealthState {
  observedAt: Date;
  maintenanceHeartbeat: Date | null;
  snapshotAt: Date | null;
  correctionRevision: string;
  maintenanceFailures: string;
  maintenanceFailedAt: Date | null;
  pendingGapFrom: Date | null;
  pendingGapTo: Date | null;
  expiredVisitorMarkers: string;
  oldestMarkerExpiry: Date | null;
  expiredContributorReferences: string;
  pendingEntityErasures: string;
  technicalRetention: string;
  contributorsResetAt: Date | null;
}
interface StorageMeasurement {
  table: string;
  heapBytes: string;
  indexBytes: string;
  totalBytes: string;
  estimatedLiveRows: string;
  estimatedDeadRows: string;
}

async function metricCharges(client: pg.PoolClient) {
  const result = await client.query<{ table: string; chargedBytes: string }>(
    `SELECT 'engagement_state' AS "table",coalesce(sum(charge),0)::text AS "chargedBytes" FROM hash_talk.engagement_state
     UNION ALL SELECT 'engagement_counts',coalesce(sum(charge),0)::text FROM hash_talk.engagement_counts
     UNION ALL SELECT 'engagement_entities',coalesce(sum(charge),0)::text FROM hash_talk.engagement_entities
     UNION ALL SELECT 'engagement_contributors',coalesce(sum(charge),0)::text FROM hash_talk.engagement_contributors
     UNION ALL SELECT 'engagement_visitors',coalesce(sum(charge),0)::text FROM hash_talk.engagement_visitors
     UNION ALL SELECT 'engagement_observations',coalesce(sum(charge),0)::text FROM hash_talk.engagement_observations
     UNION ALL SELECT 'engagement_erasure',coalesce(sum(charge),0)::text FROM hash_talk.engagement_erasure
     UNION ALL SELECT 'engagement_snapshots',coalesce(sum(charge),0)::text FROM hash_talk.engagement_snapshots
     UNION ALL SELECT 'engagement_coverage',coalesce(sum(charge),0)::text FROM hash_talk.engagement_coverage
     UNION ALL SELECT 'engagement_operations',coalesce(sum(charge),0)::text FROM hash_talk.engagement_operations
     UNION ALL SELECT 'engagement_adjustments',coalesce(sum(charge),0)::text FROM hash_talk.engagement_adjustments`,
  );
  return new Map(result.rows.map((row) => [row.table, row.chargedBytes]));
}

export async function recordEngagementCoverage(
  client: Pick<pg.PoolClient, 'query'>,
  incident: EngagementCoverage,
): Promise<void> {
  await client.query(
    `INSERT INTO hash_talk.engagement_coverage(day,reason,started_at,ended_at,occurrences)
       VALUES(($3::timestamptz AT TIME ZONE 'UTC')::date,$1,$2,$3,$4)
     ON CONFLICT(day,reason) DO UPDATE SET
       started_at=least(hash_talk.engagement_coverage.started_at,excluded.started_at),
       ended_at=greatest(hash_talk.engagement_coverage.ended_at,excluded.ended_at),
       occurrences=hash_talk.engagement_coverage.occurrences+excluded.occurrences`,
    [incident.reason, incident.from, incident.to, incident.occurrences],
  );
}

/** At most three coarse aggregate ranges; no request, address or browsing data. */
export async function engagementCoverage(
  client: Pick<pg.PoolClient, 'query'>,
  interval: { from: string; to: string },
): Promise<EngagementCoverage[]> {
  const result = await client.query<EngagementCoverage>(
    `SELECT reason,
       to_char(min(started_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "from",
       to_char(max(ended_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "to",
       sum(occurrences)::text AS occurrences
     FROM (
       SELECT reason,started_at,ended_at,occurrences FROM hash_talk.engagement_coverage
       UNION ALL SELECT 'maintenance_gap',pending_gap_from,pending_gap_to,1
         FROM hash_talk.engagement_state WHERE singleton AND pending_gap_from IS NOT NULL
       UNION ALL SELECT 'snapshot_failure',maintenance_failed_at,clock_timestamp(),pending_maintenance_failures
         FROM hash_talk.engagement_state WHERE singleton AND maintenance_failed_at IS NOT NULL
       UNION ALL SELECT 'maintenance_gap',coalesce(heartbeat_at,started_at)+interval '1 minute',clock_timestamp(),1
         FROM hash_talk.engagement_state WHERE singleton AND coalesce(heartbeat_at,started_at)<clock_timestamp()-interval '2 minutes'
     ) incidents WHERE ended_at>=$1 AND started_at<$2 GROUP BY reason`,
    [interval.from, interval.to],
  );
  return result.rows;
}

/** Read-only capacity/retention evidence, with no individual technical markers. */
export async function engagementHealth(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = (
      await client.query<HealthState>(
        `SELECT clock_timestamp() AS "observedAt",heartbeat_at AS "maintenanceHeartbeat",
         snapshot_at AS "snapshotAt",correction_revision::text AS "correctionRevision",
         maintenance_failures::text AS "maintenanceFailures",maintenance_failed_at AS "maintenanceFailedAt",
         pending_gap_from AS "pendingGapFrom",pending_gap_to AS "pendingGapTo",
         (SELECT count(*)::text FROM hash_talk.engagement_visitors WHERE seen_at<=clock_timestamp()-hash_talk.engagement_technical_retention()) AS "expiredVisitorMarkers",
         (SELECT min(seen_at)+hash_talk.engagement_technical_retention() FROM hash_talk.engagement_visitors) AS "oldestMarkerExpiry",
         (SELECT count(*)::text FROM hash_talk.engagement_contributors WHERE published_at<=clock_timestamp()-interval '30 days') AS "expiredContributorReferences",
         (SELECT count(*)::text FROM hash_talk.engagement_erasure) AS "pendingEntityErasures",
         hash_talk.engagement_technical_retention()::text AS "technicalRetention",
         contributors_reset_at AS "contributorsResetAt"
       FROM hash_talk.engagement_state WHERE singleton`,
      )
    ).rows[0];
    const storage = (
      await client.query<StorageMeasurement>(
        `SELECT c.relname AS "table",pg_relation_size(c.oid)::text AS "heapBytes",
         pg_indexes_size(c.oid)::text AS "indexBytes",pg_total_relation_size(c.oid)::text AS "totalBytes",
         coalesce(s.n_live_tup,0)::text AS "estimatedLiveRows",coalesce(s.n_dead_tup,0)::text AS "estimatedDeadRows"
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
       WHERE n.nspname='hash_talk' AND c.relkind='r' AND left(c.relname,11)='engagement_'
       ORDER BY c.relname LIMIT 32`,
      )
    ).rows;
    if (!state) throw new Error('Metric collection has not started.');
    const charges = await metricCharges(client);
    await client.query('COMMIT');
    return {
      state,
      storage: storage.map((row) => ({
        ...row,
        chargedBytes: charges.get(row.table) ?? null,
      })),
      caveats: [
        'Relation sizes include indexes and reusable dead space; fixed quota charges are not physical byte measurements.',
        'No process can physically erase data while its database is offline. Expired data is excluded from reports and cleaned after service resumes.',
        'Coverage records describe known server failures and coarse ranges, not every lost browser observation.',
        'This report describes this database only. Keep synthetic and staging traffic in separate test databases.',
      ],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
