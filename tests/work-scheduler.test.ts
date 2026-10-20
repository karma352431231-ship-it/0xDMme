import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkScheduler } from '../src/server/work-scheduler/index.ts';

await test('event during work is preserved and batches continue with fallback disabled', async () => {
  let release: () => void = () => {},
    rounds = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const scheduler = new WorkScheduler({
    fallbackMs: 0,
    failed: () => assert.fail('Falha inesperada'),
    work: async () => {
      rounds++;
      if (rounds === 1) await gate;
      return rounds < 3 ? Date.now() : null;
    },
  });
  const flushed = scheduler.flush();
  scheduler.wake();
  release();
  await flushed;
  assert.equal(rounds, 3);
  await scheduler.close();
});
await test('expiration wakes without a new event; shutdown cancels the next deadline', async () => {
  let rounds = 0,
    resolve: () => void = () => {};
  const done = new Promise<void>((accept) => {
    resolve = accept;
  });
  const scheduler = new WorkScheduler({
    fallbackMs: 0,
    failed: () => assert.fail('Falha inesperada'),
    work: () => {
      rounds++;
      if (rounds === 2) resolve();
      return Promise.resolve(rounds === 1 ? Date.now() + 20 : null);
    },
  });
  await scheduler.flush();
  // This referenced timeout keeps the test alive while the scheduler timer is unref'd.
  const deadline = setTimeout(resolve, 1000);
  await done;
  clearTimeout(deadline);
  assert.equal(rounds, 2);
  await scheduler.close();
  scheduler.wake();
  assert.equal(rounds, 2);
});
await test('failure is observable, cannot simulate completion and a new call recovers', async () => {
  let failure = true;
  const scheduler = new WorkScheduler({
    fallbackMs: 0,
    failed: () => {},
    work: () =>
      failure
        ? Promise.reject(new Error('interrompido'))
        : Promise.resolve(null),
  });
  await assert.rejects(scheduler.flush(), /interrompido/);
  failure = false;
  await scheduler.flush();
  await scheduler.close();
});
