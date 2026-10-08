import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { communityPageSize } from '../../shared/communities/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import {
  newlyCreated,
  rankingScore,
  rankingVersion,
  rankingMetricVersion,
} from '../../shared/community-ranking/index.ts';
import type { ExploreFilter } from '../../shared/community-discovery/index.ts';
import { measureRanking } from './community-ranking-metrics.ts';
import { assertContentCapacity } from './vault-quota.ts';

const producerLock = "hashtext('hash-talk:community-ranking-producer')";
export class CommunityRankingStore {
  private readonly pool: pg.Pool;
  private readonly capacity: number;
  private readonly cacheBudget: number;
  constructor(pool: pg.Pool, capacity: number, cacheBudget = 64 * 1024 * 1024) {
    this.pool = pool;
    this.capacity = capacity;
    this.cacheBudget = cacheBudget;
  }
  /** A single producer globally; metrics are recomputed only for affected communities. */
  async process(): Promise<number | null> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const lock = await client.query<{ held: boolean }>(
        `SELECT pg_try_advisory_lock(${producerLock}) AS held`,
      );
      locked = lock.rows[0]?.held ?? false;
      if (!locked) return Date.now() + 1000;
      const cutoff = await this.round(client);
      // Keep the source horizon aligned with an unfinished round, not wall-clock time.
      await this.clean(client, cutoff ?? new Date());
      if (!cutoff) return this.nextDeadline(client);
      const pending = await client.query<{ community_id: string }>(
        `SELECT community_id FROM hash_talk.community_ranking_state
        WHERE (cutoff IS NULL OR cutoff<$1) AND (revision<>processed OR due_at<=$1 OR metrics IS NULL OR metrics->>'version' IS DISTINCT FROM $2::text OR metrics->>'formulaVersion' IS DISTINCT FROM $3::text) ORDER BY due_at,community_id LIMIT 32`,
        [cutoff, rankingMetricVersion, rankingVersion],
      );
      if (pending.rows.length) {
        const measured = await measureRanking(
          client,
          pending.rows.map((r) => r.community_id),
          cutoff,
        );
        const updates = measured.map((row) => ({
          id: row.community_id,
          revision: row.revision,
          due_at: row.due_at,
          metrics: {
            version: rankingMetricVersion,
            formulaVersion: rankingVersion,
            day: { ...row.day, score: rankingScore(row.day) },
            week: { ...row.week, score: rankingScore(row.week) },
            followers: row.followers,
            archived: row.archived,
            createdAt: row.created_at?.getTime() ?? null,
            newDay: newlyCreated({
              createdAt: row.created_at?.getTime() ?? null,
              cutoff: cutoff.getTime(),
              followers: row.followers,
              participants: row.day.current.participants,
              archived: row.archived,
            }),
            newWeek: newlyCreated({
              createdAt: row.created_at?.getTime() ?? null,
              cutoff: cutoff.getTime(),
              followers: row.followers,
              participants: row.week.current.participants,
              archived: row.archived,
            }),
          },
        }));
        await this.persist(client, cutoff, updates);
      }
      const remaining = await client.query<{ pending: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM hash_talk.community_ranking_state
        WHERE (cutoff IS NULL OR cutoff<$1) AND (revision<>processed OR due_at<=$1 OR metrics IS NULL OR metrics->>'version' IS DISTINCT FROM $2::text OR metrics->>'formulaVersion' IS DISTINCT FROM $3::text)) AS pending`,
        [cutoff, rankingMetricVersion, rankingVersion],
      );
      if (remaining.rows[0]!.pending) return Date.now();
      if (!(await this.reserveCache(client))) return Date.now();
      await this.publish(client, cutoff);

      return this.nextDeadline(client);
    } finally {
      try {
        if (locked)
          await client.query(`SELECT pg_advisory_unlock(${producerLock})`);
      } finally {
        client.release();
      }
    }
  }
  private async round(client: pg.PoolClient): Promise<Date | null> {
    // A stale interrupted round cannot use vote deltas already past retention.
    await client.query(`UPDATE hash_talk.community_ranking_settings SET round_cutoff=NULL
      WHERE singleton AND round_cutoff<clock_timestamp()-interval '30 seconds'`);
    const existing = await client.query<{ at: Date | null }>(
      'SELECT round_cutoff AS at FROM hash_talk.community_ranking_settings WHERE singleton',
    );
    if (existing.rows[0]!.at) return existing.rows[0]!.at;
    const result = await client.query<{ at: Date }>(
      `UPDATE hash_talk.community_ranking_settings SET round_cutoff=
      greatest(date_trunc('milliseconds',clock_timestamp()),coalesce((SELECT max(cutoff)+interval '1 millisecond' FROM hash_talk.community_ranking_generations),'-infinity'::timestamptz))
      WHERE singleton AND (EXISTS(SELECT 1 FROM hash_talk.community_ranking_state WHERE revision<>processed OR due_at<=clock_timestamp() OR metrics IS NULL OR metrics->>'version' IS DISTINCT FROM $1::text OR metrics->>'formulaVersion' IS DISTINCT FROM $2::text)
        OR NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_generations WHERE published AND metrics_version=$1::integer AND version=$2::integer AND expires_at>clock_timestamp())) RETURNING round_cutoff AS at`,
      [rankingMetricVersion, rankingVersion],
    );
    return result.rows[0]?.at ?? null;
  }
  private async persist(
    client: pg.PoolClient,
    cutoff: Date,
    updates: {
      id: string;
      revision: string;
      due_at: Date | null;
      metrics: unknown;
    }[],
  ): Promise<void> {
    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE hash_talk.community_ranking_state s SET processed=u.revision,cutoff=$2,due_at=coalesce(u.due_at,'infinity'),metrics=u.metrics
        FROM jsonb_to_recordset($1::jsonb) AS u(id uuid,revision bigint,due_at timestamptz,metrics jsonb)
        WHERE s.community_id=u.id AND s.processed<=u.revision`,
        [JSON.stringify(updates), cutoff],
      );
      await assertContentCapacity(client, this.capacity);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  private async publish(client: pg.PoolClient, cutoff: Date): Promise<void> {
    const id = randomUUID();
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO hash_talk.community_ranking_generations(id,cutoff,expires_at,version,metrics_version) VALUES($1,$2,$2::timestamptz+interval '5 minutes',$3,$4)`,
        [id, cutoff, rankingVersion, rankingMetricVersion],
      );
      await client.query(
        `INSERT INTO hash_talk.community_ranking_entries(generation,community_id,period,score,participants,contributions,upvotes,history_complete,followers,trending,newly_created,source_revision)
        SELECT $1,s.community_id,p.period,(m.value->>'score')::bigint,(m.value->'current'->>'participants')::integer,
        (m.value->'current'->>'contributions')::integer,(m.value->'current'->>'upvotes')::integer,(m.value->>'historyComplete')::boolean,
        (s.metrics->>'followers')::integer,NOT (s.metrics->>'archived')::boolean AND (m.value->>'score')::bigint>0,
        (s.metrics->>CASE WHEN p.period='day' THEN 'newDay' ELSE 'newWeek' END)::boolean,s.processed
        FROM hash_talk.community_ranking_state s CROSS JOIN (VALUES('day'),('week')) p(period)
        CROSS JOIN LATERAL (SELECT s.metrics->p.period AS value) m WHERE s.metrics IS NOT NULL`,
        [id],
      );
      await assertContentCapacity(client, this.capacity);
      await client.query(
        'UPDATE hash_talk.community_ranking_generations SET published=true WHERE id=$1',
        [id],
      );
      await client.query(
        'UPDATE hash_talk.community_ranking_settings SET round_cutoff=NULL WHERE singleton',
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  private async reserveCache(client: pg.PoolClient): Promise<boolean> {
    const usage = await client.query<{
      used: string;
      global: string;
      needed: string;
    }>(`SELECT cache.used_bytes::text AS used,content.used_bytes::text AS global,
      (256+512*(SELECT count(*) FROM hash_talk.community_ranking_state))::text AS needed
      FROM hash_talk.community_ranking_cache_usage cache CROSS JOIN hash_talk.content_usage content WHERE cache.singleton AND content.singleton`);
    const { used, needed, global } = usage.rows[0]!;
    if (Number(needed) > this.cacheBudget)
      throw new AccountError(
        503,
        'Capacidade do ranking insuficiente para publicar o universo completo.',
      );
    if (
      Number(used) + Number(needed) <= this.cacheBudget &&
      Number(global) + Number(needed) <= this.capacity
    )
      return true;
    const old = await client.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM hash_talk.community_ranking_generations) AS exists',
    );
    if (!old.rows[0]!.exists)
      throw new AccountError(
        503,
        'Capacidade global insuficiente para publicar o ranking.',
      );
    await client.query(`UPDATE hash_talk.community_ranking_generations SET expires_at=clock_timestamp()
      WHERE id=(SELECT id FROM hash_talk.community_ranking_generations WHERE expires_at>clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_entries e JOIN hash_talk.community_ranking_generations g ON g.id=e.generation WHERE g.expires_at<=clock_timestamp())
      ORDER BY sequence LIMIT 1)`);
    // The next pass removes entries in bounded batches; never mass-delete a generation.
    return false;
  }
  private async clean(client: pg.PoolClient, cutoff: Date): Promise<void> {
    // Bounded cleanup; no accepted public contributions are removed.
    await client.query(
      `DELETE FROM hash_talk.community_upvote_deltas WHERE (post_id,at) IN
      (SELECT post_id,at FROM hash_talk.community_upvote_deltas WHERE at<$1::timestamptz-interval '14 days' ORDER BY at LIMIT 256)`,
      [cutoff],
    );
    await client.query(`DELETE FROM hash_talk.community_ranking_entries WHERE (generation,period,community_id) IN
      (SELECT e.generation,e.period,e.community_id FROM hash_talk.community_ranking_entries e JOIN hash_talk.community_ranking_generations g ON g.id=e.generation WHERE g.expires_at<=clock_timestamp() LIMIT 256)`);
    await client.query(`DELETE FROM hash_talk.community_ranking_generations WHERE id IN
      (SELECT id FROM hash_talk.community_ranking_generations g WHERE expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_entries e WHERE e.generation=g.id) LIMIT 32)`);
  }
  private async nextDeadline(client: pg.PoolClient): Promise<number | null> {
    const result = await client.query<{
      at: Date | null;
    }>(`SELECT min(at) AS at FROM (
      SELECT min(CASE WHEN revision<>processed THEN clock_timestamp() ELSE due_at END) AS at FROM hash_talk.community_ranking_state WHERE revision<>processed OR due_at<>'infinity'
      UNION ALL SELECT min(at)+interval '14 days' FROM hash_talk.community_upvote_deltas
      UNION ALL SELECT min(expires_at) FROM hash_talk.community_ranking_generations
    ) dates`);
    return result.rows[0]?.at?.getTime() ?? null;
  }
  async page(
    filter: ExploreFilter,
    cursor: { generation: string; rank: number; id: string } | null,
  ) {
    const rank = filter.order === 'size' ? 'e.followers' : 'e.score';
    const condition = {
      new: "e.newly_created AND NOT c.archived AND c.created_at>clock_timestamp()-interval '7 days'",
      trending: 'e.trending AND NOT c.archived',
      size: 'true',
    }[filter.order];
    // Header and entries share one SQL snapshot, including concurrent cache eviction.
    const result = await this.pool.query<{
      id: string;
      cutoff: Date;
      expires_at: Date;
      entries: {
        community_id: string;
        rank: string;
        participants: number;
        contributions: number;
        upvotes: number;
        history_complete: boolean;
      }[];
    }>(
      `WITH head AS (
        SELECT id,cutoff,expires_at FROM hash_talk.community_ranking_generations
        WHERE published AND version=$2 AND metrics_version=$3 AND expires_at>clock_timestamp()
        AND ($1::uuid IS NULL OR id=$1) ORDER BY sequence DESC LIMIT 1
      ), ranked AS (
        SELECT e.community_id,${rank}::text AS rank,e.participants,e.contributions,e.upvotes,e.history_complete
        FROM head g JOIN hash_talk.community_ranking_entries e ON e.generation=g.id
        JOIN hash_talk.communities c ON c.id=e.community_id
        WHERE e.period=$4 AND ${condition}
        AND ($5::bigint IS NULL OR (${rank},e.community_id)<($5,$6::uuid))
        ORDER BY ${rank} DESC,e.community_id DESC LIMIT $7
      ) SELECT g.id,g.cutoff,g.expires_at,
        coalesce((SELECT jsonb_agg(r ORDER BY r.rank::bigint DESC,r.community_id DESC) FROM ranked r),'[]'::jsonb) AS entries
      FROM head g`,
      [
        cursor?.generation ?? null,
        rankingVersion,
        rankingMetricVersion,
        filter.period,
        cursor?.rank ?? null,
        cursor?.id ?? null,
        communityPageSize + 1,
      ],
    );
    const head = result.rows[0];
    if (!head) {
      if (cursor)
        throw new AccountError(409, 'Ranking atualizado; recarregue a lista.');
      throw new AccountError(503, 'Ranking em preparação. Tente novamente.');
    }
    return { head, rows: head.entries };
  }
}
