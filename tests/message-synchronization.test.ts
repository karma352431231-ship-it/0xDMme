import { WorkInterruption } from '../src/client/synchronization-work/index.ts';
import {
  MessageContinuation,
  awaitMessageWork,
} from '../src/client/messages/continuation.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageSynchronization } from '../src/client/messages/synchronization.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(
  t: TestContext,
  overrides: Partial<
    ConstructorParameters<typeof MessageSynchronization>[0]
  > = {},
) {
  const state = {
    generation: 0,
    connected: true,
    session: true,
    online: true,
    visible: true,
    suspended: false,
    liveConnecting: false,
    startupPending: false,
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
  Object.assign(options, overrides);
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
await test('only the latest retained opening runs after maintenance without a foreground sync frame', async (t) => {
  const f = fixture(t),
    presence = deferred<void>(),
    calls: string[] = [],
    frames: boolean[] = [];
  f.options.presence = () => presence.promise;
  f.options.status = () => frames.push(f.sync.busy);
  const maintenance = f.sync.maintainPresence();
  await turn();
  const open = (peer: string) =>
    f.sync.open(
      () => {
        calls.push(`fetch:${peer}`);
        return Promise.resolve();
      },
      () => {
        calls.push(`restore:${peer}`);
        return true;
      },
    );
  const first = open('A');
  await turn();
  const second = open('B'),
    last = open('A');
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['restore:A', 'restore:B', 'restore:A']);
  assert.equal(f.sync.busy, false);
  presence.resolve();
  await Promise.all([maintenance, last]);
  assert.deepEqual(calls, ['restore:A', 'restore:B', 'restore:A']);
  assert.ok(frames.length > 0);
  assert.ok(frames.every((busy) => !busy));
});

for (const cancel of ['reset', 'close'] as const)
  await test(`${cancel} settles a retained opening before held maintenance completes`, async (t) => {
    const f = fixture(t),
      presence = deferred<void>();
    f.options.presence = () => presence.promise;
    const maintenance = f.sync.maintainPresence();
    await turn();
    let eligible = false,
      settled = false,
      restored = false;
    const opening = f.sync
      .open(
        () => Promise.reject(new Error('Cancelled work ran')),
        () => {
          if (!eligible) return false;
          restored = true;
          return true;
        },
      )
      .then(() => {
        settled = true;
      });
    await turn();
    f.state.generation++;
    f.sync[cancel]();
    await turn();
    assert.equal(settled, true);
    eligible = true;
    presence.resolve();
    await Promise.all([maintenance, opening]);
    assert.equal(restored, false);
    assert.deepEqual(f.notices, []);
  });

await test('an invalidated retained opening falls back to verification and restore errors are reported', async (t) => {
  const f = fixture(t);
  let verified = false;
  await f.sync.open(
    () => {
      verified = f.sync.busy;
      return Promise.resolve();
    },
    () => false,
  );
  assert.equal(verified, true);
  await f.sync.open(
    () => Promise.reject(new Error('Unexpected fallback')),
    () => {
      throw new Error('Synthetic projection failure');
    },
  );
  assert.equal(f.sync.failed, true);
  assert.equal(f.sync.busy, false);
  assert.deepEqual(f.notices, [
    'The operation could not be completed. Please try again.',
  ]);
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
  let groupProjections = 0;
  f.options.groupProjection = () => {
    groupProjections++;
    return Promise.resolve();
  };
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
    1,
    'Private receipt updates private previews only',
  );
  assert.equal(
    groupProjections,
    1,
    'Group receipt refreshes group badges and list metadata',
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

await test('a visible live-history request lets the bounded page commit before its signed recheck', async (t) => {
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
    false,
    'A live recheck must retain the current authenticated page and its cursor',
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
  let groupProjections = 0;
  f.options.groupProjection = () => {
    groupProjections++;
    return Promise.resolve();
  };
  group.resolve(false);
  await turn();
  assert.equal(groupProjections, 1);
  assert.equal(
    f.completed(),
    1,
    'Group completion does not repeat private previews',
  );
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

await test('visible history verification excludes counters from the critical network path', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    history = deferred<void>(),
    counts = deferred<void>();
  let historyRequests = 0,
    counterRequests = 0,
    settled = 0;
  f.options.changes = () => {
    historyRequests++;
    return history.promise;
  };
  f.options.unread = () => {
    counterRequests++;
    return counts.promise;
  };
  f.options.visibleSettled = () => settled++;
  f.sync.request('probe', { priority: 'interactive' }, 'direct');
  assert.equal(f.sync.visibleUpdatePending, true);
  t.mock.timers.tick(150);
  await turn();
  assert.equal(historyRequests, 1);
  assert.equal(
    counterRequests,
    0,
    'Slow counts cannot delay the selected read',
  );
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(counterRequests, 0);
  history.resolve();
  await turn();
  assert.equal(f.sync.visibleUpdatePending, false);
  assert.equal(settled, 1);
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(counterRequests, 1, 'Counts continue once history is verified');
  counts.resolve();
  await turn();
});

await test('a live update retains current receipt progress and reserves the next turn before counts or another inbox', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    page = deferred<boolean>(),
    history = deferred<void>();
  let directRequests = 0,
    groupRequests = 0,
    counterRequests = 0,
    historyRequests = 0;
  let pageSignal: AbortSignal | undefined;
  f.options.preloadDirect = (signal) => {
    pageSignal = signal;
    directRequests++;
    return page.promise;
  };
  f.options.preloadGroups = () => {
    groupRequests++;
    return Promise.resolve(false);
  };
  f.options.unread = () => {
    counterRequests++;
    return Promise.resolve();
  };
  f.options.changes = () => {
    historyRequests++;
    return history.promise;
  };
  f.sync.resume();
  t.mock.timers.tick(1000);
  await turn();
  f.sync.request('probe', { priority: 'interactive' }, 'direct');
  assert.equal(pageSignal?.aborted, false);
  page.resolve(false);
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(historyRequests, 1);
  assert.equal(
    directRequests,
    1,
    'The in-flight encrypted page was not restarted',
  );
  assert.equal(counterRequests, 0);
  assert.equal(groupRequests, 0);
  assert.equal(
    f.completed(),
    0,
    'The page cannot start account previews ahead of visible verification',
  );
  history.resolve();
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(counterRequests, 1);
  assert.equal(
    f.completed(),
    1,
    'The committed page still refreshes other contacts after the selected view',
  );
});

await test('a scoped account receipt refresh does not probe the selected chat or restart the other inbox', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let directRequests = 0,
    groupRequests = 0,
    selectedRequests = 0;
  f.options.preloadDirect = () => {
    directRequests++;
    return Promise.resolve(false);
  };
  f.options.preloadGroups = () => {
    groupRequests++;
    return Promise.resolve(false);
  };
  f.options.changes = () => {
    selectedRequests++;
    return Promise.resolve();
  };
  f.sync.resume();
  for (let page = 0; page < 2; page++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  directRequests = 0;
  groupRequests = 0;
  f.sync.requestInbox('groups');
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(groupRequests, 1);
  assert.equal(directRequests, 0);
  assert.equal(selectedRequests, 0);
});

await test('receipt metadata verification never starts a direct or group ciphertext page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let directRequests = 0,
    groupRequests = 0,
    metadataRequests = 0;
  f.options.preloadDirect = () => {
    directRequests++;
    return Promise.resolve(false);
  };
  f.options.preloadGroups = () => {
    groupRequests++;
    return Promise.resolve(false);
  };
  f.options.changes = () => {
    metadataRequests++;
    return Promise.resolve();
  };
  f.sync.resume();
  for (let page = 0; page < 2; page++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  directRequests = 0;
  groupRequests = 0;
  f.sync.requestProjection({ priority: 'interactive' });
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(metadataRequests, 1);
  assert.equal(directRequests, 0);
  assert.equal(groupRequests, 0);
});

for (const scenario of [
  { hints: ['receipts', 'receipts'], counters: 1, decorations: 0, full: 0 },
  { hints: ['content', 'receipts'], counters: 1, decorations: 0, full: 0 },
  {
    hints: ['receipts', 'content', 'all'],
    counters: 1,
    decorations: 3,
    full: 1,
  },
  {
    hints: ['all', 'receipts', 'content'],
    counters: 1,
    decorations: 3,
    full: 1,
  },
] as const)
  await test(`coalesced ${scenario.hints.join('/')} wakeups preserve only their required network owners`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let counterRequests = 0,
      decorationRequests = 0,
      selectedRequests = 0;
    const decorate = () => {
      decorationRequests++;
      return Promise.resolve();
    };
    const f = fixture(t, {
      unread: () => {
        counterRequests++;
        return Promise.resolve();
      },
      changeMaintenance: [decorate, decorate, decorate],
      changes: () => {
        selectedRequests++;
        return Promise.resolve();
      },
    });
    f.state.startupPending = true;
    for (const hint of scenario.hints) {
      if (hint === 'receipts')
        f.sync.requestProjection({ priority: 'interactive' });
      else if (hint === 'content')
        f.sync.request('probe', { priority: 'interactive' }, 'direct');
      else f.sync.request('probe', { priority: 'interactive' });
    }
    t.mock.timers.tick(150);
    await turn();
    assert.equal(selectedRequests, 1);
    assert.equal(
      counterRequests,
      0,
      'Only selected verification is on the critical path',
    );
    assert.equal(
      f.completed(),
      scenario.full,
      'Scoped activity does not start unrelated preview reads',
    );
    for (let step = 0; step < 6; step++) {
      t.mock.timers.tick(1000);
      await turn();
    }
    assert.equal(counterRequests, scenario.counters);
    assert.equal(decorationRequests, scenario.decorations);
  });

await test('a same-account receipt clears a remote unread count after selected verification without broad maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const selected = deferred<void>();
  let displayedUnread = 3,
    currentUnread = 3,
    counterRequests = 0,
    decorationRequests = 0;
  const decorate = () => {
    decorationRequests++;
    return Promise.resolve();
  };
  const f = fixture(t, {
    changes: () => selected.promise,
    unread: () => {
      counterRequests++;
      displayedUnread = currentUnread;
      return Promise.resolve();
    },
    changeMaintenance: [decorate, decorate, decorate],
  });
  f.state.startupPending = true;
  currentUnread = 0;
  f.sync.requestProjection({ priority: 'interactive' });
  f.sync.requestProjection({ priority: 'interactive' });
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(
    counterRequests,
    0,
    'Unread projection cannot hold up the selected verification',
  );
  assert.equal(displayedUnread, 3);
  selected.resolve();
  await turn();
  for (let step = 0; step < 5; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(
    displayedUnread,
    0,
    'A read on another device clears this account badge',
  );
  assert.equal(
    counterRequests,
    1,
    'Repeated receipt hints use one fresh count read',
  );
  assert.equal(decorationRequests, 0);
  assert.equal(
    f.completed(),
    0,
    'Receipt counts do not request unrelated previews',
  );
});

await test('unselected group receipts coalesce one metadata refresh without private or ciphertext work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let groupRequests = 0,
    privateRequests = 0,
    ciphertextRequests = 0;
  const f = fixture(t, {
    groupProjection: () => {
      groupRequests++;
      return Promise.resolve();
    },
    unread: () => {
      privateRequests++;
      return Promise.resolve();
    },
    preloadGroups: () => {
      ciphertextRequests++;
      return Promise.resolve(false);
    },
  });
  f.state.startupPending = true;
  f.sync.requestCounters('groups');
  f.sync.requestCounters('groups');
  for (let step = 0; step < 4; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(groupRequests, 1);
  assert.equal(privateRequests, 0);
  assert.equal(ciphertextRequests, 0);
  assert.equal(f.completed(), 0);
});

await test('selected group metadata is verified once without repeating its projection or private counts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let selectedGroupRequests = 0,
    backgroundGroupRequests = 0,
    privateRequests = 0;
  const f = fixture(t, {
    changes: () => {
      selectedGroupRequests++;
      return Promise.resolve();
    },
    groupProjection: () => {
      backgroundGroupRequests++;
      return Promise.resolve();
    },
    unread: () => {
      privateRequests++;
      return Promise.resolve();
    },
  });
  f.state.startupPending = true;
  f.sync.requestProjection({ priority: 'interactive' }, 'groups');
  t.mock.timers.tick(150);
  await turn();
  for (let step = 0; step < 4; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(selectedGroupRequests, 1);
  assert.equal(backgroundGroupRequests, 0);
  assert.equal(privateRequests, 0);
});

await test('generic maintenance and scoped group metadata share a single pending group read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let groupRequests = 0;
  const f = fixture(t, {
    groupProjection: () => {
      groupRequests++;
      return Promise.resolve();
    },
  });
  f.state.startupPending = true;
  f.sync.request('probe', { priority: 'interactive' });
  f.sync.requestCounters('groups');
  t.mock.timers.tick(150);
  await turn();
  for (let step = 0; step < 6; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(groupRequests, 1);
});

await test('bounded continuation yields to a queued send with zero added scheduling delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const f = fixture(t);
  const calls: string[] = [];
  let textPending = false,
    admittedAt = 0,
    sentAt = 0,
    resumedAt = 0;
  const initialState = f.options.state;
  f.options.state = () => ({ ...initialState(), textPending });
  await f.sync.run(async () => {
    await f.sync.history(() => {
      for (let page = 0; page < 8; page++) {
        t.mock.timers.tick(5);
        if (page === 0) {
          textPending = true;
          admittedAt = Date.now();
        }
        calls.push('page');
      }
      return Promise.resolve(
        new MessageContinuation(() => {
          resumedAt = Date.now();
          calls.push('last-page');
          return Promise.resolve();
        }),
      );
    });
  });
  assert.equal(f.sync.failed, false);
  assert.deepEqual(f.notices, []);
  assert.equal(
    f.completed(),
    0,
    'An unfinished turn must not announce completion',
  );
  await f.sync.run(() => {
    sentAt = Date.now();
    calls.push('send');
    textPending = false;
    return Promise.resolve();
  });
  t.mock.timers.tick(0);
  await turn();
  assert.deepEqual(calls, [
    ...Array<string>(8).fill('page'),
    'send',
    'last-page',
  ]);
  assert.equal(
    sentAt - admittedAt,
    35,
    'Only the rest of the existing bounded turn precedes this send',
  );
  assert.equal(
    resumedAt - sentAt,
    0,
    'An available continuation adds no fixed page delay',
  );
  assert.equal(f.completed(), 1);
});
for (const cancel of ['reset', 'cancelOpening', 'close'] as const) {
  await test(`${cancel} drops a queued continuation before it reads or publishes`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t);
    let resumed = 0;
    await f.sync.run(async () => {
      await f.sync.history(() =>
        Promise.resolve(
          new MessageContinuation(() => {
            resumed++;
            return Promise.resolve();
          }),
        ),
      );
    });
    f.sync[cancel]();
    t.mock.timers.tick(0);
    await turn();
    assert.equal(resumed, 0);
    assert.deepEqual(f.notices, []);
  });
}
await test('the next runnable receipt page does not wait one second between pages', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t);
  let pages = 0;
  f.options.preloadDirect = () => Promise.resolve(++pages < 3);
  f.sync.prepareHistory('direct');
  f.sync.resume();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(pages, 1);
  t.mock.timers.tick(0);
  await turn();
  assert.equal(pages, 1, 'The other inbox retains its existing turn');
  t.mock.timers.tick(1000);
  await turn(); // the other inbox retains its initial scheduling window
  t.mock.timers.tick(0);
  await turn();
  assert.equal(pages, 2);
  t.mock.timers.tick(0);
  await turn();
  assert.equal(pages, 3);
});

