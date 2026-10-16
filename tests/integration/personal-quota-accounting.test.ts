import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  vaultUsage,
  assertVaultQuota,
} from '../../src/server/database/vault-quota.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import { groupQuotaPredecessor } from '../fixtures/group-quota-database.ts';
import {
  seedPersonalQuota,
  assertPersonalQuotaMatches,
} from '../fixtures/personal-quota-database.ts';

interface PersonalQuotaContext {
  db: Database;
  inspector: pg.Client;
  reader: pg.Client;
  fixture: Awaited<ReturnType<typeof seedPersonalQuota>>;
  globalRows: unknown[];
  versionRows: unknown[];
}

async function verifyQuotaReads(t: TestContext, context: PersonalQuotaContext) {
  const { db, inspector, reader, fixture, globalRows, versionRows } = context;
  await t.test(
    'populated backfill matches all former sums and preserves global accounting and migrations',
    async () => {
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT used_bytes FROM hash_talk.content_usage',
          )
        ).rows,
        globalRows,
      );
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=70 ORDER BY version',
          )
        ).rows,
        versionRows,
      );
      assert.equal(await vaultUsage(inspector, fixture.accounts[2]!), 0);
      await db.migrate();
      await db.verifyMigrations();
    },
  );

  await t.test(
    'ledger ordering precedes personal deltas that leave global bytes unchanged',
    async () => {
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          'UPDATE hash_talk.message_packets SET sender_charge=sender_charge+1 WHERE id=$1',
          [fixture.packet],
        );
        await assert.rejects(
          reader.query(
            'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
          ),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '55P03',
        );
      } finally {
        await inspector.query('ROLLBACK');
      }
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
    },
  );

  await t.test(
    'direct-history table locks do not block quota reads',
    async () => {
      const expected = await vaultUsage(inspector, fixture.first);
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          'LOCK TABLE hash_talk.vault_operations,hash_talk.social_messages,hash_talk.matrix_one_time_keys IN ACCESS EXCLUSIVE MODE',
        );
        assert.equal(await vaultUsage(reader, fixture.first), expected);
      } finally {
        await inspector.query('ROLLBACK');
      }
    },
  );
}

