import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withAutomaticRetries } from '../src/client/attachment-ui/media.ts';

function failing(times: number) {
  let calls = 0;
  return {
    work: () => {
      calls++;
      return calls <= times
        ? Promise.reject(new Error('not ready'))
        : Promise.resolve();
    },
    calls: () => calls,
  };
}

await test('a preview that fails while the conversation settles loads on a later attempt', async () => {
  const load = failing(2);
  await withAutomaticRetries(load.work, () => true, [0, 0]);
  assert.equal(load.calls(), 3);
});

await test('retries are bounded and stop once the conversation is left', async () => {
  const always = failing(10);
  await assert.rejects(withAutomaticRetries(always.work, () => true, [0, 0]));
  assert.equal(always.calls(), 3);
  const left = failing(10);
  await assert.rejects(withAutomaticRetries(left.work, () => false, [0, 0]));
  assert.equal(left.calls(), 1);
});
