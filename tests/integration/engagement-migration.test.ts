import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { groupQuotaPredecessor } from '../fixtures/group-quota-database.ts';
import { historicalMigrations } from '../fixtures/historical-migrations.ts';

await test('099 to 102 collection preserves existing tags, source rows and history with exact baseline accounting', async (t) => {
  const url = new URL(process.env['HASH_TALK_DATABASE_URL'] ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    !url.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('A dedicated local test database is required.');
  const administrator = new pg.Client({ connectionString: url.href });
  await administrator.connect();
  const name =
    'hash_talk_test_metric_upgrade_' + crypto.randomUUID().replaceAll('-', '');
  await administrator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  url.pathname = '/' + name;
  const client = new pg.Client({
    connectionString: url.href,
    statement_timeout: 12000,
  });
  const db = new Database(url.href);
  t.after(async () => {
    try {
      await client.query('ROLLBACK');
      await client.end();
      await db.close();
      await administrator.query(`DROP DATABASE "${name}"`);
    } finally {
      await administrator.end();
    }
  });
  await client.connect();
  await groupQuotaPredecessor(client, 93);
  await historicalMigrations(client, [
    '094-single-use-contact-invitations.sql',
    '095-public-post-search.sql',
    '096-message-sync-fences.sql',
    '097-community-games-topic.sql',
    '098-group-message-fences.sql',
    '099-post-share-counts.sql',
  ]);
  const account = crypto.randomUUID(),
    profile = crypto.randomUUID(),
    community = crypto.randomUUID();
  await client.query(
    'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
    [account, '0x' + account.replaceAll('-', '').padEnd(40, '0')],
  );
  await client.query(
    "INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,'upgrade_owner')",
    [profile, account],
  );
  await client.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,'Synthetic upgrade','','')",
    [community, profile],
  );
  await client.query(
    "INSERT INTO hash_talk.community_tags(id,community_id,label) VALUES(gen_random_uuid(),$1,'Custom category')",
    [community],
  );
  await client.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,deleted) VALUES(gen_random_uuid(),$1,$2,'Existing','Preserved source',false),(gen_random_uuid(),$1,$2,'','',true)",
    [community, profile],
  );
  const { stdout } = await promisify(execFile)(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'infra/staging');import deploy_engagement as m;print(json.dumps({'tables':m.TABLES,'checks':[m.SCHEMA_CHECK,m.COUNTER_CHECKS,m.GLOBAL_CHECK],'charge':m.METRIC_CHARGE}))",
    ],
    { timeout: 5000, maxBuffer: 20000 },
  );
  const contract = JSON.parse(stdout) as {
    tables: string[];
    checks: string[];
    charge: string;
  };
  const snapshot = async () => {
    const rows: { count: string; digest: string }[] = [];
    for (const table of contract.tables) {
      assert.match(table, /^[a-z_]+$/u);
      rows.push(
        (
          await client.query<{ count: string; digest: string }>(
            `SELECT count(*)::text AS count,md5(coalesce(string_agg(value::text,'' ORDER BY value::text),'')) AS digest FROM (SELECT to_jsonb(t)-$1::text[] AS value FROM hash_talk.${table} t) s`,
            [table === 'content_usage_legacy' ? ['used_bytes'] : []],
          )
        ).rows[0]!,
      );
    }
    return rows;
  };
  const before = await snapshot();
  const versions = (
    await client.query(
      'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
    )
  ).rows;
  const ledger = async () =>
    BigInt(
      (
        await client.query<{ used_bytes: string }>(
          'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton',
        )
      ).rows[0]!.used_bytes,
    );
  const bytes = await ledger();
  await db.migrate();
  assert.deepEqual(await snapshot(), before);
  const after = (
    await client.query(
      'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
    )
  ).rows;
  assert.equal(after.length, 102);
  assert.deepEqual(after.slice(0, 99), versions);
  const charge = await client.query<{ bytes: string }>(contract.charge);
  assert.equal(await ledger(), bytes + BigInt(charge.rows[0]!.bytes));
  for (const sql of contract.checks) {
    const result = await client.query<Record<string, unknown>>(sql);
    const last = Array.isArray(result)
      ? (result as pg.QueryResult<Record<string, unknown>>[]).at(-1)!
      : result;
    assert.deepEqual(Object.values(last.rows[0]!), [true]);
  }
  await client.query('BEGIN');
  await client.query(
    "UPDATE hash_talk.engagement_counts SET value=value+1 WHERE metric='accounts_existing' AND scope='project'",
  );
  assert.deepEqual(
    Object.values((await client.query(contract.checks[0]!)).rows[0] as object),
    [false],
  );
  await client.query('ROLLBACK');
});
