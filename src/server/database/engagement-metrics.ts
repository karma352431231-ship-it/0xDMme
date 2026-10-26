import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { ContentCapacity } from './content-capacity.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';
import { assertContentCapacity, lockContentUsage } from './vault-quota.ts';
import {
  engagementObservations,
  engagementVisitor,
} from '../../shared/engagement-metrics/index.ts';
import type {
  EngagementObservation,
  EngagementSnapshot,
} from '../../shared/engagement-metrics/index.ts';
import { engagementReport } from './engagement-report.ts';

export type EngagementClient = Pick<pg.PoolClient, 'query'>;

/** Owns metric persistence and resource lifecycle; no reads of other domain tables. */
export class EngagementMetricsStore {
  private readonly pool: pg.Pool;
  private readonly capacity: ContentCapacity;

  constructor(pool: pg.Pool, capacity: ContentCapacity) {
    this.pool = pool;
    this.capacity = capacity;
  }

  report(input: unknown, options: { all?: boolean } = {}) {
    return engagementReport(this.pool, input, options);
  }

  /** Bounded immutable aggregate history; an explicit cutoff pages older rows. */
  async snapshotsPage(before?: string): Promise<EngagementSnapshot[]> {
    if (
      before !== undefined &&
      (!Number.isFinite(Date.parse(before)) ||
        new Date(before).toISOString() !== before)
    )
      throw new Error('Use a canonical UTC snapshot cutoff.');
    const found = await this.pool.query<EngagementSnapshot>(
      `SELECT
      to_char(cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS cutoff,
      period,metric,scope,entity::text,value::text,complete FROM hash_talk.engagement_snapshots s
      WHERE ($1::timestamptz IS NULL OR cutoff<$1) AND (scope='project' OR EXISTS
        (SELECT 1 FROM hash_talk.engagement_entities e WHERE e.scope='community' AND e.id=s.entity AND NOT e.erased))
      ORDER BY cutoff DESC,period,metric,scope,entity LIMIT 1000`,
      [before ?? null],
    );
    return found.rows;
  }

  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return withAllocationTransaction(this.pool, work);
  }

  /** The transport validates observations before entering this private contract. */
  async observe(input: unknown): Promise<void> {
    const items = engagementObservations(input);
    await this.transaction(async (client) => {
      // Match existing admission/maintenance lock order before metric byte owners.
      await lockContentUsage(client);
      for (const item of items) await this.admit(client, item);
      await assertContentCapacity(client, this.capacity);
    });
  }

  private async admit(
    client: EngagementClient,
    item: EngagementObservation,
  ): Promise<void> {
    if (!(await this.eligible(client, item))) return;
    const admitted = await client.query(
      'INSERT INTO hash_talk.engagement_observations(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
      [item.id],
    );
    if (!admitted.rowCount) return;
    const metric = {
      page: 'public_page_views',
      share: 'share_actions_started',
      copy: 'links_copied',
    }[item.kind];
    await client.query(
      "SELECT hash_talk.record_engagement($1,$2,$3,1,'none',$4)",
      [
        metric,
        item.community,
        item.post,
        item.kind === 'page' ? item.category : 'all',
      ],
    );
  }

  async observeVisitor(input: unknown): Promise<void> {
    const item = engagementVisitor(input);
    await this.transaction(async (client) => {
      await lockContentUsage(client);
      const admitted = await client.query(
        'INSERT INTO hash_talk.engagement_observations(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',
        [item.id],
      );
      if (!admitted.rowCount) return;
      const marker = createHash('sha256').update(item.marker).digest('hex');
      await client.query(
        `INSERT INTO hash_talk.engagement_visitors(marker,seen_at) VALUES($1,clock_timestamp())
        ON CONFLICT(marker) DO UPDATE SET seen_at=excluded.seen_at`,
        [marker],
      );
      await assertContentCapacity(client, this.capacity);
    });
  }

  private async eligible(
    client: EngagementClient,
    item: EngagementObservation,
  ): Promise<boolean> {
    if (!item.community) return item.post === null;
    const found = await client.query(
      `SELECT 1 FROM hash_talk.engagement_entities c
       WHERE c.scope='community' AND c.id=$1 AND c.kind='community' AND NOT c.erased
       AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities p
         WHERE p.scope='post' AND p.id=$2 AND p.community=c.id AND p.eligible AND NOT p.erased
         AND (p.root IS NULL OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities r
           WHERE r.scope='post' AND r.id=p.root AND r.eligible AND NOT r.erased))))`,
      [item.community, item.post],
    );
    return Boolean(found.rowCount);
  }

  async collect(): Promise<void> {
    await this.transaction(async (client) => {
      if (
        !(
          await client.query<{ owned: boolean }>(
            "SELECT pg_try_advisory_xact_lock(hashtext('0xdmme:engagement-maintenance')) AS owned",
          )
        ).rows[0]?.owned
      )
        return;
      await lockContentUsage(client);
      await this.snapshots(client);
      await client.query(`DELETE FROM hash_talk.engagement_visitors WHERE marker IN
        (SELECT marker FROM hash_talk.engagement_visitors WHERE seen_at<=clock_timestamp()-interval '48 hours' ORDER BY seen_at,marker LIMIT 256)`);
      await client.query(`DELETE FROM hash_talk.engagement_observations WHERE id IN
        (SELECT id FROM hash_talk.engagement_observations WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 256)`);
      await client.query(`DELETE FROM hash_talk.engagement_contributors WHERE post IN
        (SELECT post FROM hash_talk.engagement_contributors WHERE published_at<=clock_timestamp()-interval '30 days' ORDER BY published_at,post LIMIT 256)`);
      await this.erase(client);
      await client.query(
        'UPDATE hash_talk.engagement_state SET heartbeat_at=clock_timestamp() WHERE singleton',
      );
      await assertContentCapacity(client, this.capacity);
    });
  }

  private async snapshots(client: EngagementClient): Promise<void> {
    const due = await client.query<{
      cutoff: Date;
      started: Date;
      erased: Date | null;
    }>(
      `UPDATE hash_talk.engagement_state SET snapshot_at=clock_timestamp()
       WHERE singleton AND (snapshot_at IS NULL OR
         (snapshot_at AT TIME ZONE 'America/Fortaleza')::date<(clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date)
       RETURNING snapshot_at AS cutoff,started_at AS started,author_erased_at AS erased`,
    );
    const state = due.rows[0];
    if (!state) return;
    await client.query(
      `INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete)
       SELECT $1,'day','public_site_visitors_estimated','project','00000000-0000-0000-0000-000000000000',count(*),$2::timestamptz<=$1::timestamptz-interval '24 hours'
       FROM hash_talk.engagement_visitors WHERE seen_at>=$1::timestamptz-interval '24 hours' AND seen_at<$1`,
      [state.cutoff, state.started],
    );
    await client.query(
      `WITH eligible AS (
         SELECT p.* FROM hash_talk.engagement_contributors p
         JOIN hash_talk.engagement_entities e ON e.scope='post' AND e.id=p.post AND NOT e.erased
         JOIN hash_talk.engagement_entities c ON c.scope='community' AND c.id=p.community AND NOT c.erased
       ) INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete)
       SELECT $1,w.period,'public_contributors_distinct',CASE WHEN GROUPING(p.community)=1 THEN 'project' ELSE 'community' END,
         coalesce(p.community,'00000000-0000-0000-0000-000000000000'),count(DISTINCT p.author),
         $2::timestamptz<=$1::timestamptz-w.duration AND ($3::timestamptz IS NULL OR $3<$1::timestamptz-w.duration)
       FROM (VALUES ('day',interval '24 hours'),('week',interval '7 days'),('month',interval '30 days')) w(period,duration)
       LEFT JOIN eligible p ON p.published_at>=$1::timestamptz-w.duration AND p.published_at<$1
       GROUP BY w.period,w.duration,GROUPING SETS((),(p.community))
       HAVING GROUPING(p.community)=1 OR p.community IS NOT NULL`,
      [state.cutoff, state.started, state.erased],
    );
  }

  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ due: Date }>(`SELECT least(
      coalesce(heartbeat_at,clock_timestamp())+interval '1 minute',
      (SELECT min(seen_at)+interval '48 hours' FROM hash_talk.engagement_visitors),
      (SELECT min(expires_at) FROM hash_talk.engagement_observations),
      (SELECT min(published_at)+interval '30 days' FROM hash_talk.engagement_contributors),
      CASE WHEN EXISTS(SELECT 1 FROM hash_talk.engagement_erasure) THEN clock_timestamp() ELSE 'infinity'::timestamptz END
    ) AS due FROM hash_talk.engagement_state WHERE singleton`);
    return result.rows[0]?.due.getTime() ?? null;
  }

  private async erase(client: EngagementClient): Promise<void> {
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
