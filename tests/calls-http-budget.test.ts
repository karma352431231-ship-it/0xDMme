import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
import { accountHttpFixture } from './fixtures/account-http.ts';
await test('call commands retain their session budget while synchronization and end stay available', () => {
  const chat = new AccountRateLimit({ requests: null }),
    sessions = new AccountRateLimit();
  for (let i = 0; i < 1000; i++) {
    chat.admit('synthetic-transport', false);
    chat.admit('synthetic-transport', false, true);
  }
  for (let i = 0; i < 60; i++) sessions.admit('synthetic-session-a', false);
  assert.throws(
    () => sessions.admit('synthetic-session-a', false),
    /Too many/u,
  );
  // Heartbeat and authenticated End remain available after command exhaustion.
  for (let i = 0; i < 1000; i++)
    sessions.admit('synthetic-session-a', false, true);
  sessions.admit('synthetic-session-b', false, true);
  chat.close();
  sessions.close();
});

await test('HTTP command exhaustion rejects the operation while sync/end and a different session remain available', async (t) => {
  const f = accountHttpFixture(t);
  for (let i = 0; i < 61; i++) {
    const r = f.request('calls/configure');
    await r.run();
    assert.equal(r.response.statusCode, i < 60 ? 200 : 429);
  }
  for (const operation of ['sync', 'end']) {
    const r = f.request('calls/' + operation);
    await r.run();
    assert.equal(r.response.statusCode, 200);
  }
  assert.equal(f.data.operations.filter((op) => op === 'configure').length, 60);
  f.data.session = { ...f.data.session, csrf: 'c'.repeat(64) };
  const other = f.request('calls/configure');
  await other.run();
  assert.equal(other.response.statusCode, 200);
});
