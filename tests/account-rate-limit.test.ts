import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
await test('explicit read budgets neither consume the six challenges nor expand limited writes', () => {
  const limit = new AccountRateLimit({ reads: 240 });
  try {
    for (let i = 0; i < 240; i++) limit.admit('synthetic', false, true);
    assert.throws(() => limit.admit('synthetic', false, true), { status: 429 });
    for (let i = 0; i < 6; i++) limit.admit('synthetic', true);
    for (let i = 6; i < 60; i++) limit.admit('synthetic', false);
    assert.throws(() => limit.admit('synthetic', false), { status: 429 });
    assert.doesNotThrow(() => limit.admit('another-synthetic', false, true));
    for (let i = 0; i < 6; i++) limit.admit('challenge-synthetic', true);
    assert.throws(() => limit.admit('challenge-synthetic', true), {
      status: 429,
    });
  } finally {
    limit.close();
  }
});

await test("normal reads and writes have no per-minute limit and cannot exhaust other users' challenges or entries", () => {
  const limit = new AccountRateLimit({ requests: null });
  try {
    for (let i = 0; i < 1000; i++) {
      limit.admit('shared-transport', false);
      limit.admit('shared-transport', false, true);
    }
    // Ordinary reads/writes must not fill buckets for protected operations.
    for (let i = 0; i < 300; i++) {
      limit.admit(`transport-${i}`, false);
      limit.admit(`transport-${i}`, false, true);
    }
    for (let i = 0; i < 6; i++) limit.admit('shared-transport', true);
    assert.throws(() => limit.admit('shared-transport', true), { status: 429 });
    assert.doesNotThrow(() => limit.admit('shared-transport', false));
    assert.doesNotThrow(() => limit.admit('shared-transport', false, true));
    assert.doesNotThrow(() => limit.admit('another-user', true));
  } finally {
    limit.close();
  }
});

await test('protected clients do not share a fixed 256-client admission ceiling', () => {
  const limit = new AccountRateLimit({ requests: null });
  try {
    for (let i = 0; i < 300; i++) limit.admit(`synthetic-client-${i}`, true);
    for (let i = 1; i < 6; i++) limit.admit('synthetic-client-0', true);
    assert.throws(() => limit.admit('synthetic-client-0', true), {
      status: 429,
    });
    assert.doesNotThrow(() => limit.admit('synthetic-client-299', true));
  } finally {
    limit.close();
  }
});

await test('protected windows expire independently on a monotonic clock', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const limit = new AccountRateLimit({ requests: null });
  try {
    for (let i = 0; i < 6; i++) limit.admit('first', true);
    now = 1000;
    for (let i = 0; i < 6; i++) limit.admit('second', true);
    now = 60_000;
    assert.doesNotThrow(() => limit.admit('first', true));
    assert.throws(() => limit.admit('second', true), { status: 429 });
    now = 61_000;
    assert.doesNotThrow(() => limit.admit('second', true));
  } finally {
    limit.close();
  }
});

await test('a client window expires even when a burst leaves an expired cleanup backlog', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const limit = new AccountRateLimit({ requests: null });
  try {
    for (let i = 0; i < 1024; i++) limit.admit(`synthetic-client-${i}`, true);
    for (let i = 1; i < 6; i++) limit.admit('synthetic-client-1023', true);
    now = 60_001;
    assert.doesNotThrow(() => limit.admit('synthetic-client-1023', true));
  } finally {
    limit.close();
  }
});
