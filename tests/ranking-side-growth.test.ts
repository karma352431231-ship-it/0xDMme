import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingGrowth } from '../src/client/communities/ranking-side-growth.ts';

await test('sidebar growth is an uncapped percent with an empty period counted as 1', () => {
  for (const [participants, previous, expected] of [
    [1000, 0, 100000],
    [1000, 1, 99900],
    [0, 0, 0],
    [9, 3, 200],
    [3, 4, -25],
  ] as const)
    assert.equal(rankingGrowth({ participants, previous }), expected);
});
