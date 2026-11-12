import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Connectivity } from '../src/client/connectivity/state.ts';
import {
  networkAvailable,
  networkOfflineEvent,
  networkOnlineEvent,
  startConnectivity,
} from '../src/client/connectivity/index.ts';
import { deferred } from './fixtures/deferred.ts';
import { mountOfflineNotice } from '../src/client/ping/index.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture(
  t: TestContext,
  probe: (signal: AbortSignal) => Promise<boolean>,
) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  const changes: boolean[] = [],
    signals: AbortSignal[] = [];
  let hint = false;
  const state = new Connectivity({
    hint: () => hint,
    changed: (online) => changes.push(online),
    probe: (signal) => {
      signals.push(signal);
      return probe(signal);
    },
  });
  t.after(() => state.pause());
  return {
    state,
    changes,
    signals,
    hint: (value: boolean) => {
      hint = value;
    },
  };
}

await test('false offline at startup recovers once and coalesces foreground wakeups', async (t) => {
  const held = deferred<boolean>();
  const f = fixture(t, () => held.promise);
  f.state.resume();
  f.state.resume();
  assert.equal(f.signals.length, 1);
  assert.equal(f.state.online, false);
  held.resolve(true);
  await turn();
  assert.equal(f.state.online, true);
  assert.deepEqual(f.changes, [false, true]);
  for (let i = 0; i < 10; i++) f.state.resume();
  t.mock.timers.tick(29_999);
  assert.equal(f.signals.length, 1);
  t.mock.timers.tick(1);
  await turn();
  assert.equal(f.signals.length, 2);
  assert.deepEqual(f.changes, [false, true]);
});

await test('a genuinely offline browser stays offline and retries at most once per 30 seconds', async (t) => {
  const f = fixture(t, () => Promise.reject(new TypeError('Offline')));
  f.state.resume();
  await turn();
  assert.equal(f.state.online, false);
  t.mock.timers.tick(30_000);
  await turn();
  assert.equal(f.signals.length, 2);
  assert.deepEqual(f.changes, [false]);
});

await test('probe deadlines invalidate old evidence, abort the request and leave one bounded retry', async (t) => {
  const f = fixture(
    t,
    (signal) =>
      new Promise<boolean>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          {
            once: true,
          },
        );
      }),
  );
  f.state.responded();
  f.state.resume();
  assert.equal(f.state.online, true);
  t.mock.timers.tick(30_000);
  assert.equal(f.signals.length, 1);
  t.mock.timers.tick(8_000);
  await turn();
  assert.equal(f.signals[0]?.aborted, true);
  assert.equal(f.state.online, false);
  t.mock.timers.tick(21_999);
  assert.equal(f.signals.length, 1);
  t.mock.timers.tick(1);
  assert.equal(f.signals.length, 2);
});

await test('responses supersede stale probes and network failures revoke only the offline override', async (t) => {
  const held = deferred<boolean>();
  const f = fixture(t, () => held.promise);
  f.state.resume();
  f.state.responded();
  assert.equal(f.signals[0]?.aborted, true);
  held.resolve(false);
  await turn();
  assert.equal(f.state.online, true);
  assert.deepEqual(f.changes, [false, true]);
  f.state.failed();
  assert.equal(f.state.online, false);
  f.hint(true);
  f.state.hintChanged();
  f.state.failed();
  assert.equal(
    f.state.online,
    true,
    'Server failure does not make a browser online hint an offline state',
  );
  const before = [...f.changes];
  f.hint(false);
  f.state.responded();
  assert.deepEqual(
    f.changes,
    before,
    'A response cannot transiently disconnect its own operation',
  );
});

await test('a new browser offline hint discards previous response evidence even without a native event', () => {
  let hint = true;
  const state = new Connectivity({ hint: () => hint, changed: () => {} });
  state.responded();
  hint = false;
  assert.equal(state.online, false);
  state.responded();
  assert.equal(state.online, true);
  state.hintChanged();
  assert.equal(state.online, false);
});

await test('pausing cancels the deadline and ignores late results; resuming retains the request budget', async (t) => {
  const held = deferred<boolean>();
  const f = fixture(t, () => held.promise);
  f.state.resume();
  f.state.pause();
  assert.equal(f.signals[0]?.aborted, true);
  held.resolve(true);
  await turn();
  t.mock.timers.tick(60_000);
  assert.equal(f.signals.length, 1);
  assert.equal(f.state.online, false);
  f.state.resume();
  await turn();
  assert.equal(f.signals.length, 2);
  assert.equal(f.state.online, true);
});

function browser(t: TestContext) {
  const notice = { hidden: false };
  const page = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    querySelectorAll: () => [notice],
  });
  const target = new EventTarget();
  const globals = { window: target, document: page };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const hint = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: false,
  });
  t.after(() => {
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (hint) Object.defineProperty(navigator, 'onLine', hint);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  return { page, target, notice };
}

await test('document lifecycle owns the cookie-free probe and disposes listeners on permanent departure', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000 });
  const { page, target, notice } = browser(t);
  const requests: RequestInit[] = [],
    transitions: boolean[] = [];
  target.addEventListener(networkOnlineEvent, () => transitions.push(true));
  target.addEventListener(networkOfflineEvent, () => transitions.push(false));
  mountOfflineNotice({
    previousElementSibling: { hasAttribute: () => true },
  } as unknown as HTMLElement);
  assert.equal(notice.hidden, false);
  t.mock.method(globalThis, 'fetch', (path: string, input: RequestInit) => {
    assert.equal(path, '/health/live');
    assert.equal(input.method, 'HEAD');
    assert.equal(input.credentials, 'omit');
    assert.equal(input.cache, 'no-store');
    assert.equal(input.redirect, 'error');
    assert.equal(input.body, undefined);
    requests.push(input);
    return Promise.resolve(new Response(null, { status: 503 }));
  });
  const close = startConnectivity();
  t.after(close);
  assert.equal(startConnectivity(), close);
  await turn();
  assert.equal(
    networkAvailable(),
    true,
    'An HTTP error proves reachability, not service readiness',
  );
  assert.equal(navigator.onLine, false);
  assert.equal(
    notice.hidden,
    true,
    'A real response removes the misleading offline notice',
  );
  assert.deepEqual(transitions, [false, true]);
  target.dispatchEvent(new Event('offline'));
  assert.equal(
    notice.hidden,
    false,
    'A new offline hint invalidates old evidence',
  );
  page.visibilityState = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(60_000);
  await turn();
  assert.equal(requests.length, 1);
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await turn();
  assert.equal(requests.length, 2);
  target.dispatchEvent(
    Object.assign(new Event('pagehide'), { persisted: true }),
  );
  t.mock.timers.tick(60_000);
  assert.equal(requests.length, 2);
  target.dispatchEvent(
    Object.assign(new Event('pageshow'), { persisted: true }),
  );
  await turn();
  assert.equal(requests.length, 3);
  target.dispatchEvent(
    Object.assign(new Event('pagehide'), { persisted: false }),
  );
  const before = transitions.length;
  target.dispatchEvent(new Event('offline'));
  target.dispatchEvent(new Event('focus'));
  target.dispatchEvent(new Event('pageshow'));
  page.dispatchEvent(new Event('resume'));
  t.mock.timers.tick(60_000);
  await turn();
  assert.equal(requests.length, 3);
  assert.equal(transitions.length, before);
});
