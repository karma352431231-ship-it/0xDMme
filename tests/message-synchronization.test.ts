import { ApiResponseError } from '../src/client/api-response/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
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
    suspended: false,
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
    unread: () => Promise.resolve(),
    presence: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    changes: () => Promise.resolve(),
    changeMaintenance: [
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.resolve(),
    ],
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
  await f.sync.maintainPresence();
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(10000);
  await turn();
  assert.deepEqual(calls, ['direct', 'direct', 'groups']);
});

await test('account inbox receives private and group pages without a mounted or selected chat', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  f.state.connected = false;
  const received: string[] = [];
  f.options.preloadDirect = () => {
    received.push('private');
    return Promise.resolve(false);
  };
  f.options.preloadGroups = () => {
    received.push('group');
    return Promise.resolve(false);
  };
  f.sync.resume();
  for (let page = 0; page < 2; page++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.deepEqual(received, ['private', 'group']);
  assert.equal(
    f.completed(),
    2,
    'Each received page refreshes directory projections',
  );
  t.mock.timers.tick(10000);
  await turn();
  assert.deepEqual(
    received,
    ['private', 'group'],
    'Completed inboxes remain idle',
  );
});

await test('routine presence and decoration cannot abort an unfinished inbox page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    held = deferred<boolean>();
  const signals: AbortSignal[] = [];
  let received = false,
    decoration = 0;
  f.options.preloadDirect = async (value) => {
    signals.push(value);
    await held.promise;
    received = !value.aborted;
    return false;
  };
  f.sync.resume();
  t.mock.timers.tick(1000);
  await turn();
  const signal = signals[0];
  assert.ok(signal);
  await f.sync.maintainPresence();
  await f.sync.background(() => {
    decoration++;
    return Promise.resolve();
  });
  await f.sync.periodicTick();
  assert.equal(signal.aborted, false);
  assert.equal(
    decoration,
    0,
    'Optional work yields until the receipt page settles',
  );
  held.resolve(false);
  await turn();
  assert.equal(received, true);
});

await test('a live account wakeup is checked while its chat directory is disconnected', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  f.state.connected = false;
  let checks = 0;
  f.options.changes = () => {
    checks++;
    return Promise.resolve();
  };
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(checks, 1);
});
await test('suspension/offline suppress wakeups; close cancels a queued refresh and timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let refreshes = 0;
  f.options.refresh = () => {
    refreshes++;
    return Promise.resolve();
  };
  f.state.suspended = true;
  f.sync.request();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(refreshes, 0);
  f.state.suspended = false;
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
    assert.equal(await f.sync.pendingWork(), index < 3);
    await f.sync.resumePending();
    assert.equal(await f.sync.pendingWork(), false);
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
  assert.deepEqual(f.notices, [
    'The operation could not be completed. Please try again.',
  ]);
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
  assert.deepEqual(f.notices, [
    'The operation could not be completed. Please try again.',
  ]);
});

await test('normal notice during preload waits for page confirmation without aborting progress', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    page = deferred<boolean>();
  const signals: AbortSignal[] = [];
  let checks = 0;
  f.options.preloadDirect = (value) => {
    signals.push(value);
    return page.promise;
  };
  f.options.changes = () => {
    checks++;
    return Promise.resolve();
  };
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  const signal = signals[0];
  assert.ok(signal);
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(checks, 0);
  assert.equal(signal.aborted, false);
  page.resolve(false);
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(checks, 1);
});

await test('snapshot updated during preparation repeats on the next turn without a one-minute wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const f = fixture(t);
  let calls = 0;
  f.options.preloadDirect = () => {
    calls++;
    return calls === 1
      ? Promise.reject(new AccountError(409, 'Snapshot alterado'))
      : Promise.resolve(false);
  };
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(calls, 1);
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(calls, 2);
});

