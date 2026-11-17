import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionDeadline } from '../src/client/account/session-deadline.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

const day = 24 * 60 * 60 * 1000;
const longestTimer = 2_147_483_647;
function session(expiresAt: number, csrf = 'a'.repeat(64)): AccountSession {
  return {
    accountId: '11111111-1111-4111-8111-111111111111',
    ecosystem: 'evm',
    address: `0x${'1'.repeat(40)}`,
    name: '',
    deviceId: '22222222-2222-4222-8222-222222222222',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(expiresAt).toISOString(),
    csrf,
    profileRevision: 0,
  };
}
function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
/** One pending timer at a time, as the module replaces its own timer. */
function page(t: { after: (cleanup: () => void) => void }) {
  const clock = { now: Date.UTC(2026, 10, 17) };
  let pending: { callback: () => void; delay: number } | null = null;
  const realNow = Date.now;
  const scope = globalThis as { window?: unknown };
  const previous = scope.window;
  Date.now = () => clock.now;
  scope.window = {
    setTimeout(callback: () => void, delay: number) {
      pending = { callback, delay };
      return 1;
    },
    clearTimeout() {
      pending = null;
    },
  };
  t.after(() => {
    Date.now = realNow;
    scope.window = previous;
  });
  return {
    clock,
    pending: () => pending,
    /** Advances to the pending timer and runs it. */
    wake() {
      const timer = pending;
      assert.ok(timer);
      pending = null;
      clock.now += timer.delay;
      timer.callback();
    },
  };
}

await test('a page left open adopts each extended deadline and never expires while the server extends', async (t) => {
  const browser = page(t);
  const first = browser.clock.now + 400 * day;
  let served = session(first);
  const extended: string[] = [];
  let expired = 0;
  const deadline = createSessionDeadline({
    refresh: () => Promise.resolve(served),
    extended: (expiresAt) => extended.push(expiresAt),
    expired: () => expired++,
  });
  deadline.track(session(first));
  for (let wake = 0; wake < 40; wake++) {
    assert.equal(browser.pending()?.delay, longestTimer);
    served = session(browser.clock.now + longestTimer + 400 * day);
    browser.wake();
    await turn();
  }
  // Forty wake-ups span about 2.7 years, far beyond the first deadline.
  assert.ok(browser.clock.now > first);
  assert.equal(expired, 0);
  assert.equal(extended.length, 40);
  deadline.stop();
  assert.equal(browser.pending(), null);
});

await test('without an extension the page ends exactly at the known deadline', async (t) => {
  for (const refresh of [
    () => Promise.reject(new Error('offline')),
    () => Promise.resolve(null),
  ]) {
    const browser = page(t);
    const end = browser.clock.now + 60 * day;
    let expired = 0;
    const deadline = createSessionDeadline({
      refresh,
      extended: () => assert.fail('no extension was served'),
      expired: () => expired++,
    });
    deadline.track(session(end));
    while (browser.pending()) {
      browser.wake();
      await turn();
      assert.equal(expired, browser.clock.now < end ? 0 : 1);
    }
    assert.equal(browser.clock.now, end);
    assert.equal(expired, 1);
  }
});

await test('another session, an earlier deadline or a late answer after stopping is ignored', async (t) => {
  const browser = page(t);
  const end = browser.clock.now + 400 * day;
  let served: AccountSession = session(end + 400 * day, 'b'.repeat(64));
  let release: (() => void) | undefined;
  const deadline = createSessionDeadline({
    refresh: async () => {
      if (release === undefined) return served;
      await new Promise<void>((resolve) => (release = resolve));
      return served;
    },
    extended: () => assert.fail('nothing valid was served'),
    expired: () => assert.fail('the deadline was not reached'),
  });
  deadline.track(session(end));
  browser.wake();
  await turn();
  served = session(end - day);
  browser.wake();
  await turn();
  served = session(end + 400 * day);
  release = () => undefined;
  browser.wake();
  await turn();
  deadline.stop();
  release();
  await turn();
  assert.equal(browser.pending(), null);
});
