import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { setTimeout } from 'node:timers/promises';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

await test('event-time database evidence observes real lock pressure and survives unavailable queries', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const database = new Database(config.databaseUrl);
  let closed = false;
  const owner = new pg.Client({ connectionString: config.databaseUrl });
  const waiter = new pg.Client({ connectionString: config.databaseUrl });
  await owner.connect();
  await waiter.connect();
  t.after(async () => {
    await owner.end();
    await waiter.end();
    if (!closed) await database.close();
  });
  const key = Math.floor(Math.random() * 2_000_000_000);
  await owner.query('SELECT pg_advisory_lock($1)', [key]);
  const waiting = waiter.query('SELECT pg_advisory_lock($1)', [key]);
  let snapshot = await database.operationalSnapshot();
  try {
    for (let i = 0; i < 100 && !snapshot.lockWaiters; i++) {
      await setTimeout(10);
      snapshot = await database.operationalSnapshot();
    }
    assert.equal(snapshot.queryAvailable, true);
    assert.ok((snapshot.lockWaiters ?? 0) >= 1);
    assert.ok(snapshot.poolConnections >= 0);
    assert.ok((await database.operationalSnapshot()).poolConnections >= 1);
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      /SELECT|advisory|127\.0\.0\.1|password/u,
    );
  } finally {
    await owner.query('SELECT pg_advisory_unlock($1)', [key]);
  }
  await waiting;
  await waiter.query('SELECT pg_advisory_unlock($1)', [key]);
  assert.equal((await database.operationalSnapshot()).lockWaiters, 0);
  await database.close();
  closed = true;
  assert.equal((await database.operationalSnapshot()).queryAvailable, false);
});