await test('a hidden tab defers automatic preparation and hints without renewing online presence', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  f.state.visible = false;
  let pages = 0,
    probes = 0,
    presence = 0;
  f.options.preloadDirect = () => {
    pages++;
    return Promise.resolve(false);
  };
  f.options.changes = () => {
    probes++;
    return Promise.resolve();
  };
  f.options.presence = () => {
    presence++;
    return Promise.resolve();
  };
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  await f.sync.periodicTick();
  assert.equal(probes, 0);
  assert.equal(pages, 0);
  assert.equal(presence, 0);
  f.state.visible = true;
  f.sync.resume();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(probes, 1);
  for (let step = 0; step < 3; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.ok(pages > 0);
  assert.equal(presence, 0);
});

await test('automatic probes stay silent and a user action waits for the current check', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    check = deferred<void>();
  let actions = 0;
  f.options.changes = () => check.promise;
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.sync.busy, false);
  const action = f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  await turn();
  assert.equal(actions, 0);
  check.resolve();
  await action;
  assert.equal(actions, 1);
  assert.equal(f.sync.busy, false);
});

await test('idle fallback checks do not announce an interactive sync or drop a user action', async (t) => {
  const f = fixture(t),
    check = deferred<void>();
  let actions = 0;
  f.options.periodic = () => check.promise;
  const tick = f.sync.periodicTick();
  await turn();
  assert.equal(f.sync.busy, false);
  const action = f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  check.resolve();
  await Promise.all([tick, action]);
  assert.equal(actions, 1);
});

await test('automatic check failures remain visible, while logout cancels a waiting user action', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  f.options.changes = () => Promise.reject(new Error('Current failure'));
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.sync.failed, true);
  assert.equal(f.notices.length, 1);
  const check = deferred<void>();
  f.options.changes = () => check.promise;
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  let actions = 0;
  const action = f.sync.run(() => {
    actions++;
    return Promise.resolve();
  });
  f.state.generation++;
  f.state.session = false;
  f.sync.reset();
  check.reject(new Error('Old failure'));
  await action;
  assert.equal(actions, 0);
  assert.equal(f.notices.length, 1);
});

await test('a priority refresh waits for an automatic check and still reserves the interactive gate', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    check = deferred<void>(),
    refresh = deferred<void>();
  let refreshes = 0;
  f.options.changes = () => check.promise;
  f.options.refresh = () => {
    refreshes++;
    return refresh.promise;
  };
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  f.sync.request('refresh');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(refreshes, 0);
  check.resolve();
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(refreshes, 1);
  assert.equal(f.sync.busy, true);
  refresh.resolve();
  await turn();
  assert.equal(f.sync.busy, false);
});

await test('a successful queued action replaces the failure of the automatic check it waited for', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    check = deferred<void>();
  f.options.changes = () => check.promise;
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  const action = f.sync.run(() => Promise.resolve());
  check.reject(new Error('Temporary automatic failure'));
  await action;
  assert.equal(f.sync.failed, false);
  assert.equal(f.completed(), 1);
  assert.equal(f.notices.length, 1);
});

await test('a visible-change priority survives coalescing with a stronger refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    priorities: (string | undefined)[] = [];
  f.options.refresh = (work) => {
    priorities.push(work.priority);
    return Promise.resolve();
  };
  f.state.suspended = true;
  f.sync.request('probe', { priority: 'interactive' });
  f.sync.request('refresh');
  f.state.suspended = false;
  f.sync.resume();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, ['interactive']);
});

for (const clear of ['reset', 'startRefresh'] as const) {
  await test(`${clear} discards pending visible-change priority instead of promoting later maintenance`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t),
      priorities: (string | undefined)[] = [];
    f.options.changes = (work) => {
      priorities.push(work.priority);
      return Promise.resolve();
    };
    f.state.suspended = true;
    f.sync.request('probe', { priority: 'interactive' });
    f.sync[clear]();
    f.state.suspended = false;
    f.sync.request('probe');
    t.mock.timers.tick(150);
    await turn();
    assert.deepEqual(priorities, [undefined]);
  });
}