for (const outcome of ['complete', 'cancel', 'failure'] as const) {
  await test(`a waiting request settles after continuation ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t);
    let settled = false;
    const request = awaitMessageWork(
      () =>
        Promise.resolve(
          new MessageContinuation(() => {
            if (outcome === 'failure')
              return Promise.reject(new Error('Synthetic read failed'));
            return Promise.resolve();
          }),
        ),
      (work) =>
        f.sync.run(async () => {
          await f.sync.history(work);
        }),
    );
    const observed = request.then(
      () => {
        settled = true;
      },
      (error: unknown) => {
        settled = true;
        assert.match(String(error), /superseded|Synthetic read failed/);
      },
    );
    await turn();
    assert.equal(settled, false);
    if (outcome === 'cancel') f.sync.cancelOpening();
    else t.mock.timers.tick(0);
    await observed;
    assert.equal(settled, true);
  });
}

for (const busy of [false, true]) {
  await test(`retained presentation bypasses unrelated ${busy ? 'foreground work' : 'maintenance'} without overlapping engine work`, async (t) => {
    const f = fixture(t),
      gate = deferred<void>();
    f.state.startupPending = true;
    let displayed = false,
      engineWork = 0;
    const owner = busy
      ? f.sync.run(() => gate.promise)
      : f.sync.background(() => gate.promise);
    await turn();
    assert.equal(f.sync.foregroundReady, false);
    assert.equal(f.sync.presentationReady, true);
    await f.sync.open(
      () => {
        engineWork++;
        return Promise.resolve();
      },
      () => {
        displayed = true;
        return true;
      },
    );
    assert.equal(displayed, true);
    assert.equal(engineWork, 0);
    gate.resolve();
    await owner;
    assert.deepEqual(f.notices, []);
  });
}
for (const origin of [
  'navigation',
  'replacement',
  'scheduler',
  'continuation',
] as const) {
  await test(`an internal ${origin} interruption retains pending work without a connection failure or 61s backoff`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t);
    let calls = 0;
    f.options.preloadGroups = () => {
      calls++;
      return calls === 1
        ? Promise.reject(
            new ApiResponseError({
              operation: 'messages/group-message-confirm',
              status: 0,
              failure: 'cancelled',
              cause: new WorkInterruption(origin),
            }),
          )
        : Promise.resolve(false);
    };
    f.sync.resume();
    t.mock.timers.tick(1000);
    await turn();
    t.mock.timers.tick(1000);
    await turn();
    assert.equal(calls, 1);
    t.mock.timers.tick(0);
    await turn();
    assert.equal(calls, 2);
    assert.deepEqual(f.notices, []);
    assert.equal(f.sync.failed, false);
  });
}
for (const error of [
  new DOMException('Unknown abort', 'AbortError'),
  new DOMException('Timeout', 'TimeoutError'),
  new AccountError(403, 'Revoked'),
]) {
  await test(`a real ${error.name} failure is still reported and backed off`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(t);
    let calls = 0;
    f.options.preloadDirect = () => {
      calls++;
      return Promise.reject(error);
    };
    f.sync.resume();
    t.mock.timers.tick(1000);
    await turn();
    assert.equal(f.notices.length, 1);
    t.mock.timers.tick(0);
    await turn();
    assert.equal(calls, 1);
  });
}
