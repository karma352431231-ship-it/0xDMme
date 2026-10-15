import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startActivity } from '../src/client/activity/index.ts';
import type { ActivitySources } from '../src/client/activity/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
const session = { accountId: 'a', deviceId: 'd', csrf: 'c' } as AccountSession;
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(t: TestContext, overrides: Partial<ActivitySources> = {}) {
  const browser = new EventTarget(),
    page = Object.assign(new EventTarget(), { hidden: false }),
    worker = new EventTarget();
  const descriptors = ['window', 'document'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine'),
    service = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: page,
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
    writable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: worker,
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests: Awaited<ReturnType<ActivitySources['requests']>>[number][] =
    [];
  const replies: Awaited<ReturnType<ActivitySources['replies']>>[number][] = [];
  const counts: number[] = [];
  const activity = startActivity(
    {
      requests: () => Promise.resolve([...requests]),
      replies: () => Promise.resolve([...replies]),
      respondRequest: () => Promise.resolve(),
      groupInvites: () => Promise.resolve([]),
      respondGroupInvite: () => Promise.resolve(),
      markRepliesRead: () => Promise.resolve(),
      transfers: () => Promise.resolve([]),
      missedCalls: () => Promise.resolve([]),
      clearMissedCalls: () => Promise.resolve(),
      ...overrides,
    },
    { countChanged: (count) => counts.push(count) },
  );
  activity.setSession(session);
  t.after(() => {
    activity.setSession(null);
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    for (const [key, descriptor] of [
      ['onLine', online],
      ['serviceWorker', service],
    ] as const) {
      if (descriptor) Object.defineProperty(navigator, key, descriptor);
      else Reflect.deleteProperty(navigator, key);
    }
  });
  return { activity, counts, requests, replies, browser, page, worker };
}
await test('live arrivals update the bell without manual refresh, once per new request or reply', async (t) => {
  const f = fixture(t);
  f.activity.ready();
  t.mock.timers.tick(150);
  await settle();
  assert.equal(f.counts.at(-1), 0);
  f.requests.push({
    accountId: 'peer',
    address: '0x1',
    ecosystem: 'evm',
    name: 'Peer',
  });
  f.activity.event('changed');
  t.mock.timers.tick(150);
  await settle();
  assert.equal(f.counts.at(-1), 1);
  f.replies.push({
    reply: 'reply-1',
    community: 'c',
    createdAt: new Date().toISOString(),
    preview: null,
  });
  f.activity.event('changed');
  t.mock.timers.tick(150);
  await settle();
  assert.equal(f.counts.at(-1), 2);
  f.activity.event('changed');
  f.activity.event('changed');
  t.mock.timers.tick(150);
  await settle();
  assert.equal(f.counts.at(-1), 2);
});
await test('an arrival during a read queues one follow-up; revocation rejects an older response', async (t) => {
  let release = () => {},
    reads = 0;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture(t, {
    requests: async () => {
      if (++reads === 1) await first;
      return [];
    },
  });
  f.activity.ready();
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 1);
  f.activity.event('changed');
  f.activity.event('changed');
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 1);
  release();
  await settle();
  assert.equal(reads, 2);
  f.activity.event('revoked');
  t.mock.timers.tick(60_150);
  await settle();
  assert.equal(reads, 2);
  assert.equal(f.counts.at(-1), 0);
});
await test('fallback and push refresh all sources; hidden, offline and logged-out pages do not poll', async (t) => {
  let reads = 0;
  const f = fixture(t, {
    requests: () => {
      reads++;
      return Promise.resolve([]);
    },
  });
  f.activity.ready();
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 1);
  t.mock.timers.tick(30_000);
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 2);
  f.page.hidden = true;
  f.activity.event('changed');
  t.mock.timers.tick(30_150);
  await settle();
  assert.equal(reads, 2);
  f.page.hidden = false;
  f.page.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 3);
  Object.defineProperty(navigator, 'onLine', { value: false });
  t.mock.timers.tick(30_150);
  await settle();
  assert.equal(reads, 3);
  Object.defineProperty(navigator, 'onLine', { value: true });
  f.browser.dispatchEvent(new Event('online'));
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 4);
  f.worker.dispatchEvent(
    new MessageEvent('message', { data: { type: 'ACTIVITY_CHANGED' } }),
  );
  t.mock.timers.tick(150);
  await settle();
  assert.equal(reads, 5);
  f.activity.setSession(null);
  t.mock.timers.tick(60_150);
  await settle();
  assert.equal(reads, 5);
});

await test('authority loss ignores an older pending request response', async (t) => {
  let release = () => {};
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture(t, {
    requests: async () => {
      await first;
      return [{ accountId: 'old', name: '', address: '0x1', ecosystem: 'evm' }];
    },
  });
  f.activity.ready();
  t.mock.timers.tick(150);
  await settle();
  f.activity.event('revoked');
  release();
  await settle();
  assert.equal(f.counts.at(-1), 0);
});
