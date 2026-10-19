import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingGrowth } from '../src/client/communities/ranking-side-growth.ts';

await test('sidebar growth is an uncapped percent that starts from a base of 1', () => {
  for (const [participants, previous, expected] of [
    [1000, 0, 0],
    [2, 1, 100],
    [1000, 1, 99900],
    [0, 0, 0],
    [9, 3, 200],
    [3, 4, -25],
  ] as const)
    assert.equal(rankingGrowth({ participants, previous }), expected);
});
