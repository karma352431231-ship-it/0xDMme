import type pg from 'pg';
import type { ContentCapacity } from './content-capacity.ts';
import { assertContentReclamationCapacity } from './content-capacity.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';
import { assertContentCapacity, lockContentUsage } from './vault-quota.ts';
import { recordEngagementCoverage } from './engagement-health.ts';

/** Cleanup commits independently of optional snapshot growth. */
export class EngagementMaintenance {
  private readonly pool: pg.Pool;
  private readonly capacity: ContentCapacity;
  constructor(pool: pg.Pool, capacity: ContentCapacity) {
    this.pool = pool;
    this.capacity = capacity;
  }
  private transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return withAllocationTransaction(this.pool, work);
  }
  async collect(): Promise<void> {
    await this.prune();
    try {
      await this.transaction(async (client) => {
        await lockContentUsage(client);
        await this.flushHealth(client);
        await this.snapshots(client);
        await assertContentCapacity(client, this.capacity);
      });
    } catch (error) {
      try {
        await this.pool.query(`UPDATE hash_talk.engagement_state
          SET maintenance_failures=maintenance_failures+1,
            pending_maintenance_failures=pending_maintenance_failures+1,
            maintenance_failed_at=coalesce(maintenance_failed_at,clock_timestamp()) WHERE singleton`);
      } catch (recordingError) {
        throw new AggregateError(
          [error, recordingError],
          'Metric maintenance and failure recording are unavailable.',
          { cause: recordingError },
        );
      }
      throw error;
    }
  }

  private async prune(): Promise<void> {
    await this.transaction(async (client) => {
      if (
        !(
          await client.query<{ owned: boolean }>(
            "SELECT pg_try_advisory_xact_lock(hashtext('0xdmme:engagement-maintenance')) AS owned",
          )
        ).rows[0]?.owned
      )
        return;
      const before = await lockContentUsage(client);
      await client.query(`DELETE FROM hash_talk.engagement_visitors WHERE marker IN
        (SELECT marker FROM hash_talk.engagement_visitors WHERE seen_at<=clock_timestamp()-hash_talk.engagement_technical_retention() ORDER BY seen_at,marker LIMIT 256)`);
      await client.query(`DELETE FROM hash_talk.engagement_observations WHERE id IN
        (SELECT id FROM hash_talk.engagement_observations WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 256)`);
      await client.query(`DELETE FROM hash_talk.engagement_contributors WHERE post IN
        (SELECT post FROM hash_talk.engagement_contributors WHERE published_at<=clock_timestamp()-interval '30 days' ORDER BY published_at,post LIMIT 256)`);
      await this.erase(client);
      await client.query(
        `UPDATE hash_talk.engagement_state SET
           pending_gap_from=CASE WHEN coalesce(heartbeat_at,started_at)<clock_timestamp()-interval '2 minutes'
             THEN least(pending_gap_from,coalesce(heartbeat_at,started_at)+interval '1 minute') ELSE pending_gap_from END,
           pending_gap_to=CASE WHEN coalesce(heartbeat_at,started_at)<clock_timestamp()-interval '2 minutes'
             THEN clock_timestamp() ELSE pending_gap_to END,
           heartbeat_at=clock_timestamp() WHERE singleton`,
      );
      if ((await lockContentUsage(client)) > before)
        throw new Error('Metric cleanup unexpectedly grew logical storage.');
      if (typeof this.capacity !== 'number')
        await assertContentReclamationCapacity(client, this.capacity);
    });
  }

  private async flushHealth(client: pg.PoolClient): Promise<void> {
    const state = (
      await client.query<{
        pending_gap_from: Date | null;
        pending_gap_to: Date | null;
        maintenance_failed_at: Date | null;
        pending_maintenance_failures: string;
        now: Date;
      }>(`SELECT pending_gap_from,pending_gap_to,maintenance_failed_at,pending_maintenance_failures::text,clock_timestamp() AS now
      FROM hash_talk.engagement_state WHERE singleton FOR UPDATE`)
    ).rows[0]!;
    if (state.pending_gap_from && state.pending_gap_to)
      await recordEngagementCoverage(client, {
        reason: 'maintenance_gap',
        from: state.pending_gap_from.toISOString(),
        to: state.pending_gap_to.toISOString(),
        occurrences: '1',
      });
    if (state.maintenance_failed_at)
      await recordEngagementCoverage(client, {
        reason: 'snapshot_failure',
        from: state.maintenance_failed_at.toISOString(),
        to: state.now.toISOString(),
        occurrences: state.pending_maintenance_failures,
      });
    if (state.pending_gap_from || state.maintenance_failed_at)
      await client.query(`UPDATE hash_talk.engagement_state SET
        pending_gap_from=NULL,pending_gap_to=NULL,maintenance_failed_at=NULL,pending_maintenance_failures=0 WHERE singleton`);
  }

  private async snapshots(client: pg.PoolClient): Promise<void> {
    const due = await client.query<{
      cutoff: Date;
      started: Date;
      erased: Date | null;
      revision: string;
      generation: string;
      reset: Date | null;
    }>(
      `UPDATE hash_talk.engagement_state SET snapshot_at=clock_timestamp(),snapshot_generation=snapshot_generation+1
       WHERE singleton AND (snapshot_at IS NULL OR
         (snapshot_at AT TIME ZONE 'America/Fortaleza')::date<(clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date)
       RETURNING snapshot_at AS cutoff,started_at AS started,author_erased_at AS erased,correction_revision::text AS revision,snapshot_generation::text AS generation,contributors_reset_at AS reset`,
    );
    const state = due.rows[0];
    if (!state) return;
    await client.query(
      `INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete,revision,generation)
       SELECT $1,'day','public_site_visitors_estimated','project','00000000-0000-0000-0000-000000000000',count(*),
         $2::timestamptz<=$1::timestamptz-interval '24 hours' AND NOT EXISTS(
           SELECT 1 FROM hash_talk.engagement_coverage WHERE reason='collection_failure'
             AND ended_at>=$1::timestamptz-interval '24 hours' AND started_at<$1),$3,$4
       FROM hash_talk.engagement_visitors WHERE seen_at>=$1::timestamptz-interval '24 hours' AND seen_at<$1`,
      [state.cutoff, state.started, state.revision, state.generation],
    );
    await client.query(
      `WITH eligible AS (
         SELECT p.* FROM hash_talk.engagement_contributors p
         JOIN hash_talk.engagement_entities e ON e.scope='post' AND e.id=p.post AND NOT e.erased
         JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=p.community AND NOT c.erased
       ) INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete,revision,generation)
       SELECT $1,w.period,'public_contributors_distinct',CASE WHEN GROUPING(p.community)=1 THEN 'project' ELSE 'community' END,
         coalesce(p.community,'00000000-0000-0000-0000-000000000000'),count(DISTINCT p.author),
         $2::timestamptz<=$1::timestamptz-w.duration AND ($3::timestamptz IS NULL OR $3<$1::timestamptz-w.duration)
           AND ($6::timestamptz IS NULL OR $6<=$1::timestamptz-w.duration),$4,$5
       FROM (VALUES ('day',interval '24 hours'),('week',interval '7 days'),('month',interval '30 days')) w(period,duration)
       LEFT JOIN eligible p ON p.published_at>=$1::timestamptz-w.duration AND p.published_at<$1
       GROUP BY w.period,w.duration,GROUPING SETS((),(p.community))
       HAVING GROUPING(p.community)=1 OR p.community IS NOT NULL`,
      [
        state.cutoff,
        state.started,
        state.erased,
        state.revision,
        state.generation,
        state.reset,
      ],
    );
  }

  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ due: Date }>(`SELECT least(
      coalesce(heartbeat_at,clock_timestamp())+interval '1 minute',
      (SELECT min(seen_at)+hash_talk.engagement_technical_retention() FROM hash_talk.engagement_visitors),
      (SELECT min(expires_at) FROM hash_talk.engagement_observations),
      (SELECT min(published_at)+interval '30 days' FROM hash_talk.engagement_contributors),
      CASE WHEN EXISTS(SELECT 1 FROM hash_talk.engagement_erasure) THEN clock_timestamp() ELSE 'infinity'::timestamptz END
    ) AS due FROM hash_talk.engagement_state WHERE singleton`);
    return result.rows[0]?.due.getTime() ?? null;
  }

  private async erase(client: pg.PoolClient): Promise<void> {
    await client.query(`DELETE FROM hash_talk.engagement_adjustments WHERE ctid IN
      (SELECT a.ctid FROM hash_talk.engagement_adjustments a WHERE EXISTS
        (SELECT 1 FROM hash_talk.engagement_erasure q WHERE q.scope=a.scope AND q.id=a.entity)
        OR (a.scope='post' AND EXISTS(SELECT 1 FROM hash_talk.engagement_entities e
          JOIN hash_talk.engagement_erasure q ON q.scope='community' AND q.id=e.community
          WHERE e.scope='post' AND e.id=a.entity)) LIMIT 256)`);
    await client.query(`DELETE FROM hash_talk.engagement_counts WHERE ctid IN
      (SELECT n.ctid FROM hash_talk.engagement_counts n WHERE
        EXISTS(SELECT 1 FROM hash_talk.engagement_erasure q WHERE q.scope=n.scope AND q.id=n.entity)
        OR (n.scope='post' AND EXISTS(SELECT 1 FROM hash_talk.engagement_entities e JOIN hash_talk.engagement_erasure q ON q.scope='community' AND q.id=e.community WHERE e.scope='post' AND e.id=n.entity))
      ORDER BY n.scope,n.entity,n.metric,n.bucket LIMIT 256)`);
    await client.query(`DELETE FROM hash_talk.engagement_contributors WHERE post IN
      (SELECT p.post FROM hash_talk.engagement_contributors p WHERE EXISTS
        (SELECT 1 FROM hash_talk.engagement_erasure q WHERE (q.scope='post' AND q.id=p.post) OR (q.scope='community' AND q.id=p.community)) ORDER BY p.post LIMIT 256)`);
    await client.query(`DELETE FROM hash_talk.engagement_snapshots WHERE ctid IN
      (SELECT s.ctid FROM hash_talk.engagement_snapshots s WHERE s.scope='community' AND EXISTS
        (SELECT 1 FROM hash_talk.engagement_erasure q WHERE q.scope='community' AND q.id=s.entity) LIMIT 256)`);
    await client.query(`DELETE FROM hash_talk.engagement_entities WHERE (scope,id) IN
      (SELECT e.scope,e.id FROM hash_talk.engagement_entities e WHERE EXISTS
        (SELECT 1 FROM hash_talk.engagement_erasure q WHERE (q.scope=e.scope AND q.id=e.id) OR (q.scope='community' AND q.id=e.community))
        AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_counts n WHERE n.scope=e.scope AND n.entity=e.id)
        AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_adjustments a WHERE a.scope=e.scope AND a.entity=e.id)
        AND (e.scope='community' OR NOT EXISTS(SELECT 1 FROM hash_talk.engagement_contributors p WHERE p.post=e.id))
        AND (e.scope='post' OR NOT EXISTS(SELECT 1 FROM hash_talk.engagement_entities child WHERE child.scope='post' AND child.community=e.id))
      ORDER BY e.scope,e.id LIMIT 128)`);
    await client.query(`DELETE FROM hash_talk.engagement_erasure WHERE (scope,id) IN
      (SELECT q.scope,q.id FROM hash_talk.engagement_erasure q WHERE NOT EXISTS
        (SELECT 1 FROM hash_talk.engagement_entities e WHERE (q.scope=e.scope AND q.id=e.id) OR (q.scope='community' AND q.id=e.community))
        AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_counts n WHERE n.scope=q.scope AND n.entity=q.id)
        AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_snapshots s WHERE q.scope='community' AND s.scope='community' AND s.entity=q.id)
      LIMIT 128)`);
  }
}
