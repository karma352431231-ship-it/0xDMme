import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';
import { groupQuotaPredecessor } from '../fixtures/group-quota-database.ts';

await test('093 to 094 bounds legacy invitations without changing approved contacts or personal quota', async (t) => {
  const url = new URL(process.env['HASH_TALK_DATABASE_URL'] ?? '');
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/hash_talk_test')
  )
    throw new Error('A dedicated local test database is required.');
  const administrator = new pg.Client({ connectionString: url.href });
  await administrator.connect();
  const name =
    'hash_talk_test_contact_invitation_upgrade_' +
    randomUUID().replaceAll('-', '');
  await administrator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  url.pathname = '/' + name;
  const client = new pg.Client({ connectionString: url.href });
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
  // Exercise only 093→094; later metadata sources have their own accounting.
  await client.query('BEGIN');
  const [owner, peer] = [randomUUID(), randomUUID()].sort(),
    hash = 'a'.repeat(64);
  for (const id of [owner!, peer!])
    await client.query(
      'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
      [id, '0x' + id.replaceAll('-', '').padEnd(40, '0')],
    );
  await client.query(
    "INSERT INTO hash_talk.contact_controls(account_id,revision,mode,invite_hash) VALUES($1,7,'invite',$2)",
    [owner, hash],
  );
  await client.query(
    "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES($1,$2,$1,'approved')",
    [owner, peer],
  );
  const before = await accounting(client, owner!);
  const migration = await readFile(
    'src/server/database/migrations/094-single-use-contact-invitations.sql',
    'utf8',
  );
  await client.query(migration);
  const grants = await client.query<{
    token_hash: string;
    full_day: boolean;
    used_by: string | null;
    consumed_at: string | null;
  }>(
    "SELECT token_hash,expires_at=now()+interval '24 hours' AS full_day,used_by,consumed_at FROM hash_talk.contact_invitations WHERE account_id=$1",
    [owner],
  );
  assert.deepEqual(grants.rows, [
    { token_hash: hash, full_day: true, used_by: null, consumed_at: null },
  ]);
  const controls = await client.query(
    'SELECT revision,mode,invite_hash FROM hash_talk.contact_controls WHERE account_id=$1',
    [owner],
  );
  assert.deepEqual(controls.rows, [
    { revision: 8, mode: 'invite', invite_hash: null },
  ]);
  const relation = await client.query(
    'SELECT requester,state FROM hash_talk.contact_relations WHERE lo=$1 AND hi=$2',
    [owner, peer],
  );
  assert.deepEqual(relation.rows, [{ requester: owner, state: 'approved' }]);
  const after = await accounting(client, owner!);
  assert.equal(BigInt(after.global), BigInt(before.global) + 256n);
  assert.equal(after.personal, before.personal);
  // The real migrator records this same transaction timestamp for 094.
  await client.query(
    'INSERT INTO hash_talk.schema_migrations(version,checksum,applied_at) VALUES(94,$1,now())',
    [createHash('sha256').update(migration).digest('hex')],
  );
  const { stdout } = await promisify(execFile)('python3', [
    '-c',
    "import sys,json;sys.path.insert(0,'infra/staging');import deploy_contact_invitations as m;print(json.dumps([m.SCHEMA_CHECK,m.COUNTER_CHECKS,m.GLOBAL_CHECK]))",
  ]);
  const checks = JSON.parse(stdout) as string[];
  for (const sql of checks) {
    const checked = await client.query(sql);
    if (sql.startsWith('SELECT'))
      assert.deepEqual(Object.values(checked.rows[0] as object), [true]);
  }
});

async function accounting(client: pg.Client, owner: string) {
  const result = await client.query<{ global: string; personal: string }>(
    'SELECT (SELECT used_bytes FROM hash_talk.content_usage) AS global,coalesce((SELECT used_bytes FROM hash_talk.account_quota_usage WHERE account_id=$1),0)::text AS personal',
    [owner],
  );
  return result.rows[0]!;
}
