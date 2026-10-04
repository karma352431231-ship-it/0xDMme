import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupRetry } from '../src/client/groups/retry.ts';
await test('reconexões e avisos não criam repetição infinita de envios do grupo', () => {
  const retry = new GroupRetry();
  assert.equal(retry.take('A', 0), true);
  assert.equal(retry.take('A', 59_999), false);
  assert.equal(retry.take('B', 59_999), true);
  assert.equal(retry.take('A', 60_000), true);
  assert.equal(retry.take('A', 120_000), true);
  assert.equal(retry.take('A', 360_000), false);
  retry.reset('A');
  assert.equal(retry.take('A', 360_000), true);
  retry.clear();
  assert.equal(retry.take('A', 360_000), true);
  assert.equal(retry.take('B', 360_000), true);
});
