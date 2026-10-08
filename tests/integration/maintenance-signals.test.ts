import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { WorkSignals } from '../../src/server/database/work-signals.ts';
import { DatabaseChanges } from '../../src/server/database/changes.ts';
import { WorkConsumers } from '../../src/server/work-scheduler/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(
    check(),
    'Evento confirmado deve acordar o consumidor sem fallback.',
  );
}
await test('workers: avisos após commit, ponte privada e propriedade exclusiva da conexão', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo necessário.');
  const db = new Database(config.databaseUrl);
  await db.migrate();
  const sql = new pg.Client({ connectionString: config.databaseUrl });
  await sql.connect();
  const changes = new DatabaseChanges();
  const signals = new WorkSignals(config.databaseUrl, changes);
  let lost = false,
    work = 0,
    changed = 0;
  signals.holdWorker('content', () => {
    lost = true;
  });
  const consumers = new WorkConsumers(
    [
      {
        topic: 'backups',
        work: () => {
          work++;
          return Promise.resolve();
        },
        next: () => Promise.resolve(null),
      },
    ],
    signals,
    { fallbackMs: 0 },
  );
  const account = crypto.randomUUID();
  changes.observe({
    notify: (event) => {
      assert.deepEqual(event.accounts, [account]);
      assert.ok(event.removed);
      changed++;
    },
    failed: () => {},
  });
  t.after(async () => {
    await consumers.close();
    await signals.close();
    await sql.end();
    await db.close();
  });
  await signals.start();
  consumers.start();
  await until(() => work > 0);
  const initial = work;
  await sql.query('BEGIN');
  await sql.query("SELECT pg_notify('hash_talk_backups','')");
  await sql.query("SELECT pg_notify('hash_talk_content_changes',$1)", [
    JSON.stringify({
      accounts: [account],
      removed: true,
      authorization: false,
    }),
  ]);
  await sql.query('ROLLBACK');
  await delay(70);
  assert.equal(work, initial);
  assert.equal(changed, 0);
  await sql.query('BEGIN');
  await sql.query("SELECT pg_notify('hash_talk_backups','')");
  await sql.query("SELECT pg_notify('hash_talk_content_changes',$1)", [
    JSON.stringify({
      accounts: [account],
      removed: true,
      authorization: false,
    }),
  ]);
  await sql.query('COMMIT');
  await until(() => work > initial && changed === 1);
  const duplicate = new WorkSignals(config.databaseUrl);
  duplicate.holdWorker('content', () => {});
  try {
    await assert.rejects(duplicate.start(), /já ativo/);
  } finally {
    await duplicate.close();
  }
  const lease = await sql.query<{ pid: number }>(
    "SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=(hashtext('hash-talk:background:content')::bigint & 4294967295)::oid AND granted LIMIT 2",
  );
  assert.equal(lease.rows.length, 1);
  await sql.query('SELECT pg_terminate_backend($1)', [lease.rows[0]!.pid]);
  await until(() => lost);
  await signals.close();
  const replacement = new WorkSignals(config.databaseUrl);
  replacement.holdWorker('content', () => {});
  try {
    await replacement.start();
  } finally {
    await replacement.close();
  }
});
