import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

async function single(client: pg.Client, sql: string): Promise<unknown> {
  return Object.values((await client.query(sql)).rows[0] as object)[0];
}
async function groupRows(client: pg.Client) {
  return (
    await client.query<{ value: string }>(
      "SELECT (to_jsonb(g)-'message_invalidation')::text AS value FROM hash_talk.groups g ORDER BY id",
    )
  ).rows.map((row) => row.value);
}

await test('097 to 098 keeps every group row, refuses a cached identity and satisfies the reviewed deploy contract', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const db = new Database(config.databaseUrl),
    client = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await client.connect();
  t.after(async () => {
    await client.query('ROLLBACK');
    await client.end();
    await db.close();
  });
  const { stdout } = await promisify(execFile)(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'infra/staging');import deploy_group_fences as m;print(json.dumps({'absent':m.ABSENT,'schema':m.SCHEMA_CHECK}))",
    ],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const contract = JSON.parse(stdout) as { absent: string; schema: string };
  const source = await readFile(
    'src/server/database/migrations/066-group-message-changes.sql',
    'utf8',
  );
  const begin = source.indexOf(
    'CREATE FUNCTION hash_talk.record_group_message_change(',
  );
  const original = source
    .slice(begin, source.indexOf('\n$$;', begin) + 4)
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
  assert.ok(begin >= 0);
  // Restore the exact 097 schema inside a transaction that always rolls back.
  await client.query('BEGIN');
  await client.query(original);
  await client.query(
    'ALTER TABLE hash_talk.groups DROP CONSTRAINT group_message_invalidation',
  );
  await client.query(
    'ALTER TABLE hash_talk.groups DROP COLUMN message_invalidation',
  );
  await client.query(
    'DELETE FROM hash_talk.schema_migrations WHERE version=98',
  );
  assert.equal(await single(client, contract.absent), true);
  const before = await groupRows(client);
  const migration = await readFile(
    'src/server/database/migrations/098-group-message-fences.sql',
    'utf8',
  );
  const sequence = String(
    await single(
      client,
      "SELECT pg_get_serial_sequence('hash_talk.group_packets','sequence')",
    ),
  );
  assert.match(sequence, /^hash_talk\.[a-z_]+$/u);
  await client.query('SAVEPOINT cache_contract');
  await client.query(`ALTER SEQUENCE ${sequence} CACHE 2`);
  await assert.rejects(client.query(migration), /require a CACHE 1 identity/u);
  await client.query('ROLLBACK TO SAVEPOINT cache_contract');
  await client.query(migration);
  assert.deepEqual(await groupRows(client), before, 'other columns unchanged');
  assert.equal(await single(client, contract.schema), true);
  assert.equal(
    await single(client, contract.absent),
    false,
    'the predecessor check refuses an applied migration',
  );
  await client.query(original);
  assert.equal(
    await single(client, contract.schema),
    false,
    'the old trigger function fails the post-migration contract',
  );
});