async function verifyQuotaMutations(
  t: TestContext,
  context: PersonalQuotaContext,
) {
  const { inspector, reader, fixture } = context;
  await t.test(
    'retained-byte changes and attachment exclusion keep their prior independent semantics',
    async () => {
      await inspector.query('BEGIN');
      try {
        const initial = await vaultUsage(inspector, fixture.first);
        await inspector.query(
          'UPDATE hash_talk.personal_removals SET retained_bytes=retained_bytes-1024 WHERE account_id=$1',
          [fixture.first],
        );
        assert.equal(
          await vaultUsage(inspector, fixture.first),
          initial + 1024,
        );
        await assertPersonalQuotaMatches(inspector, fixture.accounts);
        await inspector.query(
          'DELETE FROM hash_talk.personal_removals WHERE account_id=$1',
          [fixture.first],
        );
        assert.equal(
          await vaultUsage(inspector, fixture.first),
          initial - 512 + 2048,
        );
        await assertPersonalQuotaMatches(inspector, fixture.accounts);
      } finally {
        await inspector.query('ROLLBACK');
      }
    },
  );

  await t.test(
    'account and profile ownership changes move charges without recounting other history',
    async () => {
      await inspector.query('BEGIN');
      try {
        const initial = await vaultUsage(inspector, fixture.first),
          third = fixture.accounts[2]!;
        await inspector.query(
          'UPDATE hash_talk.vault_operations SET account_id=$2 WHERE id=$1',
          [fixture.operation, third],
        );
        assert.equal(
          await vaultUsage(inspector, fixture.first),
          initial - 10000,
        );
        assert.equal(await vaultUsage(inspector, third), 10000);
        await inspector.query(
          'UPDATE hash_talk.public_profiles SET account_id=$2 WHERE id=$1',
          [fixture.profiles[0], third],
        );
        await assertPersonalQuotaMatches(inspector, fixture.accounts);
      } finally {
        await inspector.query('ROLLBACK');
      }
    },
  );

  await t.test(
    'no-op writes avoid counter updates; concurrent deltas and rollback remain exact',
    async () => {
      const version = await inspector.query(
        'SELECT xmin::text FROM hash_talk.account_quota_usage WHERE account_id=$1',
        [fixture.first],
      );
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          'UPDATE hash_talk.vault_operations SET commit=commit WHERE id=$1',
          [fixture.operation],
        );
        await reader.query(
          'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
        );
      } finally {
        await inspector.query('ROLLBACK');
      }
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT xmin::text FROM hash_talk.account_quota_usage WHERE account_id=$1',
            [fixture.first],
          )
        ).rows,
        version.rows,
      );
      const initial = await vaultUsage(inspector, fixture.first);
      await Promise.all([
        inspector.query(
          'UPDATE hash_talk.daily_controls SET charge=charge+1 WHERE account_id=$1',
          [fixture.first],
        ),
        reader.query(
          'UPDATE hash_talk.daily_controls SET charge=charge+1 WHERE account_id=$1',
          [fixture.first],
        ),
      ]);
      assert.equal(await vaultUsage(inspector, fixture.first), initial + 2);
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
      await inspector.query('BEGIN');
      await inspector.query(
        'UPDATE hash_talk.message_packets SET sender_charge=sender_charge+64,recipient_charge=recipient_charge+128 WHERE id=$1',
        [fixture.packet],
      );
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
      await inspector.query('ROLLBACK');
      assert.equal(await vaultUsage(inspector, fixture.first), initial + 2);
    },
  );

  await t.test(
    'deleting each populated source and its cascades preserves the legacy charged-byte formula',
    async () => {
      const tables = [
        'status_media',
        'status_recipients',
        'status_pages',
        'status_posts',
        'group_reads',
        'group_controls',
        'message_reads',
        'message_packets',
        'message_recovery_keys',
        'matrix_one_time_keys',
        'matrix_devices',
        'matrix_envelopes',
        'representative_credentials',
        'organization_domains',
        'organizations',
        'daily_controls',
        'conversation_controls',
        'device_presence',
        'push_subscriptions',
        'push_controls',
        'call_controls',
        'personal_removals',
        'vault_operations',
        'social_media',
        'social_messages',
        'social_matrix_envelopes',
        'social_matrix_keys',
        'social_matrix_devices',
        'social_recovery',
        'social_personal_secrets',
        'social_directories',
      ];
      await inspector.query('BEGIN');
      try {
        for (const table of tables) {
          await inspector.query(`DELETE FROM hash_talk.${table}`);
          await assertPersonalQuotaMatches(inspector, fixture.accounts);
        }
        await inspector.query(
          'UPDATE hash_talk.accounts SET profile_revision=0,profile_iv=NULL,profile_ciphertext=NULL WHERE id=$1',
          [fixture.first],
        );
        await assertPersonalQuotaMatches(inspector, fixture.accounts);
      } finally {
        await inspector.query('ROLLBACK');
      }
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
    },
  );
}