await test('a queued visible-change recheck waits while hidden and resumes its fresh foreground priority', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    priorities: (string | undefined)[] = [];
  f.options.changes = (work) => {
    priorities.push(work.priority);
    return Promise.resolve();
  };
  f.state.suspended = true;
  f.sync.request('probe', { priority: 'interactive' });
  f.state.visible = false;
  f.state.suspended = false;
  f.sync.resume();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, []);
  f.state.visible = true;
  f.sync.resume();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, ['interactive']);
});

await test('a visible live-history request yields prefetch cooperatively and retains the signed recheck priority', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    page = deferred<boolean>();
  const signals: AbortSignal[] = [],
    priorities: (string | undefined)[] = [];
  f.options.preloadDirect = (signal) => {
    signals.push(signal);
    return page.promise;
  };
  f.options.changes = (work) => {
    priorities.push(work.priority);
    return Promise.resolve();
  };
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(1000);
  await turn();
  const signal = signals[0];
  assert.ok(signal);
  f.sync.request('probe', { priority: 'interactive' });
  assert.equal(
    signal.aborted,
    true,
    'A foreground live recheck must request cooperative prefetch release',
  );
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    priorities.length,
    0,
    'The active prefetch owner still settles before the recheck',
  );
  page.resolve(false);
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, ['interactive']);
  assert.deepEqual(f.notices, []);
});

await test('hidden automatic hints coalesce without preparing history and resume one fresh check on visibility', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  f.state.visible = false;
  let checks = 0,
    preparations = 0,
    sends = 0;
  f.options.changes = () => {
    checks++;
    return Promise.resolve();
  };
  f.options.preloadDirect = () => {
    preparations++;
    return Promise.resolve(false);
  };
  for (let hint = 0; hint < 5; hint++) f.sync.request('probe');
  t.mock.timers.tick(30000);
  await turn();
  assert.equal(checks, 0);
  assert.equal(preparations, 0);
  assert.equal(
    await f.sync.run(() => {
      sends++;
      return Promise.resolve();
    }),
    true,
  );
  assert.equal(
    sends,
    1,
    'Explicit durable sending is independent of automatic hidden history work',
  );
  f.state.visible = true;
  f.sync.resume();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(checks, 1);
  assert.deepEqual(f.notices, []);
});

await test('a visible return prioritizes only the coalesced pending history check and never creates idle polling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    priorities: (string | undefined)[] = [];
  f.options.changes = (work) => {
    priorities.push(work.priority);
    return Promise.resolve();
  };
  f.state.visible = false;
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  f.state.visible = true;
  f.sync.resume({ priority: 'interactive' });
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, ['interactive']);
  f.sync.resume({ priority: 'interactive' });
  t.mock.timers.tick(150);
  await turn();
  assert.equal(priorities.length, 1);
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(priorities, ['interactive', undefined]);
});

await test('verified private pages refresh the directory before a slow group inbox finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    group = deferred<boolean>();
  f.state.connected = false;
  f.options.preloadGroups = () => group.promise;
  f.sync.resume();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(f.completed(), 1);
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(f.completed(), 1, 'Group receipt is still pending');
  group.resolve(false);
  await turn();
  assert.equal(f.completed(), 2);
});

await test('a live snapshot race is retried with fresh work before publishing an automatic error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let calls = 0;
  f.options.changes = () =>
    ++calls === 1
      ? Promise.reject(
          new ApiResponseError({
            operation: 'messages/delivery',
            status: 409,
            failure: 'http',
            responseType: 'json',
            message: 'Messages or permissions changed. Sync again.',
          }),
        )
      : Promise.resolve();
  f.sync.request('probe');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(calls, 2);
  assert.deepEqual(f.notices, []);
});
