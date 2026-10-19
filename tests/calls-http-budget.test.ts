import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
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
