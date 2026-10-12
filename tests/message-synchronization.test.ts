import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageSynchronization } from '../src/client/messages/synchronization.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(t: TestContext) {
  const state = {
    generation: 0,
    connected: true,
    session: true,
    online: true,
    visible: true,
    liveConnecting: false,
  };
  const notices: string[] = [];
  let completed = 0,
    projections = 0;
  const options: ConstructorParameters<typeof MessageSynchronization>[0] = {
    state: () => state,
    status() {},
    notice: (text) => notices.push(text),
    complete: () => {
      completed++;
    },
    renderPending: () => {
      projections++;
      return Promise.resolve();
    },
    pause() {},
    preloadDirect: () => Promise.resolve(false),
    preloadGroups: () => Promise.resolve(false),
    presence: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    changes: () => Promise.resolve(),
    periodic: () => Promise.resolve(),
    periodicWork: () => Promise.resolve(true),
    pending: () => Promise.resolve(['synthetic']),
    sendPending: () => Promise.resolve(),
  };
  const sync = new MessageSynchronization(options);
  t.after(() => sync.close());
  return {
    sync,
    state,
    options,
    notices,
    completed: () => completed,
    projections: () => projections,
  };
}
await test('user operation waits for maintenance and stays exclusive through pending projection', async (t) => {
  const f = fixture(t),
    presence = deferred<void>(),
    projection = deferred<void>();
  let actions = 0;
  f.options.presence = () => presence.promise;
  f.options.renderPending = () => projection.promise;
  const maintenance = f.sync.maintainPresence();
  const action = f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  await turn();
  assert.equal(actions, 0);
  presence.resolve();
  await maintenance;
  await turn();
  assert.equal(actions, 1);
  assert.equal(f.sync.busy, true);
  await f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  assert.equal(actions, 1);
  projection.resolve();
  await action;
  assert.equal(f.sync.busy, false);
});
await test('logout during queued work suppresses the old action, result and pending projection', async (t) => {
  const f = fixture(t),
    presence = deferred<void>();
  f.options.presence = () => presence.promise;
  const maintenance = f.sync.maintainPresence();
  let actions = 0;
  const action = f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  f.state.generation++;
  f.state.session = false;
  f.sync.reset();
  presence.resolve();
  await maintenance;
  await action;
  assert.equal(actions, 0);
  assert.equal(f.completed(), 0);
  assert.equal(f.projections(), 0);
  assert.deepEqual(f.notices, []);
});
await test('prefetch alternates direct and groups, stops completed branches and cancels for user work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    calls: string[] = [],
    held = deferred<boolean>();
  const signals: AbortSignal[] = [];
  f.options.preloadDirect = (value) => {
    calls.push('direct');
    signals.push(value);
    return held.promise;
  };
  f.options.preloadGroups = () => {
    calls.push('groups');
    return Promise.resolve(false);
  };
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  assert.deepEqual(calls, ['direct']);
  await f.sync.run(() => Promise.resolve());
  assert.ok(signals[0]?.aborted);
  held.resolve(false);
  await turn();
  // A subsequent foreground cycle can start new work after the cancelled branch settles.
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(10000);
  await turn();
  assert.deepEqual(calls, ['direct', 'direct', 'groups']);
});
await test('background/offline suppress wakeups; close cancels a queued refresh and timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let refreshes = 0;
  f.options.refresh = () => {
    refreshes++;
    return Promise.resolve();
  };
  f.state.visible = false;
  f.sync.request();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(refreshes, 0);
  f.state.visible = true;
  f.state.online = false;
  f.sync.resume();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(refreshes, 0);
  f.state.online = true;
  f.sync.resume();
  f.sync.close();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(refreshes, 0);
});
await test('automatic pending retries keep the three attempts and one minute spacing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(t);
  let sends = 0;
  f.options.sendPending = () => {
    sends++;
    return Promise.resolve();
  };
  for (let index = 0; index < 5; index++) {
    await f.sync.resumePending();
    await f.sync.resumePending();
    t.mock.timers.tick(60000);
  }
  assert.equal(sends, 3);
});
await test('prefetch failure is bounded, and session change cannot publish its delayed error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const f = fixture(t),
    held = deferred<boolean>();
  let calls = 0;
  f.options.preloadDirect = () => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error('Synthetic failure'))
      : held.promise;
  };
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  assert.deepEqual(f.notices, ['Synthetic failure']);
  t.mock.timers.tick(60000);
  await turn();
  assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(calls, 2);
  f.state.generation++;
  f.sync.reset();
  held.reject(new Error('Old session'));
  await turn();
  assert.deepEqual(f.notices, ['Synthetic failure']);
});
