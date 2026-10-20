import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function applyMigrations(
  client: pg.Client,
  range: { first: number; last: number },
): Promise<void> {
  const directory = resolve('src/server/database/migrations');
  const paths = (await readdir(directory))
    .filter((path) => /^\d{3}.*\.sql$/u.test(path))
    .sort();
  for (const path of paths) {
    const version = Number(path.slice(0, 3));
    if (version < range.first || version > range.last) continue;
    const sql = await readFile(resolve(directory, path), 'utf8');
    await client.query(sql);
    await client.query(
      'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
      [version, createHash('sha256').update(sql).digest('hex')],
    );
  }
}
async function seedOwner(client: pg.Client, index: number) {
  const account = randomUUID(),
    profile = randomUUID(),
    community = randomUUID();
  await client.query(
    'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
    [account, '0x' + randomBytes(20).toString('hex')],
  );
  await client.query(
    'INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,$3)',
    [profile, account, 'migration_' + index],
  );
  await client.query(
    'INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,$3,$4,$5)',
    [community, profile, 'Comunidade preservada', 'Descrição', 'Regras'],
  );
  return { profile, community };
}
await test('061→062 preserves data, rebuilds diversity and rejects corrupt counters or ledger', async (t) => {
  const url = new URL(process.env['HASH_TALK_DATABASE_URL'] ?? '');
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('Banco local de testes obrigatório.');
  const name =
    'hash_talk_test_discussion_migration_' + randomUUID().replaceAll('-', '');
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  await admin.query('CREATE DATABASE "' + name + '"');
  const temporary = await mkdtemp(
    resolve(tmpdir(), '0xdmme-discussion-migration-'),
  );
  const selected = new URL(url);
  selected.pathname = '/' + name;
  const client = new pg.Client({ connectionString: selected.href });
  t.after(async () => {
    await client.end();
    await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    await admin.end();
    await rm(temporary, { recursive: true, force: true });
  });
  await client.connect();
  await client.query(
    'CREATE SCHEMA hash_talk; CREATE TABLE hash_talk.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await applyMigrations(client, { first: 1, last: 61 });
  const owner = await seedOwner(client, 1),
    other = await seedOwner(client, 2);
  const root = randomUUID(),
    comment = randomUUID(),
    child = randomUUID();
  await client.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text) VALUES($1,$2,$3,'Preservado','Texto público')",
    [root, owner.community, owner.profile],
  );
  await client.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,parent_id,root_id,title,text) VALUES($1,$2,$3,$4,$4,'','Resposta')",
    [comment, owner.community, other.profile, root],
  );
  await client.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,parent_id,root_id,title,text) VALUES($1,$2,$3,$4,$5,'','Outro participante')",
    [child, owner.community, owner.profile, comment, root],
  );
  const review = (phase: string) =>
    execute(
      'python3',
      [
        'tests/fixtures/discussion-migration-review.py',
        process.cwd(),
        phase,
        resolve(temporary, 'before.json'),
      ],
      {
        env: {
          ...process.env,
          HASH_TALK_DATABASE_URL: selected.href,
          SOCIAL_TEST_NODE: process.execPath,
        },
        timeout: 60000,
      },
    );
  await review('before');
  await client.query('BEGIN');
  await applyMigrations(client, { first: 62, last: 62 });
  await client.query('COMMIT');
  await review('after');
  // Compare with an independently captured clean state before each corruption.
  for (const sql of [
    "UPDATE hash_talk.communities SET description='Alteração indevida'",
    'UPDATE hash_talk.content_usage SET used_bytes=used_bytes+1',
    'UPDATE hash_talk.community_posts SET discussion_activity=discussion_activity+1',
    'ALTER TABLE hash_talk.community_posts DISABLE TRIGGER discussion_post_metrics',
  ]) {
    const checkpoint = await client.query<{ revision: string }>(
      'SELECT revision::text FROM hash_talk.community_ranking_state WHERE community_id=$1',
      [owner.community],
    );
    await client.query(sql);
    await assert.rejects(review('after'));
    if (sql.includes('description')) {
      await client.query(
        "UPDATE hash_talk.communities SET description='Descrição'",
      );
      await client.query(
        'UPDATE hash_talk.community_ranking_state SET revision=$2 WHERE community_id=$1',
        [owner.community, checkpoint.rows[0]!.revision],
      );
      // Both communities were updated by this synthetic mutation.
      await client.query(
        'UPDATE hash_talk.community_ranking_state SET revision=revision-2 WHERE community_id=$1',
        [other.community],
      );
    } else if (sql.includes('used_bytes'))
      await client.query(
        'UPDATE hash_talk.content_usage SET used_bytes=used_bytes-1',
      );
    else if (sql.includes('discussion_activity'))
      await client.query(
        'UPDATE hash_talk.community_posts SET discussion_activity=discussion_activity-1',
      );
    else
      await client.query(
        'ALTER TABLE hash_talk.community_posts ENABLE TRIGGER discussion_post_metrics',
      );
    await review('after');
  }
});
