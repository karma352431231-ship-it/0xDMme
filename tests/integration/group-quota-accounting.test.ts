import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  groupTextUsage,
  groupMediaUsage,
  groupAcceptedMediaUsage,
  assertGroupTextQuota,
  assertGroupContentQuota,
  assertGroupMediaQuota,
} from '../../src/server/database/group-quota.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import {
  groupQuotaPredecessor,
  seedGroupQuota,
  assertGroupReconciled,
} from '../fixtures/group-quota-database.ts';

await test('group accounting upgrades populated history and preserves transactional quota contracts', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
    'hash_talk_test_group_quota_' + crypto.randomUUID().replaceAll('-', '');
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
  const fixture = await seedGroupQuota(inspector);
  const before = await inspector.query(
    'SELECT used_bytes FROM hash_talk.content_usage',
  );
  const checksums = await inspector.query(
    'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
  );
  await db.migrate();

  await t.test(
    'backfill preserves all charges, old migration records and the global total',
    async () => {
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT used_bytes FROM hash_talk.content_usage',
          )
        ).rows,
        before.rows,
      );
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=69 ORDER BY version',
          )
        ).rows,
        checksums.rows,
      );
      assert.equal(await groupTextUsage(inspector, fixture.first), 7952);
      assert.equal(await groupTextUsage(inspector, fixture.second), 1024);
      assert.equal(await groupMediaUsage(inspector, fixture.first), 2048);
      assert.equal(await groupAcceptedMediaUsage(inspector, fixture.first), 0);
      await assertGroupReconciled(inspector);
      await db.migrate();
      await db.verifyMigrations();
    },
  );

  await t.test(
    'ledger ordering precedes accepted occupancy even without a packet-change trigger',
    async () => {
      const media = crypto.randomUUID();
      await inspector.query(
        "INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge) VALUES($1,$2,1,gen_random_uuid(),$3,'{}',2048,1024,3072)",
        [media, fixture.first, fixture.account],
      );
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          "UPDATE hash_talk.group_media SET status='accepted',accepted_at=now() WHERE id=$1",
          [media],
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
        await inspector.query('DELETE FROM hash_talk.group_media WHERE id=$1', [
          media,
        ]);
      }
      await assertGroupReconciled(inspector);
    },
  );

  await t.test('quota reads do not touch locked history tables', async () => {
    await inspector.query('BEGIN');
    try {
      await inspector.query(
        'LOCK TABLE hash_talk.group_events,hash_talk.group_media,hash_talk.group_links IN ACCESS EXCLUSIVE MODE',
      );
      assert.equal(await groupTextUsage(reader, fixture.first), 7952);
      assert.equal(await groupMediaUsage(reader, fixture.first), 2048);
      assert.equal(await groupAcceptedMediaUsage(reader, fixture.first), 0);
    } finally {
      await inspector.query('ROLLBACK');
    }
  });

  await t.test(
    'media lifecycle releases accepted occupancy separately from durable charged bytes',
    async () => {
      await inspector.query(
        "UPDATE hash_talk.group_media SET status='writing',writer=gen_random_uuid() WHERE id=$1",
        [fixture.media],
      );
      await inspector.query(
        "UPDATE hash_talk.group_media SET status='ready',writer=NULL WHERE id=$1",
        [fixture.media],
      );
      await inspector.query(
        "UPDATE hash_talk.group_media SET status='accepted',accepted_at=now() WHERE id=$1",
        [fixture.media],
      );
      assert.equal(
        await groupAcceptedMediaUsage(inspector, fixture.first),
        2048,
      );
      await assertGroupReconciled(inspector);
      await inspector.query(
        "UPDATE hash_talk.group_media SET status='deleting' WHERE id=$1",
        [fixture.media],
      );
      assert.equal(await groupAcceptedMediaUsage(inspector, fixture.first), 0);
      assert.equal(await groupMediaUsage(inspector, fixture.first), 2048);
      await inspector.query('DELETE FROM hash_talk.group_media WHERE id=$1', [
        fixture.media,
      ]);
      assert.equal(await groupMediaUsage(inspector, fixture.first), 0);
      await assertGroupReconciled(inspector);
    },
  );

  await t.test(
    'no-op updates avoid ledger writes and owner moves apply both sides atomically',
    async () => {
      const version = await inspector.query(
        'SELECT xmin::text FROM hash_talk.group_quota_usage WHERE group_id=$1',
        [fixture.first],
      );
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          'UPDATE hash_talk.group_links SET proof=proof WHERE group_id=$1',
          [fixture.first],
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
            'SELECT xmin::text FROM hash_talk.group_quota_usage WHERE group_id=$1',
            [fixture.first],
          )
        ).rows,
        version.rows,
      );
      const initial = await groupTextUsage(inspector, fixture.first);
      await inspector.query(
        'UPDATE hash_talk.group_links SET group_id=$2,charge=charge+16 WHERE group_id=$1',
        [fixture.first, fixture.second],
      );
      assert.equal(
        await groupTextUsage(inspector, fixture.first),
        initial - 512,
      );
      assert.equal(await groupTextUsage(inspector, fixture.second), 1552);
      await Promise.all([
        inspector.query(
          'UPDATE hash_talk.group_links SET charge=charge+1 WHERE group_id=$1',
          [fixture.second],
        ),
        reader.query(
          'UPDATE hash_talk.group_links SET charge=charge+1 WHERE group_id=$1',
          [fixture.second],
        ),
      ]);
      assert.equal(await groupTextUsage(inspector, fixture.second), 1554);
      await assertGroupReconciled(inspector);
    },
  );

  await t.test(
    'every historical charge source stays exact after updates and bounded deletion',
    async () => {
      for (const table of [
        'group_events',
        'group_consents',
        'group_key_sets',
        'group_packets',
        'group_matrix_envelopes',
      ])
        await inspector.query(
          `UPDATE hash_talk.${table} SET charge=charge+64 WHERE group_id=$1`,
          [fixture.first],
        );
      await inspector.query(
        'UPDATE hash_talk.groups SET charge=charge+64 WHERE id=$1',
        [fixture.first],
      );
      await assertGroupReconciled(inspector);
      for (const table of [
        'group_packets',
        'group_key_sets',
        'group_matrix_envelopes',
        'group_consents',
        'group_members',
        'group_events',
        'group_message_changes',
        'group_cleanups',
      ]) {
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE group_id=$1`,
          [fixture.first],
        );
        await assertGroupReconciled(inspector);
      }
      assert.equal(await groupTextUsage(inspector, fixture.first), 1088);
    },
  );

  await t.test(
    'content/text and media quota rejections roll back the exact counters',
    async () => {
      const initial = await groupTextUsage(inspector, fixture.first);
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          `INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,hash,body,pending_accounts,charge)
        SELECT gen_random_uuid(),$1,1,$2,repeat(md5(i::text),2),'{}','{}',4400000 FROM generate_series(1,114) i`,
          [fixture.first, fixture.account],
        );
        const rejected = (error: unknown) =>
          error instanceof AccountError && error.status === 413;
        await assert.rejects(
          assertGroupContentQuota(inspector, fixture.first),
          rejected,
        );
        await assert.rejects(
          assertGroupTextQuota(inspector, fixture.first),
          rejected,
        );
        await inspector.query(
          `INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge)
        SELECT gen_random_uuid(),$1,1,gen_random_uuid(),$2,'{}',3000000,512,3000512 FROM generate_series(1,501)`,
          [fixture.first, fixture.account],
        );
        await assert.rejects(
          assertGroupMediaQuota(inspector, fixture.first),
          rejected,
        );
        await assertGroupReconciled(inspector);
      } finally {
        await inspector.query('ROLLBACK');
      }
      assert.equal(await groupTextUsage(inspector, fixture.first), initial);
      assert.equal(await groupMediaUsage(inspector, fixture.first), 0);
      await assertGroupReconciled(inspector);
    },
  );

  await t.test(
    'missing accounting fails closed and group deletion cascades derived state',
    async () => {
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          'DELETE FROM hash_talk.group_quota_usage WHERE group_id=$1',
          [fixture.first],
        );
        await assert.rejects(
          groupTextUsage(inspector, fixture.first),
          /Cota de grupo indisponível/u,
        );
        await assert.rejects(
          inspector.query(
            "INSERT INTO hash_talk.group_links(group_id,proof,charge) VALUES($1,'{}',512)",
            [fixture.first],
          ),
          /Group quota accounting unavailable/u,
        );
      } finally {
        await inspector.query('ROLLBACK');
      }
      await assertGroupReconciled(inspector);
      await inspector.query('DELETE FROM hash_talk.groups WHERE id=$1', [
        fixture.second,
      ]);
      assert.equal(
        (
          await inspector.query(
            'SELECT group_id FROM hash_talk.group_quota_usage WHERE group_id=$1',
            [fixture.second],
          )
        ).rowCount,
        0,
      );
      assert.equal(await groupTextUsage(inspector, fixture.second), 0);
      await assertGroupReconciled(inspector);
    },
  );
});
