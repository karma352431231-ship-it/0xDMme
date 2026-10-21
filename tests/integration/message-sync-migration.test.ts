import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { compileFunction } from 'node:vm';
import { test } from 'node:test';
import type pg from 'pg';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  admissionPacket,
  messagePair,
} from '../fixtures/message-allocation-database.ts';

async function originalGuard(
  client: pg.Client,
  input: { migration: string; name: string },
) {
  const source = await readFile(
    'src/server/database/migrations/' + input.migration,
    'utf8',
  );
  const begin = source.indexOf('CREATE FUNCTION hash_talk.' + input.name + '(');
  assert.ok(begin >= 0);
  const end = source.indexOf('\n$$;', begin);
  assert.ok(end > begin);
  await client.query(
    source
      .slice(begin, end + 4)
      .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'),
  );
}

async function fingerprints(client: pg.Client, tables: string[]) {
  const results: Record<string, unknown> = {};
  for (const name of tables) {
    assert.match(name, /^[a-z][a-z0-9_]*$/u);
    const omitted =
      name === 'message_heads'
        ? ['invalidation_revision']
        : name === 'message_changes'
          ? ['change_kind']
          : [];
    results[name] = (
      await client.query(
        `SELECT count(*)::text AS count,md5(coalesce(string_agg(value::text,'' ORDER BY value::text),'')) AS hash
       FROM (SELECT to_jsonb(t)-$1::text[] AS value FROM hash_talk.${name} t) rows`,
        [omitted],
      )
    ).rows;
  }
  return results;
}

await test('populated 095 to 096 preserves messages, deletion metadata and accounting while enforcing migration guards', async (t) => {
  const c = await messageReceiptFixture(t);
  const pair = await messagePair(c);
  for (let n = 0; n < 8; n++)
    await c.db.messages.admit(
      pair.sender,
      admissionPacket(pair),
      'a'.repeat(64),
    );
  const { stdout } = await promisify(execFile)(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'infra/staging');import deploy_message_sync as m;import deploy_snapshot_batches as b;print(json.dumps({'checks':[m.ABSENT,m.SCHEMA_CHECK,m.COUNTER_CHECKS,m.GLOBAL_CHECK],'tables':m.TABLES,'script':b.SCRIPT,'keys':b.KEYS}))",
    ],
    { timeout: 5000, maxBuffer: 65536 },
  );
  const contract = JSON.parse(stdout) as {
    checks: string[];
    tables: string[];
    script: string;
    keys: Record<string, [string, string][]>;
  };
  const client = c.inspector;
  await client.query('BEGIN');
  // Restore the exact predecessor definitions inside a transaction. Existing
  // synthetic accepted packets remain populated, and fixture cleanup rolls back.
  await originalGuard(client, {
    migration: '083-message-admission-allocations.sql',
    name: 'consume_message_admission',
  });
  await originalGuard(client, {
    migration: '085-message-removal-allocations.sql',
    name: 'consume_message_removal_metadata',
  });
  await client.query(
    'ALTER TABLE hash_talk.message_heads DROP COLUMN invalidation_revision',
  );
  await client.query(
    'ALTER TABLE hash_talk.message_changes DROP COLUMN change_kind',
  );
  await client.query(
    'DELETE FROM hash_talk.schema_migrations WHERE version=96',
  );
  assert.deepEqual(
    Object.values((await client.query(contract.checks[0]!)).rows[0] as object),
    [true],
  );
  const before = await fingerprints(client, contract.tables);
  const migration = await readFile(
    'src/server/database/migrations/096-message-sync-fences.sql',
    'utf8',
  );
  await client.query('SAVEPOINT cache_contract');
  await client.query(
    'ALTER SEQUENCE hash_talk.message_packets_sequence_seq CACHE 2',
  );
  await assert.rejects(client.query(migration), /requires a CACHE 1 identity/u);
  await client.query('ROLLBACK TO SAVEPOINT cache_contract');
  await client.query(migration);
  assert.deepEqual(await fingerprints(client, contract.tables), before);
  for (const sql of contract.checks.slice(1)) {
    const result = await client.query(sql);
    if (sql.startsWith('SELECT'))
      assert.deepEqual(Object.values(result.rows[0] as object), [true]);
  }
  // Execute the actual bounded journal query with the new-column omission;
  // only row digests, lengths and keys leave PostgreSQL.
  const run = compileFunction(
    contract.script +
      'return fingerprintTable(client,"message_changes",keys,{rows:100000,bytes:128*1024*1024,omit:{message_changes:["change_kind"]}});',
    ['createHash', 'client', 'keys'],
  ) as (
    hash: typeof import('node:crypto').createHash,
    connection: pg.Client,
    keys: [string, string][],
  ) => Promise<{ count: number }>;
  const { createHash } = await import('node:crypto');
  assert.equal(
    (await run(createHash, client, contract.keys['message_changes']!)).count,
    16,
  );
  await client.query('SAVEPOINT wrong_default');
  await client.query(
    "ALTER TABLE hash_talk.message_changes ALTER COLUMN change_kind SET DEFAULT 'append'",
  );
  assert.deepEqual(
    Object.values((await client.query(contract.checks[1]!)).rows[0] as object),
    [false],
  );
  await client.query('ROLLBACK TO SAVEPOINT wrong_default');
  await originalGuard(client, {
    migration: '083-message-admission-allocations.sql',
    name: 'consume_message_admission',
  });
  assert.deepEqual(
    Object.values((await client.query(contract.checks[1]!)).rows[0] as object),
    [false],
  );
});
