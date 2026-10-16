import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import { MediaExecutionQueue } from '../src/server/community-media/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('media execution fills CPU/memory slots while serializing each media scope', async (t) => {
  t.mock.method(os, 'availableParallelism', () => 12);
  t.mock.method(os, 'totalmem', () => 64 * 1024 ** 3);
  t.mock.method(process, 'constrainedMemory', () => 32 * 1024 ** 3);
  t.mock.method(process, 'availableMemory', () => 128 * 1024 ** 2);
  const queue = new MediaExecutionQueue();
  const gates = Array.from({ length: 5 }, () => deferred<string>());
  const signal = new AbortController().signal;
  const started: number[] = [];
  const jobs = ['a', 'a', 'b', 'c', 'd'].map((key, index) =>
    queue.run({
      key,
      signal,
      work: () => {
        started.push(index);
        return gates[index]!.promise;
      },
    }),
  );
  try {
    assert.deepEqual(started, [0, 2, 3]);
    gates[2]!.resolve('b');
    await jobs[2];
    assert.deepEqual(started, [0, 2, 3, 4]);
    gates[0]!.resolve('a');
    await jobs[0];
    assert.deepEqual(started, [0, 2, 3, 4, 1]);
  } finally {
    for (const gate of gates) gate.resolve('done');
    await Promise.all(jobs);
  }
});

await test('queued media cancellation frees its reservation; failures and resource pressure recover', async (t) => {
  t.mock.method(os, 'availableParallelism', () => 12);
  t.mock.method(os, 'totalmem', () => 64 * 1024 ** 3);
  t.mock.method(process, 'constrainedMemory', () => 8 * 1024 ** 3);
  let memory = 2 * 65_536,
    ran = 0;
  t.mock.method(process, 'availableMemory', () => memory);
  const queue = new MediaExecutionQueue(),
    gate = deferred<string>();
  const first = queue.run({
    key: 'first',
    signal: new AbortController().signal,
    work: () => gate.promise,
  });
  const abort = new AbortController();
  const second = queue.run({
    key: 'second',
    signal: abort.signal,
    work: () => {
      ran++;
      return Promise.resolve('unexpected');
    },
  });
  const reason = new Error('Synthetic cancellation.');
  abort.abort(reason);
  await assert.rejects(second, reason);
  assert.equal(ran, 0);
  memory = 0;
  await assert.rejects(
    queue.run({
      key: 'pressure',
      signal: new AbortController().signal,
      work: () => Promise.resolve('unexpected'),
    }),
    { status: 503 },
  );
  memory = 2 * 65_536;
  const failure = new Error('Synthetic encoder failure.');
  const failed = queue.run({
    key: 'failure',
    signal: new AbortController().signal,
    work: () => Promise.reject(failure),
  });
  const checked = assert.rejects(failed, failure);
  gate.resolve('first');
  assert.equal(await first, 'first');
  await checked;
  memory = 65_536;
  assert.equal(
    await queue.run({
      key: 'recovered',
      signal: new AbortController().signal,
      work: () => Promise.resolve('ready'),
    }),
    'ready',
  );
  assert.throws(
    () =>
      queue.run({
        key: 'aborted',
        signal: abort.signal,
        work: () => Promise.resolve('unexpected'),
      }),
    reason,
  );
});
