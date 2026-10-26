import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { ContentCapacity } from './content-capacity.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';
import { assertContentCapacity, lockContentUsage } from './vault-quota.ts';
import {
  engagementObservations,
  engagementVisitor,
} from '../../shared/engagement-metrics/index.ts';
import { engagementReport } from './engagement-report.ts';
import { engagementSnapshots } from './engagement-snapshots.ts';
import {
  engagementHealth,
  recordEngagementCoverage,
} from './engagement-health.ts';
import {
  reconcileEngagement,
  correctEngagement,
} from './engagement-corrections.ts';
import { EngagementMaintenance } from './engagement-maintenance.ts';

/** Owns metric persistence and resource lifecycle; no reads of other domain tables. */
export class EngagementMetricsStore {
  private readonly pool: pg.Pool;
  private readonly capacity: ContentCapacity;
  private readonly maintenance: EngagementMaintenance;

  constructor(pool: pg.Pool, capacity: ContentCapacity) {
    this.pool = pool;
    this.capacity = capacity;
    this.maintenance = new EngagementMaintenance(pool, capacity);
  }

  report(input: unknown, options: { all?: boolean } = {}) {
    return engagementReport(this.pool, input, options);
  }

  snapshotsPage(
    input: { before?: string; cursor?: string; limit?: number } = {},
  ) {
    return engagementSnapshots(this.pool, input);
  }

  health() {
    return engagementHealth(this.pool);
  }

  reconcile(
    options: { scope?: string; entity?: string; repair?: boolean } = {},
  ) {
    return this.transaction(async (client) => {
      await lockContentUsage(client);
      const result = await reconcileEngagement(client, options);
      if (result.repaired) await assertContentCapacity(client, this.capacity);
      return result;
    });
  }

  correct(input: unknown) {
    return this.transaction(async (client) => {
      await lockContentUsage(client);
      const result = await correctEngagement(client, input);
      if (result.applied) await assertContentCapacity(client, this.capacity);
      return result;
    });
  }

  noteCollectionFailure(incident: {
    from: string;
    to: string;
    occurrences: number;
  }): Promise<void> {
    return this.transaction(async (client) => {
      await lockContentUsage(client);
      await recordEngagementCoverage(client, {
        ...incident,
        reason: 'collection_failure',
        occurrences: String(incident.occurrences),
      });
      await assertContentCapacity(client, this.capacity);
    });
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
      await client.query(
        `WITH eligible AS MATERIALIZED (
          SELECT i.* FROM jsonb_to_recordset($1::jsonb)
            AS i(id uuid,kind text,category text,community uuid,post uuid)
          WHERE (i.community IS NULL AND i.post IS NULL) OR EXISTS(
            SELECT 1 FROM hash_talk.engagement_entities c
            WHERE c.scope='community' AND c.id=i.community AND NOT c.erased
              AND (i.post IS NULL OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities p
                WHERE p.scope='post' AND p.id=i.post AND p.community=c.id AND p.eligible AND NOT p.erased
                AND (p.root IS NULL OR EXISTS(SELECT 1 FROM hash_talk.engagement_entities r
                  WHERE r.scope='post' AND r.id=p.root AND r.eligible AND NOT r.erased)))))
        ), admitted AS (
          INSERT INTO hash_talk.engagement_observations(id) SELECT id FROM eligible ORDER BY id
          ON CONFLICT DO NOTHING RETURNING id
        ) SELECT hash_talk.record_engagement(
          CASE i.kind WHEN 'page' THEN 'public_page_views' WHEN 'share' THEN 'share_actions_started' ELSE 'links_copied' END,
          i.community,i.post,1,'none',CASE WHEN i.kind='page' THEN i.category ELSE 'all' END)
          FROM eligible i JOIN admitted a USING(id) ORDER BY i.id`,
        [JSON.stringify(items)],
      );
      await assertContentCapacity(client, this.capacity);
    });
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
        `INSERT INTO hash_talk.engagement_visitors(marker,seen_at) VALUES($1,date_trunc('milliseconds',clock_timestamp()))
        ON CONFLICT(marker) DO UPDATE SET seen_at=excluded.seen_at`,
        [marker],
      );
      await assertContentCapacity(client, this.capacity);
    });
  }

  collect(): Promise<void> {
    return this.maintenance.collect();
  }

  nextCollection(): Promise<number | null> {
    return this.maintenance.nextCollection();
  }
}
