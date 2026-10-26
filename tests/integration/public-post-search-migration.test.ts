import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';
import { groupQuotaPredecessor } from '../fixtures/group-quota-database.ts';
import { historicalMigrations } from '../fixtures/historical-migrations.ts';

await test('public search deployment accepts PostgreSQL-normalized index expressions and rejects an unrelated index', async (t) => {
  const url = new URL(process.env['HASH_TALK_DATABASE_URL'] ?? '');
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('A dedicated local test database is required.');
  const administrator = new pg.Client({ connectionString: url.href });
  await administrator.connect();
  const name =
    'hash_talk_test_search_upgrade_' + crypto.randomUUID().replaceAll('-', '');
  await administrator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  url.pathname = '/' + name;
  const client = new pg.Client({
    connectionString: url.href,
    connectionTimeoutMillis: 3000,
    statement_timeout: 12000,
  });
  await client.connect();
  t.after(async () => {
    try {
      await client.query('ROLLBACK');
    } finally {
      await client.end();
      await administrator.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await administrator.end();
    }
  });
  await groupQuotaPredecessor(client, 93);
  await historicalMigrations(client, [
    '094-single-use-contact-invitations.sql',
  ]);
  const { stdout } = await promisify(execFile)(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'infra/staging');import deploy_post_search as m;print(json.dumps([m.SCHEMA_CHECK,m.COUNTER_CHECKS,m.GLOBAL_CHECK]))",
    ],
    { timeout: 5000, maxBuffer: 16384 },
  );
  const checks = JSON.parse(stdout) as string[];
  // Reapply the index in a transaction so the exact deploy predicates run on
  // PostgreSQL's expression output, with rollback preserving the test schema.
  await client.query('BEGIN');
  await client.query(
    await readFile(
      'src/server/database/migrations/095-public-post-search.sql',
      'utf8',
    ),
  );
  for (const sql of checks) {
    const result = await client.query(sql);
    if (sql.startsWith('SELECT'))
      assert.deepEqual(Object.values(result.rows[0] as object), [true]);
  }
  await client.query('DROP INDEX hash_talk.community_post_search');
  await client.query(
    'CREATE INDEX community_post_search ON hash_talk.community_posts(title)',
  );
  const wrongIndex = await client.query(checks[0]!);
  assert.deepEqual(Object.values(wrongIndex.rows[0] as object), [false]);
});
