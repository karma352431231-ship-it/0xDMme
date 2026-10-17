import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageWarmup } from '../src/client/messages/warmup.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let available = true;
  const calls: number[] = [],
    errors: unknown[] = [];
  const operations = {
    available: () => available,
    run: (step: () => Promise<void>) => step(),
    failed: (error: unknown) => {
      errors.push(error);
    },
    changed() {},
    steps: [0, 1, 2, 3].map((index) => () => {
      calls.push(index);
      return Promise.resolve();
    }) as [
      () => Promise<void>,
      () => Promise<void>,
      () => Promise<void>,
      () => Promise<void>,
    ],
  };
  const warmup = new MessageWarmup(operations);
  t.after(() => warmup.reset());
  return {
    warmup,
    operations,
    calls,
    errors,
    available: (value: boolean) => {
      available = value;
    },
  };
}

await test('startup maintenance yields between its four bounded steps', async (t) => {
  const f = fixture(t);
  assert.equal(f.warmup.ready, false);
  f.warmup.request();
  for (let index = 0; index < 4; index++) {
    assert.equal(f.calls.length, index);
    t.mock.timers.tick(1000);
    await turn();
    assert.deepEqual(
      f.calls,
      Array.from({ length: index + 1 }, (_, value) => value),
    );
  }
  t.mock.timers.tick(10000);
  await turn();
  assert.equal(f.calls.length, 4);
});

await test('foreground work postpones a maintenance step instead of losing it', async (t) => {
  const f = fixture(t);
  f.warmup.request();
  f.available(false);
  t.mock.timers.tick(1000);
  await turn();
  assert.deepEqual(f.calls, []);
  f.available(true);
  f.warmup.resume();
  t.mock.timers.tick(1000);
  await turn();
  assert.deepEqual(f.calls, [0]);
});

await test('logout cancels deferred steps while an old operation settles', async (t) => {
  const f = fixture(t),
    held = deferred<void>();
  f.operations.run = () => held.promise;
  f.warmup.request();
  t.mock.timers.tick(1000);
  await turn();
  f.warmup.reset();
  held.resolve();
  await turn();
  t.mock.timers.tick(10000);
  await turn();
  assert.equal(f.warmup.ready, false);
  assert.deepEqual(f.calls, []);
});

await test('a failed maintenance adapter reports its error without an unhandled task', async (t) => {
  const f = fixture(t);
  const failure = new Error('Synthetic failure');
  f.operations.run = () => Promise.reject(failure);
  f.warmup.request();
  t.mock.timers.tick(1000);
  await turn();
  assert.deepEqual(f.errors, [failure]);
});
