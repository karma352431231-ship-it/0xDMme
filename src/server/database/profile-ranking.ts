import type pg from 'pg';
import {
  accountRankingScore,
  rankingVersion,
  rankingMetricVersion,
  rankingPeriods,
} from '../../shared/community-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
import { measurePostSignals } from './post-ranking-signals.ts';
import { assertContentCapacity } from './vault-quota.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { readProfileRankingPage } from './profile-ranking-page.ts';
import type { ProfileRankingSelection } from './profile-ranking-page.ts';

type Reader = Pick<pg.PoolClient, 'query'>;
const publicEntryMetrics = `jsonb_build_object(
  'views',coalesce(s.metrics->p.period->'current'->'views','0'::jsonb),
  'upvotes',coalesce(s.metrics->p.period->'current'->'upvotes','0'::jsonb),
  'shares',coalesce(s.metrics->p.period->'current'->'shares','0'::jsonb),
  'comments',coalesce(s.metrics->p.period->'current'->'comments','0'::jsonb),
  'previousScore',coalesce(s.metrics->p.period->'previousScore','0'::jsonb))`;
const publicationSource = `FROM hash_talk.public_profiles profile
  LEFT JOIN hash_talk.profile_ranking_state s ON s.profile_id=profile.id
  CROSS JOIN (VALUES('day'),('week'),('month')) p(period)`;
/** Profile projection participates in the existing producer's atomic generation. */
export class ProfileRankingStore {
  private readonly pool: pg.Pool;
  private readonly capacity: ContentCapacity;
  private readonly profiles: PublicProfileStore | null;
  constructor(
    pool: pg.Pool,
    capacity: ContentCapacity,
    profiles: PublicProfileStore | null = null,
  ) {
    this.pool = pool;
    this.capacity = capacity;
    this.profiles = profiles;
  }
  async pending(client: Reader, cutoff: Date | null = null): Promise<boolean> {
    const result = await client.query<{ pending: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_state
      WHERE ($1::timestamptz IS NULL OR cutoff IS NULL OR cutoff<$1) AND
      (revision<>processed OR due_at<=coalesce($1,clock_timestamp()) OR metrics IS NULL
      OR metrics->>'version' IS DISTINCT FROM $2::text OR metrics->>'formulaVersion' IS DISTINCT FROM $3::text)) AS pending`,
      [cutoff, rankingMetricVersion, rankingVersion],
    );
    return result.rows[0]!.pending;
  }
  async process(client: pg.PoolClient, cutoff: Date): Promise<boolean> {
    const batch = await client.query<{
      profile_id: string;
      revision: string;
      observed: Date;
    }>(
      `SELECT s.profile_id,s.revision::text,c.engagement_observed_since AS observed
      FROM hash_talk.profile_ranking_state s CROSS JOIN hash_talk.community_ranking_settings c
      WHERE (s.cutoff IS NULL OR s.cutoff<$1) AND (revision<>processed OR due_at<=$1 OR metrics IS NULL
      OR metrics->>'version' IS DISTINCT FROM $2::text OR metrics->>'formulaVersion' IS DISTINCT FROM $3::text)
      ORDER BY due_at,profile_id LIMIT 32`,
      [cutoff, rankingMetricVersion, rankingVersion],
    );
    if (!batch.rows.length) return false;
    const { signals, previous } = await this.measure(
      client,
      batch.rows.map((row) => row.profile_id),
      cutoff,
    );
    const updates = batch.rows.map((row) => {
      const metrics: Record<string, unknown> = {
        version: rankingMetricVersion,
        formulaVersion: rankingVersion,
      };
      let due: Date | null = null;
      for (const period of rankingPeriods) {
        const pick = (list: typeof signals) =>
          list.find((s) => s.id === row.profile_id && s.period === period)!;
        const signal = pick(signals),
          before = pick(previous);
        const days = { day: 1, week: 7, month: 30 }[period];
        const completeAt = new Date(row.observed.getTime() + days * 86400000);
        metrics[period] = {
          current: signal,
          score: accountRankingScore(signal),
          previousScore: accountRankingScore(before),
          historyComplete: cutoff >= completeAt,
        };
        for (const next of [signal.due_at, before.due_at])
          if (next && (!due || next < due)) due = next;
        if (completeAt > cutoff && (!due || completeAt < due)) due = completeAt;
      }
      return { id: row.profile_id, revision: row.revision, metrics, due };
    });
    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE hash_talk.profile_ranking_state s SET processed=u.revision,cutoff=$2,due_at=coalesce(u.due,'infinity'),metrics=u.metrics
        FROM jsonb_to_recordset($1::jsonb) AS u(id uuid,revision bigint,due timestamptz,metrics jsonb)
        WHERE s.profile_id=u.id AND s.processed<=u.revision`,
        [JSON.stringify(updates), cutoff],
      );
      await assertContentCapacity(client, this.capacity);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
    return this.pending(client, cutoff);
  }
  private async measure(client: pg.PoolClient, ids: string[], cutoff: Date) {
    await client.query('BEGIN READ ONLY');
    try {
      await client.query('SET LOCAL jit = off');
      // Both windows share the cutoff, so they meet without a gap or overlap.
      const signals = await measurePostSignals(client, {
        ids,
        cutoff,
        target: 'author',
      });
      const previous = await measurePostSignals(client, {
        ids,
        cutoff,
        target: 'author',
        window: 'previous',
      });
      await client.query('COMMIT');
      return { signals, previous };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  async publish(client: Reader, generation: string): Promise<void> {
    await client.query(
      `INSERT INTO hash_talk.profile_ranking_entries(generation,profile_id,period,score,metrics,followers)
      SELECT $1,profile.id,p.period,coalesce((s.metrics->p.period->>'score')::bigint,0),${publicEntryMetrics},
      coalesce(f.followers,0)
      ${publicationSource}
      LEFT JOIN (SELECT target,count(*) AS followers FROM hash_talk.public_profile_follows WHERE following GROUP BY target) f ON f.target=profile.id`,
      [generation],
    );
  }
  async publicationBytes(client: Reader): Promise<number> {
    const result = await client.query<{
      bytes: string;
    }>(`SELECT coalesce(sum(256+octet_length((${publicEntryMetrics})::text)),0)::text AS bytes
      ${publicationSource}`);
    return Number(result.rows[0]!.bytes);
  }
  async deadline(client: Reader): Promise<Date | null> {
    const result = await client.query<{ at: Date | null }>(
      `SELECT min(CASE WHEN revision<>processed THEN clock_timestamp() ELSE due_at END) AS at FROM hash_talk.profile_ranking_state WHERE revision<>processed OR due_at<>'infinity'`,
    );
    return result.rows[0]!.at;
  }
  async clean(client: Reader): Promise<void> {
    await client.query(`DELETE FROM hash_talk.profile_ranking_entries WHERE (generation,period,profile_id) IN
      (SELECT e.generation,e.period,e.profile_id FROM hash_talk.profile_ranking_entries e JOIN hash_talk.community_ranking_generations g
      ON g.id=e.generation WHERE g.expires_at<=clock_timestamp() LIMIT 256)`);
  }
  page(
    period: RankingPeriod,
    after: string | null,
    selection: ProfileRankingSelection = {},
  ) {
    return readProfileRankingPage({
      client: this.pool,
      profiles: this.profiles,
      period,
      after,
      ...selection,
    });
  }
}
