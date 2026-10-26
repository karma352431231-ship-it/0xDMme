import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { assertContentCapacity } from '../../src/server/database/content-capacity.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  seedStorageReservations,
  assertStorageReconciled,
} from '../fixtures/storage-reservation-database.ts';
import {
  globalUsagePredecessor,
  globalUsageSources,
  globalSourceSnapshot,
  globalBytes,
  observeGlobalWrites,
  globalWrites,
  insertJournal,
} from '../fixtures/global-usage-database.ts';

interface GlobalContext {
  writer: pg.Client;
  reader: pg.Client;
  fixture: Awaited<ReturnType<typeof seedStorageReservations>>;
  sources: Awaited<ReturnType<typeof globalUsageSources>>;
}
const engagementSources = [
  'engagement_state',
  'engagement_counts',
  'engagement_entities',
  'engagement_contributors',
  'engagement_visitors',
  'engagement_observations',
  'engagement_erasure',
  'engagement_snapshots',
].map((name) => ({ name, events: 12 }));
async function rollback(client: pg.Client, work: () => Promise<void>) {
  await client.query('BEGIN');
  try {
    await work();
  } finally {
    await client.query('ROLLBACK');
  }
}
async function reconciled(c: GlobalContext) {
  const rows = await globalSourceSnapshot(c.writer, c.sources);
  assert.equal(
    await globalBytes(c.writer),
    rows.reduce((sum, row) => sum + BigInt(row.bytes), 0n),
  );
  await assertStorageReconciled(c.writer, c.fixture.accounts);
}
async function verifyBatches(t: TestContext, c: GlobalContext) {
  const { writer, fixture } = c;
  await t.test(
    'community addresses retain exact UTF-8 charges across insert, update and delete',
    async () => {
      await rollback(writer, async () => {
        const community = (
          await writer.query<{ id: string }>(
            'SELECT id FROM hash_talk.communities ORDER BY id LIMIT 1',
          )
        ).rows[0]!.id;
        const before = await globalBytes(writer);
        await writer.query(
          'INSERT INTO hash_talk.community_addresses(community_id,slug) VALUES($1,$2)',
          [community, 'synthetic-capacity'],
        );
        assert.equal(
          await globalBytes(writer),
          before + BigInt(256 + Buffer.byteLength('synthetic-capacity')),
        );
        await writer.query(
          'UPDATE hash_talk.community_addresses SET slug=$2 WHERE community_id=$1',
          [community, 'sintético-capacity'],
        );
        assert.equal(
          await globalBytes(writer),
          before + BigInt(256 + Buffer.byteLength('sintético-capacity')),
        );
        await reconciled(c);
        await writer.query(
          'DELETE FROM hash_talk.community_addresses WHERE community_id=$1',
          [community],
        );
        assert.equal(await globalBytes(writer), before);
        assert.equal(await globalWrites(writer), 3);
        await reconciled(c);
      });
    },
  );
  await t.test(
    'thousand-row insert, charge update and deletion each write one exact global delta',
    async () => {
      await rollback(writer, async () => {
        const before = await globalBytes(writer);
        await insertJournal(writer, fixture.first);
        assert.equal(await globalWrites(writer), 1);
        assert.equal(await globalBytes(writer), before + 512000n);
        await reconciled(c);
        await writer.query(
          'UPDATE hash_talk.message_changes SET charge=charge+1 WHERE account_id=$1 AND revision>=1000',
          [fixture.first],
        );
        assert.equal(await globalWrites(writer), 2);
        assert.equal(await globalBytes(writer), before + 513000n);
        await reconciled(c);
        await writer.query(
          'DELETE FROM hash_talk.message_changes WHERE account_id=$1 AND revision>=1000',
          [fixture.first],
        );
        assert.equal(await globalWrites(writer), 3);
        assert.equal(await globalBytes(writer), before);
        await reconciled(c);
      });
    },
  );
  await t.test(
    'mixed upsert accounts inserted and updated transition sets without duplicate charging',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          'INSERT INTO hash_talk.message_changes(account_id,revision,charge) VALUES($1,1000,512)',
          [fixture.first],
        );
        const before = await globalBytes(writer);
        await writer.query(
          `INSERT INTO hash_talk.message_changes(account_id,revision,charge) VALUES($1,1000,600),($1,1001,700)
        ON CONFLICT(account_id,revision) DO UPDATE SET charge=EXCLUDED.charge`,
          [fixture.first],
        );
        assert.equal(await globalBytes(writer), before + 788n);
        await reconciled(c);
      });
    },
  );
  await t.test(
    'multi-account profile creation and removal preserve null and ciphertext overhead',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          "UPDATE hash_talk.accounts SET profile_revision=1,profile_iv=decode(repeat('00',12),'hex'),profile_ciphertext=decode(repeat('00',32),'hex') WHERE id=ANY($1::uuid[])",
          [fixture.accounts],
        );
        await reconciled(c);
        await writer.query(
          'UPDATE hash_talk.accounts SET profile_revision=0,profile_iv=NULL,profile_ciphertext=NULL WHERE id=ANY($1::uuid[])',
          [fixture.accounts],
        );
        await reconciled(c);
      });
    },
  );
  await t.test(
    'constraint failure and explicit rollback leave source and global totals unchanged',
    async () => {
      const before = await globalSourceSnapshot(writer, c.sources);
      await rollback(writer, async () => {
        await assert.rejects(
          writer.query(
            `INSERT INTO hash_talk.message_changes(account_id,revision,charge)
        VALUES($1,1000,512),($1,1001,1)`,
            [fixture.first],
          ),
          /check constraint/u,
        );
      });
      await rollback(writer, async () => {
        await insertJournal(writer, fixture.first);
      });
      assert.deepEqual(await globalSourceSnapshot(writer, c.sources), before);
      await reconciled(c);
    },
  );
}
async function verifyCoordination(t: TestContext, c: GlobalContext) {
  const { writer, reader, fixture } = c;
  await t.test(
    'independent committed batches retain both exact deltas',
    async () => {
      const before = await globalBytes(writer);
      try {
        await Promise.all([
          insertJournal(writer, fixture.first),
          insertJournal(reader, fixture.second),
        ]);
        assert.equal(await globalBytes(writer), before + 1024000n);
        await reconciled(c);
      } finally {
        await writer.query(
          'DELETE FROM hash_talk.message_changes WHERE account_id=ANY($1::uuid[]) AND revision>=1000',
          [fixture.accounts],
        );
      }
    },
  );
  await t.test(
    'generation cache and global bytes agree through batched insertion and cascade cleanup',
    async () => {
      await rollback(writer, async () => {
        const community = (
          await writer.query<{ id: string }>(
            'SELECT id FROM hash_talk.communities LIMIT 1',
          )
        ).rows[0]!.id;
        await writer.query(`INSERT INTO hash_talk.community_ranking_generations(id,cutoff,expires_at,version)
        SELECT gen_random_uuid(),now(),now()+interval '1 day',1 FROM generate_series(1,20)`);
        await writer.query(
          `INSERT INTO hash_talk.community_ranking_entries(generation,community_id,period,score,participants,contributions,upvotes,history_complete,followers,trending,newly_created)
        SELECT id,$1,'day',1,1,1,1,true,1,true,true FROM hash_talk.community_ranking_generations`,
          [community],
        );
        const cache = async () => {
          const result = await writer.query<{
            used: string;
            expected: string;
          }>(`SELECT used_bytes::text AS used,
          ((SELECT coalesce(sum(charge),0) FROM hash_talk.community_ranking_generations)
          +(SELECT coalesce(sum(charge),0) FROM hash_talk.community_ranking_entries))::text AS expected
          FROM hash_talk.community_ranking_cache_usage WHERE singleton`);
          assert.equal(result.rows[0]!.used, result.rows[0]!.expected);
          await reconciled(c);
        };
        await cache();
        await writer.query(
          'DELETE FROM hash_talk.community_ranking_generations',
        );
        await cache();
      });
    },
  );
  await t.test(
    'zero-net redistribution, unchanged and empty updates do not acquire the global row',
    async () => {
      await writer.query(
        "INSERT INTO hash_talk.message_recovery_keys(account_id,epoch,id,body,charge) VALUES($1,2,gen_random_uuid(),'{}',5000)",
        [fixture.first],
      );
      try {
        await rollback(writer, async () => {
          await writer.query(
            'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
          );
          await rollback(reader, async () => {
            await reader.query('SET LOCAL statement_timeout=1000');
            const result = await reader.query(
              `UPDATE hash_talk.message_recovery_keys SET charge=CASE epoch WHEN 1 THEN charge+1 ELSE charge-1 END
            WHERE account_id=$1 AND epoch IN (1,2)`,
              [fixture.first],
            );
            assert.equal(result.rowCount, 2);
            await reader.query(
              'UPDATE hash_talk.message_recovery_keys SET charge=charge WHERE account_id=$1',
              [fixture.first],
            );
            await reader.query(
              'UPDATE hash_talk.message_recovery_keys SET charge=charge+1 WHERE false',
            );
          });
        });
      } finally {
        await writer.query(
          'DELETE FROM hash_talk.message_recovery_keys WHERE account_id=$1 AND epoch=2',
          [fixture.first],
        );
      }
      await reconciled(c);
    },
  );
  await t.test(
    'nonzero deltas still wait for the global guard and refuse over-budget publication',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
        );
        await rollback(reader, async () => {
          await reader.query('SET LOCAL statement_timeout=200');
          await assert.rejects(
            reader.query(
              'INSERT INTO hash_talk.message_changes(account_id,revision,charge) VALUES($1,1000,512)',
              [fixture.first],
            ),
            (error: unknown) =>
              error instanceof Error &&
              'code' in error &&
              error.code === '57014',
          );
        });
      });
      const before = await globalBytes(writer);
      await rollback(writer, async () => {
        await insertJournal(writer, fixture.first);
        await assert.rejects(
          assertContentCapacity(writer, Number(before)),
          /Global capacity/u,
        );
      });
      await reconciled(c);
    },
  );
  await t.test(
    'missing global ledger fails closed and rolls source insertion back',
    async () => {
      await rollback(writer, async () => {
        await writer.query('DELETE FROM hash_talk.content_usage');
        await assert.rejects(
          writer.query(
            'INSERT INTO hash_talk.message_changes(account_id,revision,charge) VALUES($1,1000,512)',
            [fixture.first],
          ),
          /Global quota accounting unavailable/u,
        );
      });
      await reconciled(c);
    },
  );
}

