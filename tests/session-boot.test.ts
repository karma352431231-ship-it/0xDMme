import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionBoot } from '../src/client/app/session-boot.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

const session = {
  accountId: 'synthetic-account',
  deviceId: 'synthetic-device',
  csrf: 'synthetic-csrf',
} as AccountSession;
const initial = { directoryStarting: true, prioritizeDirectory: true };
const recheck = { directoryStarting: false, prioritizeDirectory: true };

await test('foreground boot coalesces rechecks and releases optional work once the directory settles', () => {
  const started: string[] = [];
  const boot = new SessionBoot((value) => started.push(value.accountId));
  boot.setSession(session);
  assert.equal(boot.backgroundReady, false);
  boot.update(session, initial);
  assert.equal(boot.deferred, true);
  assert.equal(boot.backgroundReady, false);
  boot.update(session, recheck);
  boot.update({ ...session, name: 'Updated name' }, recheck);
  assert.deepEqual(started, []);
  boot.settled(session);
  assert.equal(boot.deferred, false);
  assert.equal(boot.backgroundReady, true);
  boot.settled(session);
  assert.deepEqual(started, [session.accountId]);
  boot.update(session, recheck);
  assert.equal(
    started.length,
    2,
    'Normal rechecks retain their existing refresh behavior after startup',
  );
});

await test('background loading never blocks a community/contact foreground or navigation away', () => {
  let started = 0;
  const boot = new SessionBoot(() => {
    started++;
  });
  boot.update(session, { directoryStarting: true, prioritizeDirectory: false });
  assert.equal(started, 1);
  boot.update(session, initial);
  boot.release();
  assert.equal(boot.deferred, false);
  assert.equal(started, 2);
  boot.settled(session);
  assert.equal(started, 2);
});

for (const change of ['accountId', 'deviceId', 'csrf'] as const)
  await test(`a ${change} change rejects a late directory completion`, () => {
    const started: string[] = [];
    const boot = new SessionBoot((value) => started.push(value.accountId));
    const replacement = { ...session, [change]: 'replacement' };
    boot.update(session, initial);
    boot.setSession(replacement);
    assert.equal(boot.backgroundReady, false);
    boot.update(replacement, initial);
    boot.settled(session);
    assert.deepEqual(started, []);
    boot.settled(replacement);
    assert.deepEqual(started, [replacement.accountId]);
    boot.reset();
    boot.settled(replacement);
    assert.equal(started.length, 1);
  });