async function verifyQuotaBoundaries(
  t: TestContext,
  context: PersonalQuotaContext,
) {
  const { inspector, fixture } = context;
  await t.test(
    'quota refuses the first over-budget transaction and rollback restores counters',
    async () => {
      const initial = await vaultUsage(inspector, fixture.first);
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,sequence)
        SELECT $1,gen_random_uuid(),repeat(md5(i::text),2),repeat(md5('quota'||i),2),'{}',3010000,'accepted',100+i FROM generate_series(1,334) i`,
          [fixture.first],
        );
        await assert.rejects(
          assertVaultQuota(inspector, fixture.first),
          (error: unknown) =>
            error instanceof AccountError && error.status === 413,
        );
        await assertPersonalQuotaMatches(inspector, fixture.accounts);
      } finally {
        await inspector.query('ROLLBACK');
      }
      assert.equal(await vaultUsage(inspector, fixture.first), initial);
    },
  );

  await t.test(
    'missing counters fail closed and fresh/retired owners maintain their derived rows',
    async () => {
      for (const [table, column, id] of [
        ['account_quota_usage', 'account_id', fixture.first],
        ['profile_quota_usage', 'profile_id', fixture.profiles[0]],
      ]) {
        await inspector.query('BEGIN');
        try {
          await inspector.query(
            `DELETE FROM hash_talk.${table} WHERE ${column}=$1`,
            [id],
          );
          await assert.rejects(
            vaultUsage(inspector, fixture.first),
            /Cota indisponível/u,
          );
          const mutation =
            table === 'account_quota_usage'
              ? inspector.query(
                  'UPDATE hash_talk.vault_operations SET charge=charge+1 WHERE id=$1',
                  [fixture.operation],
                )
              : inspector.query(
                  'UPDATE hash_talk.social_personal_secrets SET charge=charge+1 WHERE profile_id=$1',
                  [id],
                );
          await assert.rejects(
            mutation,
            /Personal quota accounting unavailable/u,
          );
        } finally {
          await inspector.query('ROLLBACK');
        }
      }
      const empty = crypto.randomUUID(),
        profile = crypto.randomUUID();
      await inspector.query(
        "INSERT INTO hash_talk.accounts(id,address) VALUES($1::uuid,'0x'||substr(replace($1::text,'-','')||repeat('0',40),1,40))",
        [empty],
      );
      await inspector.query(
        "INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,'synthetic_empty')",
        [profile, empty],
      );
      assert.equal(await vaultUsage(inspector, empty), 0);
      await inspector.query(
        'INSERT INTO hash_talk.daily_controls(account_id) VALUES($1)',
        [empty],
      );
      await inspector.query(
        "INSERT INTO hash_talk.social_personal_secrets(profile_id,body,charge) VALUES($1,'{}',512)",
        [profile],
      );
      assert.equal(await vaultUsage(inspector, empty), 1024);
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        empty,
      ]);
      assert.equal(await vaultUsage(inspector, empty), 0);
      assert.equal(
        (
          await inspector.query(
            'SELECT account_id FROM hash_talk.account_quota_usage WHERE account_id=$1',
            [empty],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await inspector.query(
            'SELECT profile_id FROM hash_talk.profile_quota_usage WHERE profile_id=$1',
            [profile],
          )
        ).rowCount,
        0,
      );
      await assertPersonalQuotaMatches(inspector, fixture.accounts);
    },
  );
}

await test('direct personal accounting preserves the historical formula across migration and mutations', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
    'hash_talk_test_personal_quota_' + crypto.randomUUID().replaceAll('-', '');
  const administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    inspector = new pg.Client({ connectionString: url.href }),
    reader = new pg.Client({
      connectionString: url.href,
      statement_timeout: 250,
    });
  t.after(async () => {
    await inspector.query('ROLLBACK');
    await Promise.all([db.close(), inspector.end(), reader.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await inspector.connect();
  await reader.connect();
  await groupQuotaPredecessor(inspector);
  const previous = await readFile(
    new URL(
      '../../src/server/database/migrations/070-group-quota-accounting.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await inspector.query('BEGIN');
  await inspector.query(previous);
  await inspector.query(
    'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES(70,$1)',
    [createHash('sha256').update(previous).digest('hex')],
  );
  await inspector.query('COMMIT');
  const fixture = await seedPersonalQuota(inspector);
  const initialGlobal = await inspector.query(
    'SELECT used_bytes FROM hash_talk.content_usage',
  );
  const previousVersions = await inspector.query(
    'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
  );
  await db.migrate();

  const context = {
    db,
    inspector,
    reader,
    fixture,
    globalRows: initialGlobal.rows,
    versionRows: previousVersions.rows,
  };
  await verifyQuotaReads(t, context);
  await verifyQuotaMutations(t, context);
  await verifyQuotaBoundaries(t, context);
});