await test('statement global accounting preserves populated history and avoids per-row ledger writes', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
      'hash_talk_test_global_usage_' + crypto.randomUUID().replaceAll('-', ''),
    administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    writer = new pg.Client({ connectionString: url.href }),
    reader = new pg.Client({ connectionString: url.href });
  t.after(async () => {
    await Promise.all([writer.query('ROLLBACK'), reader.query('ROLLBACK')]);
    await Promise.all([db.close(), writer.end(), reader.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await Promise.all([writer.connect(), reader.connect()]);
  await globalUsagePredecessor(writer);
  const fixture = await seedStorageReservations(writer),
    sources = await globalUsageSources(writer),
    before = await globalSourceSnapshot(writer, sources),
    bytes = await globalBytes(writer),
    versions = (
      await writer.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows;
  assert.equal(sources.length, 81);
  await observeGlobalWrites(writer);
  await t.test(
    'predecessor reproduces one thousand global counter writes for a thousand-row operation',
    async () => {
      await rollback(writer, async () => {
        await insertJournal(writer, fixture.first);
        assert.equal(await globalWrites(writer), 1000);
      });
    },
  );
  await t.test(
    'an unexpected predecessor trigger aborts the entire schema transition',
    async () => {
      const migration = await readFile(
        new URL(
          '../../src/server/database/migrations/079-global-statement-accounting.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await rollback(writer, async () => {
        await writer.query(
          'ALTER TABLE hash_talk.message_changes DISABLE TRIGGER track_message_change_content',
        );
        await assert.rejects(
          writer.query(migration),
          /Unexpected global accounting trigger/u,
        );
      });
      assert.deepEqual(await globalUsageSources(writer), sources);
      assert.deepEqual(await globalSourceSnapshot(writer, sources), before);
      assert.equal(
        (
          await writer.query<{ function: string | null }>(
            "SELECT to_regprocedure('hash_talk.track_statement_content_usage()') AS function",
          )
        ).rows[0]?.function,
        null,
      );
    },
  );
  await db.migrate();
  const context = {
    writer,
    reader,
    fixture,
    sources: [...sources, ...engagementSources],
  };
  await t.test(
    'migration preserves source fingerprints, exact totals and published checksums',
    async () => {
      assert.deepEqual(await globalSourceSnapshot(writer, sources), before);
      const added = await globalSourceSnapshot(writer, engagementSources);
      const addedBytes = added
        .filter((row) => row.name.startsWith('engagement_'))
        .reduce((sum, row) => sum + BigInt(row.bytes), 0n);
      assert.equal(await globalBytes(writer), bytes + addedBytes);
      assert.deepEqual(
        (
          await writer.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=78 ORDER BY version',
          )
        ).rows,
        versions,
      );
      await db.migrate();
      await db.verifyMigrations();
      await reconciled(context);
    },
  );
  await t.test(
    'existing and new ranking sources retain statement accounting for all three write events',
    async () => {
      const actual = (
        await writer.query<{
          name: string;
          events: number;
        }>(`SELECT c.relname AS name,bit_or(t.tgtype::integer) AS events FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='hash_talk' AND t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure
      GROUP BY c.relname ORDER BY c.relname`)
      ).rows;
      assert.deepEqual(
        actual,
        [
          ...sources.map(({ name, events }) => ({ name, events: events & ~1 })),
          { name: 'contact_invitations', events: 12 },
          ...engagementSources,
          ...[
            'community_post_engagement',
            'community_share_clicks',
            'profile_ranking_state',
          ].map((name) => ({ name, events: 28 })),
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
  );
  // The observation below measures application statements, independently of
  // the new schema's charged baselines created by the migration itself.
  await writer.query('TRUNCATE hash_talk.test_global_writes');
  await verifyBatches(t, context);
  await verifyCoordination(t, context);
});
