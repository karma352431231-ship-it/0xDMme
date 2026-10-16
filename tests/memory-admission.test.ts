import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';

await test('operation reservations share process headroom and release exactly once', (t) => {
  let available = 10_000;
  t.mock.method(process, 'availableMemory', () => available);
  const first = reserveOperationMemory(6_000);
  assert.ok(first);
  try {
    assert.equal(reserveOperationMemory(5_000), null);
    const second = reserveOperationMemory(4_000);
    assert.ok(second);
    try {
      available = 5_000;
      assert.equal(reserveOperationMemory(1), null);
    } finally {
      second();
      second();
    }
    assert.equal(reserveOperationMemory(1), null);
  } finally {
    first();
    first();
  }
  const recovered = reserveOperationMemory(5_000);
  assert.ok(recovered);
  try {
    assert.equal(reserveOperationMemory(1), null);
    for (const invalid of [0, -1, 0.5, NaN, Infinity])
      assert.throws(() => reserveOperationMemory(invalid), RangeError);
  } finally {
    recovered();
  }
});
