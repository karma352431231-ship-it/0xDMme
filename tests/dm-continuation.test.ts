import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmContinuations } from '../src/client/communities/dm-continuation.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

await test('public continuations yield a task, coalesce and resume only when capacity is available', async () => {
  const done = deferred<void>();
  let available = false,
    calls = 0;
  const next = new DmContinuations({
    available: () => available,
    run: () => {
      calls++;
      done.resolve();
    },
  });
  next.request();
  next.request();
  assert.equal(calls, 0);
  available = true;
  next.resume();
  assert.equal(calls, 0, 'A continuation cannot run in the current input task');
  await waitForBoundary(done.promise);
  assert.equal(calls, 1);
  next.clear();
});
await test('clearing a scheduled public continuation closes its task and cannot revive an old session', async () => {
  let calls = 0;
  const next = new DmContinuations({
    available: () => true,
    run: () => {
      calls++;
    },
  });
  next.request();
  next.clear();
  const done = deferred<void>();
  const barrier = new DmContinuations({
    available: () => true,
    run: () => done.resolve(),
  });
  barrier.request();
  await waitForBoundary(done.promise);
  assert.equal(calls, 0);
  barrier.clear();
});

await test('browser posted tasks reuse capacity and cancel a queued old-session dispatch', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  let calls = 0;
  const done = deferred<void>();
  const next = new DmContinuations({
    available: () => true,
    run: () => {
      calls++;
      done.resolve();
    },
  });
  next.request();
  next.clear();
  next.request();
  await waitForBoundary(done.promise);
  assert.equal(calls, 1);
  next.clear();
});
