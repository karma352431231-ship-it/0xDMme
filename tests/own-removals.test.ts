import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OwnRemovals,
  removalFailure,
} from '../src/client/own-removals/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';

const rows = [
  { id: 'a' },
  { id: 'b' },
  { id: 'r', relation: { id: 'b' } },
  { id: 'c' },
];
const ids = (list: readonly { id: string }[]) => list.map((row) => row.id);

await test('an own deletion hides only its row and what points at it, once accepted', () => {
  const removals = new OwnRemovals();
  assert.equal(removals.begin('chat', 'b'), true);
  assert.equal(removals.begin('chat', 'b'), false, 'repeated tap');
  assert.deepEqual(ids(removals.visible(rows)), ['a', 'b', 'r', 'c']);
  removals.accepted('b');
  // Also against reads that began before the deletion.
  assert.deepEqual(ids(removals.visible(rows)), ['a', 'c']);
});

await test('a refusal restores nothing hidden; a lost reply waits for the verified read', () => {
  const removals = new OwnRemovals();
  removals.begin('chat', 'b');
  removals.failed('b', false);
  assert.equal(removals.expecting(), false);
  assert.deepEqual(ids(removals.visible(rows)), ['a', 'b', 'r', 'c']);
  removals.begin('chat', 'b');
  removals.failed('b', true);
  assert.equal(removals.expecting(), true);
  assert.deepEqual(ids(removals.visible(rows)), ['a', 'b', 'r', 'c']);
  // The read still shows it: the deletion did not happen.
  removals.settle('chat', rows);
  assert.equal(removals.done('b'), false);
  assert.equal(removals.expecting(), false);
  removals.begin('chat', 'c');
  removals.failed('c', true);
  removals.settle('chat', [{ id: 'a' }]);
  assert.equal(removals.done('c'), true, 'deleted despite the lost reply');
});

await test('settling follows its own conversation and keeps the echo window bounded', () => {
  let now = 0;
  const removals = new OwnRemovals(() => now);
  removals.begin('chat', 'b');
  removals.begin('other', 'x');
  removals.accepted('b');
  removals.accepted('x');
  // An older read that still has the row cannot settle or reinsert it.
  removals.settle('chat', rows);
  assert.equal(removals.done('b'), false);
  removals.settle('chat', [{ id: 'a' }]);
  assert.equal(removals.done('b'), true);
  assert.equal(removals.done('x'), false, 'other conversation untouched');
  removals.settle('other', []);
  assert.equal(removals.expecting(), true, 'its bare notice may still come');
  now = 10_001;
  assert.equal(removals.expecting(), false);
});

await test('requests still in flight are not settled by a read', () => {
  const removals = new OwnRemovals();
  removals.begin('chat', 'b');
  removals.settle('chat', [{ id: 'a' }]);
  assert.equal(removals.done('b'), false);
  removals.accepted('b');
  assert.deepEqual(ids(removals.visible(rows)), ['a', 'c']);
});

await test('failures split into refusal, lost access and an unknown outcome', () => {
  const http = (status: number) =>
    new ApiResponseError({ operation: 'delete', status, failure: 'http' });
  assert.equal(removalFailure(http(409)), 'refused');
  assert.equal(removalFailure(http(400)), 'refused');
  for (const status of [401, 403, 410, 423])
    assert.equal(removalFailure(http(status)), 'unauthorized');
  assert.equal(
    removalFailure(
      new ApiResponseError({
        operation: 'delete',
        status: 0,
        failure: 'network',
      }),
    ),
    'uncertain',
  );
  assert.equal(removalFailure(new TypeError('Failed to fetch')), 'uncertain');
});
