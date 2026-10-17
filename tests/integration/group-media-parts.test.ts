import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  groupQuotaPredecessor,
  seedGroupQuota,
  assertGroupReconciled,
} from '../fixtures/group-quota-database.ts';

await test('forward upgrade preserves twelve-part progress and admits all thirty-nine parts of a 10 MB group file', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
    'hash_talk_test_group_parts_' + crypto.randomUUID().replaceAll('-', '');
  const administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    inspector = new pg.Client({ connectionString: url.href });
  t.after(async () => {
    await Promise.all([db.close(), inspector.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await inspector.connect();
  await groupQuotaPredecessor(inspector, 90);
  const fixture = await seedGroupQuota(inspector),
    retained = Array.from({ length: 12 }, (_, index) => index);
  await inspector.query(
    'UPDATE hash_talk.group_media SET received=$2 WHERE id=$1',
    [fixture.media, retained],
  );
  await assert.rejects(
    inspector.query(
      'UPDATE hash_talk.group_media SET received=$2 WHERE id=$1',
      [fixture.media, [...retained, 12]],
    ),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === '23514',
  );
  const checksums = await inspector.query(
    'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
  );
  assert.equal(checksums.rowCount, 90);
  const before = await totals(inspector);
  await db.migrate();
  assert.deepEqual(
    (
      await inspector.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=90 ORDER BY version',
      )
    ).rows,
    checksums.rows,
  );
  assert.deepEqual(await totals(inspector), before);
  assert.deepEqual(
    (
      await inspector.query<{ received: number[] }>(
        'SELECT received FROM hash_talk.group_media WHERE id=$1',
        [fixture.media],
      )
    ).rows[0]?.received,
    retained,
  );
  await inspector.query(
    'UPDATE hash_talk.group_media SET bytes=10000000,charge=10000000+text_charge WHERE id=$1',
    [fixture.media],
  );
  for (let index = 12; index < 39; index++)
    await inspector.query(
      'UPDATE hash_talk.group_media SET received=array_append(received,$2::integer) WHERE id=$1',
      [fixture.media, index],
    );
  const expected = Array.from({ length: 39 }, (_, index) => index);
  assert.deepEqual(
    (
      await inspector.query<{ received: number[] }>(
        'SELECT received FROM hash_talk.group_media WHERE id=$1',
        [fixture.media],
      )
    ).rows[0]?.received,
    expected,
  );
  await assert.rejects(
    inspector.query(
      'UPDATE hash_talk.group_media SET received=array_append(received,39) WHERE id=$1',
      [fixture.media],
    ),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === '23514',
  );
  const after = await totals(inspector),
    delta = 10_000_000n - 2048n;
  assert.equal(BigInt(after.used_bytes), BigInt(before.used_bytes) + delta);
  assert.equal(
    BigInt(after.pending_bytes),
    BigInt(before.pending_bytes) + delta,
  );
  await assertGroupReconciled(inspector);
  assert.equal(
    (
      await inspector.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.content_allocations',
      )
    ).rows[0]?.count,
    0,
  );
  await db.migrate();
  await db.verifyMigrations();
});

async function totals(client: pg.Client) {
  const result = await client.query<{
    used_bytes: string;
    pending_bytes: string;
  }>(
    'SELECT used_bytes,(SELECT sum(reserved_bytes)::text FROM hash_talk.storage_reservation_usage) AS pending_bytes FROM hash_talk.content_usage WHERE singleton',
  );
  return result.rows[0]!;
}
