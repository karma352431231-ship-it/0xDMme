import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { WorkSignals } from '../../src/server/database/work-signals.ts';
import { DatabaseChanges } from '../../src/server/database/changes.ts';
import { WorkConsumers } from '../../src/server/work-scheduler/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import type { CommittedChange } from '../../src/server/database/index.ts';
import { deferred } from '../fixtures/deferred.ts';

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(
    check(),
    'Evento confirmado deve acordar o consumidor sem fallback.',
  );
}

await test('coordinated worker transactions relay bounded categories only after commit and discard rollback hints', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('A dedicated test database is required.');
  const worker = new Database(config.databaseUrl, 3_000_000_000, [], 'worker');
  const listener = new pg.Client({ connectionString: config.databaseUrl });
  t.after(async () => {
    await listener.end();
    await worker.close();
  });
  await worker.migrate();
  await listener.connect();
  await listener.query('LISTEN hash_talk_content_changes');
  const remote: Pick<
      CommittedChange,
      'accounts' | 'categories' | 'authorization' | 'removed'
    >[] = [],
    local: CommittedChange[] = [];
  listener.on('notification', (notification) => {
    if (notification.payload)
      remote.push(
        JSON.parse(notification.payload) as Pick<
          CommittedChange,
          'accounts' | 'categories' | 'authorization' | 'removed'
        >,
      );
  });
  worker.changes.subscribe({
    notify: (event) => local.push(event),
    failed: () => assert.fail('Unexpected change publication failure'),
  });
  const rolledBack = crypto.randomUUID();
  await assert.rejects(
    worker.contacts.withMaintenance((client) => {
      worker.contacts.changed(client, [rolledBack], { category: 'contacts' });
      throw new Error('Synthetic rolled-back transaction');
    }),
    /Synthetic rolled-back transaction/u,
  );
  const accounts = Array.from({ length: 130 }, () => crypto.randomUUID());
  const held = deferred<void>(),
    release = deferred<void>();
  const committing = worker.contacts.withMaintenance(async (client) => {
    worker.contacts.changed(client, accounts, { category: 'private-messages' });
    worker.contacts.changed(client, [accounts[0]!], {
      category: 'private-receipts',
    });
    worker.contacts.removed(client, [accounts[0]!], 'private-messages');
    held.resolve();
    await release.promise;
  });
  try {
    await held.promise;
    assert.equal(local.length, 0);
    assert.equal(remote.length, 0);
  } finally {
    release.resolve();
    await committing;
  }
  await until(() => remote.length === 4);
  assert.equal(local.length, 2);
  assert.ok(remote.every((event) => event.accounts.length <= 64));
  assert.deepEqual(
    remote.flatMap((event) => event.accounts).sort(),
    [...accounts].sort(),
  );
  assert.ok(!remote.some((event) => event.accounts.includes(rolledBack)));
  assert.ok(!local.some((event) => event.accounts.includes(rolledBack)));
  const removed = remote.find((event) => event.removed);
  assert.deepEqual(removed?.accounts, [accounts[0]]);
  assert.deepEqual(removed?.categories, [
    'private-messages',
    'private-receipts',
  ]);
  for (const event of remote)
    assert.deepEqual(Object.keys(event).sort(), [
      'accounts',
      'authorization',
      'categories',
      'removed',
    ]);
});
await test('workers: after-commit notifications, private bridge and exclusive connection ownership', async (t) => {
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
  const categories: unknown[] = [];
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
      categories.push(event.categories);
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
  assert.deepEqual(categories, [null]);
  await sql.query('BEGIN');
  await sql.query("SELECT pg_notify('hash_talk_content_changes',$1)", [
    JSON.stringify({
      accounts: [account],
      removed: true,
      authorization: false,
      categories: ['private-receipts'],
    }),
  ]);
  await sql.query('COMMIT');
  await until(() => changed === 2);
  assert.deepEqual(categories[1], ['private-receipts']);
  await sql.query("SELECT pg_notify('hash_talk_content_changes',$1)", [
    JSON.stringify({
      accounts: [account],
      removed: true,
      authorization: false,
      categories: ['future-category'],
    }),
  ]);
  await until(() => changed === 3);
  assert.equal(categories[2], null);
  const duplicate = new WorkSignals(config.databaseUrl);
  duplicate.holdWorker('content', () => {});
  try {
    await assert.rejects(duplicate.start(), /already active/);
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
