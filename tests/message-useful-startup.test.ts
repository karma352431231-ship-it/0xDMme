import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsefulStartup } from '../src/client/messages/useful-startup.ts';
import { MessageWarmup } from '../src/client/messages/warmup.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture() {
  let available = true;
  let settled = 0;
  const calls: string[] = [],
    errors: unknown[] = [];
  const options = {
    available: () => available,
    run: async (step: () => Promise<void>) => {
      await step();
      return true;
    },
    previews: () => {
      calls.push('previews');
      return Promise.resolve(true);
    },
    groups: () => {
      calls.push('groups');
      return Promise.resolve();
    },
    settled: () => {
      settled++;
    },
    failed: (error: unknown) => {
      errors.push(error);
    },
  };
  const startup = new UsefulStartup(options);
  return {
    startup,
    options,
    calls,
    errors,
    settled: () => settled,
    available: (value: boolean) => {
      available = value;
    },
  };
}

await test('reset before scheduled admission cannot run or complete a cancelled startup', async () => {
  const f = fixture();
  f.startup.request();
  f.startup.reset();
  await turn();
  assert.deepEqual(f.calls, []);
  assert.equal(f.settled(), 0);
  assert.equal(f.startup.pending, false);
});

await test('ready previews and groups publish before unrelated maintenance, with no maintenance-step delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(),
    held = deferred<void>();
  let maintenance = false;
  const warmup = new MessageWarmup({
    available: () => !f.startup.pending,
    run: (step) => step(),
    changed() {},
    failed: (error) => {
      throw error;
    },
    steps: [
      () => {
        maintenance = true;
        return held.promise;
      },
    ],
  });
  t.after(() => {
    f.startup.reset();
    warmup.reset();
    held.resolve();
  });
  f.startup.request();
  warmup.request();
  await turn();
  assert.deepEqual(new Set(f.calls), new Set(['previews', 'groups']));
  assert.equal(f.settled(), 1);
  assert.equal(maintenance, false);
  warmup.resume();
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(maintenance, true);
  assert.equal(
    f.startup.pending,
    false,
    'An unresolved maintenance owner cannot delay useful-directory completion',
  );
});

await test('foreground/hidden/disconnected admission retains a pending startup until explicitly resumed', async () => {
  const f = fixture();
  f.available(false);
  f.startup.request();
  await turn();
  assert.deepEqual(f.calls, []);
  assert.equal(f.startup.pending, true);
  f.available(true);
  f.startup.resume();
  await turn();
  assert.equal(f.startup.pending, false);
  assert.equal(f.settled(), 1);
});

await test('a selected-chat request between startup steps runs first without losing the directory request', async () => {
  const f = fixture(),
    preview = deferred<boolean>();
  f.options.previews = () => preview.promise;
  f.startup.request();
  await turn();
  f.available(false);
  preview.resolve(true);
  await turn();
  assert.equal(f.calls.includes('groups'), false);
  assert.equal(f.startup.pending, true);
  f.available(true);
  f.startup.resume();
  await turn();
  assert.deepEqual(f.calls, ['groups']);
});

await test('lost admission is retained without polling or a retry loop', async () => {
  const f = fixture();
  let attempts = 0;
  f.options.run = () => {
    attempts++;
    return Promise.resolve(false);
  };
  f.startup.request();
  await turn();
  await turn();
  assert.equal(attempts, 1);
  assert.equal(f.startup.pending, true);
  f.options.run = async (step) => {
    await step();
    return true;
  };
  f.startup.resume();
  await turn();
  assert.equal(f.startup.pending, false);
});

await test('logout during an admitted read drops stale continuation; a new session can still start', async () => {
  const f = fixture(),
    held = deferred<boolean>();
  f.options.previews = () => held.promise;
  f.startup.request();
  await turn();
  f.startup.reset();
  f.options.previews = () => Promise.resolve(true);
  f.startup.request();
  held.resolve(true);
  await turn();
  assert.deepEqual(f.calls, ['groups']);
  assert.equal(f.settled(), 1);
  assert.equal(f.startup.pending, false);
});

await test('refresh bursts coalesce into at most one complete follow-up pass', async () => {
  const f = fixture(),
    held = deferred<boolean>();
  let reads = 0;
  f.options.previews = () =>
    ++reads === 1 ? held.promise : Promise.resolve(true);
  f.startup.request();
  await turn();
  for (let n = 0; n < 20; n++) f.startup.request();
  held.resolve(true);
  await turn();
  assert.equal(reads, 2);
  assert.equal(f.calls.filter((kind) => kind === 'groups').length, 2);
  assert.equal(f.startup.pending, false);
});

await test('a failed preview does not suppress group publication or trigger automatic retries', async () => {
  const f = fixture(),
    error = new Error('Synthetic confirmation failure');
  f.options.previews = () => Promise.reject(error);
  f.startup.request();
  await turn();
  assert.deepEqual(f.errors, [error]);
  assert.deepEqual(f.calls, ['groups']);
  assert.equal(f.settled(), 1);
  assert.equal(f.startup.pending, false);
});
