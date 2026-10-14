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
  await f.sync.maintainPresence();
  await f.sync.run(() => Promise.resolve());
  t.mock.timers.tick(10000);
  await turn();
  assert.deepEqual(calls, ['direct', 'direct', 'groups']);
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

await test('aviso normal durante pré-carregamento aguarda a página confirmar sem abortar seu progresso', async (t) => {
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

await test('snapshot atualizado durante preparação repete no próximo turno sem esperar um minuto', async (t) => {
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

await test('aba hidden continua preparação e avisos, sem renovar presença online', async (t) => {
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
  assert.equal(probes, 1);
  assert.equal(pages, 1);
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
