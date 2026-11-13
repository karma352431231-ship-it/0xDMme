import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  removeMessageBatch,
  verifyMessageRemovals,
} from '../src/client/message-removal-batch/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('deletions start concurrently, stay bounded and all settle before one verification', async () => {
  const targets = Array.from({ length: 9 }, (_, i) => ({ id: String(i) }));
  const firstWave = deferred<void>();
  const calls: string[] = [];
  let active = 0,
    peak = 0,
    reads = 0;
  const work = removeMessageBatch(targets, async ({ id }) => {
    calls.push(id);
    peak = Math.max(peak, ++active);
    await firstWave.promise;
    active--;
    if (id === '1') throw new Error('Synthetic lost reply');
    if (id === '5')
      throw new ApiResponseError({
        operation: 'delete',
        failure: 'http',
        status: 409,
      });
  });
  assert.deepEqual(
    calls,
    ['0', '1', '2', '3'],
    'a later deletion starts while the first is pending',
  );
  assert.equal(reads, 0);
  firstWave.resolve();
  const result = await verifyMessageRemovals(await work, {
    refresh: () => {
      reads++;
      assert.equal(calls.length, 9);
      assert.equal(active, 0);
      return Promise.resolve();
    },
    done: () => true,
  });
  assert.equal(peak, 4);
  assert.equal(reads, 1);
  assert.equal(
    result[1]!.status,
    'fulfilled',
    'verified deletion settles a lost reply',
  );
  assert.equal(
    result[5]!.status,
    'rejected',
    'a server refusal is still reported',
  );
  assert.deepEqual(
    result.map((r) => r.id),
    targets.map((r) => r.id),
  );
});
await test('invalid batches send nothing; failed verification never confirms an uncertain deletion', async () => {
  let calls = 0;
  for (const targets of [
    [{ id: 'same' }, { id: 'same' }],
    Array.from({ length: 65 }, (_, i) => ({ id: String(i) })),
  ])
    await assert.rejects(
      removeMessageBatch(targets, () => {
        calls++;
        return Promise.resolve();
      }),
    );
  assert.equal(calls, 0);
  const reason = new Error('Reply lost');
  await assert.rejects(
    verifyMessageRemovals([{ id: 'x', status: 'rejected', reason }], {
      refresh: () => Promise.reject(new Error('Read unavailable')),
      done: () => true,
    }),
    (error) => error === reason,
  );
});
