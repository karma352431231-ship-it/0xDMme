import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { EngagementMetricsStore } from '../../src/server/database/engagement-metrics.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { engagementCsv } from '../../src/server/engagement-metrics/index.ts';

await test('metric operations preserve history, export every snapshot and recover bounded maintenance', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('A disposable engagement test database is required.');
  const administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  const name =
    'hash_talk_test_engagement_operations_' +
    crypto.randomUUID().replaceAll('-', '');
  await administrator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  const isolated = new URL(config.databaseUrl);
  isolated.pathname = '/' + name;
  const db = new Database(isolated.href);
  const pool = new pg.Pool({
    connectionString: isolated.href,
    max: 4,
    connectionTimeoutMillis: 3000,
    statement_timeout: 4000,
    lock_timeout: 1000,
  });
  t.after(async () => {
    await db.close();
    await pool.end();
    await administrator.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await administrator.end();
  });
  await db.migrate();
  const metrics = db.engagementMetrics;
  const project = '00000000-0000-0000-0000-000000000000';
  async function feedCount() {
    const report = await metrics.report({
      metrics: ['public_page_views'],
      preset: 'last24h',
      pageCategories: ['feed'],
    });
    return BigInt(report.rows[0]!.values.public_page_views!.value!);
  }

  await t.test(
    'reconciliation repairs current gauges without rewriting accepted creation totals',
    async () => {
      const before = await metrics.report({
        metrics: ['accounts_created', 'public_profiles_created'],
        preset: 'last24h',
      });
      await pool.query(
        `INSERT INTO hash_talk.engagement_counts(metric,bucket,scope,entity,shard,value)
      VALUES('public_profiles_existing',date_trunc('minute',clock_timestamp()),'project',$1,0,3)
      ON CONFLICT(metric,bucket,scope,entity,shard,cause,category) DO UPDATE SET value=hash_talk.engagement_counts.value+3`,
        [project],
      );
      const check = await metrics.reconcile();
      assert.equal(check.repaired, false);
      assert.ok(check.gauges.some((row) => row.expected !== row.recorded));
      assert.equal((await metrics.reconcile({ repair: true })).repaired, true);
      const clean = await metrics.reconcile();
      assert.ok(clean.gauges.every((row) => row.expected === row.recorded));
      assert.equal((await metrics.reconcile({ repair: true })).operation, null);
      const after = await metrics.report({
        metrics: ['accounts_created', 'public_profiles_created'],
        preset: 'last24h',
      });
      assert.deepEqual(after.rows, before.rows);
    },
  );

  await t.test(
    'concurrent qualified traffic and correction retries stay exact; failed corrections roll back',
    async () => {
      const before = await feedCount();
      const batches = Array.from({ length: 12 }, () => ({
        items: Array.from({ length: 24 }, () => ({
          id: crypto.randomUUID(),
          kind: 'page',
          category: 'feed',
          community: null,
          post: null,
        })),
      }));
      await Promise.all(batches.map((batch) => metrics.observe(batch)));
      await Promise.all(batches.map((batch) => metrics.observe(batch)));
      assert.equal(await feedCount(), before + 288n);
      const bucket = (
        await pool.query<{
          bucket: Date;
        }>(`SELECT bucket FROM hash_talk.engagement_counts
      WHERE metric='public_page_views' AND category='feed' ORDER BY bucket DESC LIMIT 1`)
      ).rows[0]!.bucket.toISOString();
      const correction = {
        id: crypto.randomUUID(),
        kind: 'traffic',
        metric: 'public_page_views',
        scope: 'project',
        category: 'feed',
        bucket,
        delta: '-2',
        reason: 'invalid_traffic',
      };
      const retries = await Promise.all([
        metrics.correct(correction),
        metrics.correct(correction),
      ]);
      assert.equal(retries.filter((item) => item.applied).length, 1);
      assert.equal(await feedCount(), before + 286n);
      const invalid = {
        ...correction,
        id: crypto.randomUUID(),
        delta: '-99999',
      };
      await assert.rejects(metrics.correct(invalid), /negative/u);
      const limited = new EngagementMetricsStore(pool, 1);
      const unavailable = {
        ...correction,
        id: crypto.randomUUID(),
        delta: '-1',
      };
      await assert.rejects(limited.correct(unavailable));
      assert.equal(await feedCount(), before + 286n);
      assert.equal(
        (
          await pool.query(
            'SELECT 1 FROM hash_talk.engagement_operations WHERE id=ANY($1::uuid[])',
            [[invalid.id, unavailable.id]],
          )
        ).rowCount,
        0,
      );
    },
  );

  await t.test(
    'coverage exposes known failures in reports without browser or request identities',
    async () => {
      const now = new Date().toISOString();
      await metrics.noteCollectionFailure({
        from: now,
        to: now,
        occurrences: 2,
      });
      const report = await metrics.report({
        metrics: ['public_page_views'],
        preset: 'last24h',
      });
      assert.ok(
        report.coverage.some((item) => item.reason === 'collection_failure'),
      );
      assert.equal(report.complete, false);
      assert.ok(engagementCsv(report).includes('known_collection_issues'));
      const columns = (
        await pool.query<{
          column_name: string;
        }>(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='hash_talk' AND table_name='engagement_coverage'`)
      ).rows.map((row) => row.column_name);
      assert.deepEqual(columns.sort(), [
        'charge',
        'day',
        'ended_at',
        'occurrences',
        'reason',
        'started_at',
      ]);
    },
  );

  await t.test(
    'crowded snapshot cutoffs resume completely and remain pinned across aggregate revisions',
    async () => {
      const cutoff = new Date(
        Math.floor((Date.now() - 3_600_000) / 60_000) * 60_000,
      ).toISOString();
      await pool.query(
        "UPDATE hash_talk.engagement_state SET started_at=clock_timestamp()-interval '3 days' WHERE singleton",
      );
      const entities = (
        await pool.query<{
          id: string;
        }>(`INSERT INTO hash_talk.engagement_entities(id,kind,community,eligible)
      SELECT id,'community',id,true FROM (SELECT gen_random_uuid() AS id FROM generate_series(1,1005)) seeded RETURNING id`)
      ).rows.map((row) => row.id);
      await pool.query(
        `INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete)
      SELECT $1,'day','public_contributors_distinct','community',id,1,true FROM unnest($2::uuid[]) ids(id)`,
        [cutoff, entities],
      );
      await pool.query(
        `INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete)
      VALUES($1,'day','public_site_visitors_estimated','project',$2,10,true)`,
        [cutoff, project],
      );
      const first = await metrics.snapshotsPage({
        before: new Date(Date.parse(cutoff) + 1).toISOString(),
      });
      assert.equal(first.rows.length, 1000);
      assert.ok(first.next);
      // A capture that publishes after page one cannot enter its continuation.
      await pool.query(
        `WITH next AS (
          UPDATE hash_talk.engagement_state SET snapshot_generation=snapshot_generation+1
          WHERE singleton RETURNING snapshot_generation
        ), entity AS (
          INSERT INTO hash_talk.engagement_entities(id,kind,community,eligible)
          SELECT id,'community',id,true FROM (SELECT 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid AS id) seeded RETURNING id
        ) INSERT INTO hash_talk.engagement_snapshots(cutoff,period,metric,scope,entity,value,complete,generation)
          SELECT $1,'day','public_contributors_distinct','community',entity.id,1,true,next.snapshot_generation
          FROM entity CROSS JOIN next`,
        [cutoff],
      );
      const correction = {
        id: crypto.randomUUID(),
        kind: 'snapshot',
        cutoff,
        expectedRevision: '1',
        value: '7',
        reason: 'measurement_error',
      };
      const receipt = await metrics.correct(correction);
      assert.equal((await metrics.correct(correction)).applied, false);
      const second = await metrics.snapshotsPage({ cursor: first.next });
      assert.equal(second.next, null);
      assert.equal(second.snapshotGeneration, first.snapshotGeneration);
      const all = [...first.rows, ...second.rows];
      assert.equal(all.length, 1006);
      assert.equal(
        new Set(
          all.map((row) =>
            [row.cutoff, row.period, row.metric, row.scope, row.entity].join(
              ':',
            ),
          ),
        ).size,
        1006,
      );
      assert.equal(
        all.find((row) => row.metric === 'public_site_visitors_estimated')!
          .value,
        '10',
      );
      const latest = await metrics.report({
        metrics: ['public_site_visitors_estimated'],
        from: new Date(Date.parse(cutoff) - 86_400_000).toISOString(),
        to: cutoff,
      });
      assert.equal(
        latest.rows[0]!.values.public_site_visitors_estimated!.value,
        '7',
      );
      assert.equal(latest.correctionRevision, receipt.revision);
      const fresh = await metrics.snapshotsPage({
        before: new Date(Date.parse(cutoff) + 1).toISOString(),
      });
      assert.ok(fresh.next);
      const freshTail = await metrics.snapshotsPage({ cursor: fresh.next });
      assert.equal(fresh.rows.length + freshTail.rows.length, 1007);
      const versions = await pool.query<{ value: string }>(
        "SELECT value::text FROM hash_talk.engagement_snapshots WHERE cutoff=$1 AND scope='project' ORDER BY revision",
        [cutoff],
      );
      assert.deepEqual(
        versions.rows.map((row) => row.value),
        ['10', '7'],
      );
      await assert.rejects(
        metrics.correct({ ...correction, id: crypto.randomUUID() }),
        /revision/u,
      );
      await assert.rejects(metrics.snapshotsPage({ cursor: 'invalid' }));
    },
  );

  await t.test(
    'cleanup commits in bounded batches even when snapshot capacity is exhausted',
    async () => {
      await pool.query(`INSERT INTO hash_talk.engagement_visitors(marker,seen_at)
      SELECT encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),clock_timestamp()-interval '8 days'
      FROM generate_series(1,700)`);
      await pool.query(`INSERT INTO hash_talk.engagement_observations(id,expires_at)
      SELECT gen_random_uuid(),clock_timestamp()-interval '1 hour' FROM generate_series(1,700)`);
      await pool.query(
        "UPDATE hash_talk.engagement_state SET heartbeat_at=clock_timestamp()-interval '10 minutes' WHERE singleton",
      );
      const expired = async () =>
        Number(
          (
            await pool.query<{ count: string }>(
              "SELECT count(*)::text FROM hash_talk.engagement_visitors WHERE seen_at<clock_timestamp()-interval '7 days'",
            )
          ).rows[0]!.count,
        );
      const before = await expired();
      const limited = new EngagementMetricsStore(pool, 1);
      await assert.rejects(limited.collect());
      assert.equal(await expired(), before - 256);
      for (let step = 0; step < 3 && (await expired()) > 0; step++)
        await assert.rejects(limited.collect());
      assert.equal(await expired(), 0);
      await metrics.collect();
      const health = await metrics.health();
      assert.equal(health.state['expiredVisitorMarkers'], '0');
      assert.ok(BigInt(String(health.state['maintenanceFailures'])) > 0n);
      assert.ok(health.storage.length >= 11);
      const report = await metrics.report({
        metrics: ['public_page_views'],
        preset: 'last24h',
      });
      assert.ok(
        report.coverage.some((item) => item.reason === 'maintenance_gap'),
      );
      assert.ok(
        report.coverage.some((item) => item.reason === 'snapshot_failure'),
      );
    },
  );

  await t.test(
    'maintenance CLI exposes read-only gauge and physical-storage evidence',
    () => {
      for (const command of ['--health', '--check']) {
        const result = spawnSync(
          process.execPath,
          ['src/tools/maintain-engagement.ts', command],
          {
            cwd: new URL('../../', import.meta.url),
            env: { ...process.env, HASH_TALK_DATABASE_URL: isolated.href },
            encoding: 'utf8',
            timeout: 15000,
          },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.ok(typeof JSON.parse(result.stdout) === 'object');
      }
    },
  );
});
