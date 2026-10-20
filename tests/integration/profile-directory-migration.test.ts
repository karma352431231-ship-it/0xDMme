import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

async function migrate(
  client: pg.Client,
  first: number,
  last: number,
): Promise<void> {
  for (const name of (await readdir('src/server/database/migrations')).sort()) {
    const version = Number(name.slice(0, 3));
    if (version < first || version > last) continue;
    const sql = await readFile(
      'src/server/database/migrations/' + name,
      'utf8',
    );
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
        [version, createHash('sha256').update(sql).digest('hex')],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
async function snapshot(client: pg.Client) {
  const rows = new Map<string, unknown>();
  for (const table of [
    'public_profiles',
    'public_profile_follows',
    'community_ranking_entries',
    'profile_ranking_entries',
  ]) {
    const dropped = table === 'profile_ranking_entries' ? ['followers'] : [];
    const result = await client.query<{ data: unknown }>(
      `SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') AS data FROM (SELECT to_jsonb(t)-$1::text[] AS value FROM hash_talk.${table} t) source`,
      [dropped],
    );
    rows.set(table, result.rows[0]!.data);
  }
  return rows;
}
async function accounting(client: pg.Client) {
  return (
    await client.query<{ cache: string; global: string }>(
      'SELECT (SELECT used_bytes FROM hash_talk.community_ranking_cache_usage) AS cache,(SELECT used_bytes FROM hash_talk.content_usage) AS global',
    )
  ).rows;
}
await test('092 to 093 preserves source data and accounting while rebuilding only derived directory snapshots', async (t) => {
  const url = new URL(process.env['HASH_TALK_DATABASE_URL'] ?? '');
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('A dedicated local test database is required.');
  const name =
    'hash_talk_test_profile_directory_' + randomUUID().replaceAll('-', '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  await admin.query('CREATE DATABASE "' + name + '"');
  const target = new URL(url);
  target.pathname = '/' + name;
  const client = new pg.Client({ connectionString: target.href });
  t.after(async () => {
    await client.end();
    await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    await admin.end();
  });
  await client.connect();
  await client.query(
    'CREATE SCHEMA hash_talk;CREATE TABLE hash_talk.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await migrate(client, 1, 92);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) {
    const account = randomUUID();
    await client.query(
      'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
      [account, '0x' + randomUUID().replaceAll('-', '').padEnd(40, '0')],
    );
    await client.query(
      'INSERT INTO hash_talk.public_profiles(id,account_id,handle,created_at) VALUES($1,$2,$3,$4)',
      [
        id,
        account,
        'preserved_' + index,
        index === 0 ? null : '2026-10-01T00:00:00Z',
      ],
    );
  }
  await client.query(
    'INSERT INTO hash_talk.public_profile_follows(follower,target,following,revision) VALUES($1,$2,true,1),($1,$3,false,2)',
    ids,
  );
  const generation = randomUUID();
  await client.query(
    "INSERT INTO hash_talk.community_ranking_generations(id,cutoff,expires_at,version,metrics_version,published) VALUES($1,clock_timestamp(),clock_timestamp()+interval '5 minutes',2,4,true)",
    [generation],
  );
  await client.query(
    'INSERT INTO hash_talk.profile_ranking_entries(generation,profile_id,period,score,metrics) VALUES($1,$2,\'day\',1,\'{"views":1,"shares":0,"comments":0,"upvotes":0,"previousScore":0}\')',
    [generation, ids[0]],
  );
  const before = await snapshot(client);
  const history = (
    await client.query(
      'SELECT version,checksum FROM hash_talk.schema_migrations ORDER BY version',
    )
  ).rows;
  const usage = await accounting(client);
  await migrate(client, 93, 93);
  assert.deepEqual(await snapshot(client), before);
  assert.deepEqual(
    (
      await client.query(
        'SELECT version,checksum FROM hash_talk.schema_migrations WHERE version<=92 ORDER BY version',
      )
    ).rows,
    history,
  );
  assert.deepEqual(await accounting(client), usage);
  assert.equal(
    (
      await client.query<{ expired: boolean }>(
        'SELECT expires_at<=clock_timestamp() AS expired FROM hash_talk.community_ranking_generations WHERE id=$1',
        [generation],
      )
    ).rows[0]!.expired,
    true,
  );
  await client.query(
    'DELETE FROM hash_talk.public_profile_follows WHERE follower=$1 AND target=$2',
    [ids[0], ids[2]],
  );
  assert.equal(
    (await client.query('SELECT 1 FROM hash_talk.profile_ranking_state'))
      .rowCount,
    0,
  );
  await client.query(
    'UPDATE hash_talk.public_profile_follows SET following=false,revision=revision+1 WHERE follower=$1 AND target=$2',
    [ids[0], ids[1]],
  );
  assert.deepEqual(
    (
      await client.query(
        'SELECT profile_id,revision::integer FROM hash_talk.profile_ranking_state',
      )
    ).rows,
    [{ profile_id: ids[1], revision: 1 }],
  );
  await client.query(
    'UPDATE hash_talk.public_profile_follows SET following=following WHERE follower=$1 AND target=$2',
    [ids[0], ids[1]],
  );
  assert.equal(
    (
      await client.query<{ revision: number }>(
        'SELECT revision::integer FROM hash_talk.profile_ranking_state',
      )
    ).rows[0]!.revision,
    1,
  );
});
