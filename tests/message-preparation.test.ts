import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HistoryPreparation } from '../src/client/messages/preparation.ts';

await test('completed preparation stays idle until new activity without restarting for presence maintenance', () => {
  const preparation = new HistoryPreparation();
  const direct = preparation.next()!;
  assert.equal(direct.kind, 'direct');
  preparation.complete(direct, false);
  const groups = preparation.next()!;
  assert.equal(groups.kind, 'groups');
  preparation.complete(groups, false);
  assert.equal(preparation.pending, false);
  assert.equal(preparation.next(), null);
  preparation.request();
  assert.equal(preparation.pending, true);
  assert.equal(preparation.next()?.kind, 'direct');
});

await test('partial pages alternate areas; cancellation or failure keeps the same page pending', () => {
  const preparation = new HistoryPreparation();
  const direct = preparation.next()!;
  assert.deepEqual(preparation.next(), direct);
  preparation.complete(direct, true);
  const groups = preparation.next()!;
  assert.equal(groups.kind, 'groups');
  preparation.complete(groups, false);
  assert.equal(preparation.next()?.kind, 'direct');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});

await test('notice during a page or session change cannot be lost through an old completion', () => {
  const preparation = new HistoryPreparation();
  const old = preparation.next()!;
  preparation.request();
  preparation.complete(old, false);
  assert.equal(preparation.next()?.kind, 'direct');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.next()?.kind, 'groups');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});

await test('a scoped wakeup keeps completed unrelated histories idle', () => {
  const preparation = new HistoryPreparation();
  preparation.complete(preparation.next()!, false);
  preparation.complete(preparation.next()!, false);
  preparation.request('groups');
  assert.equal(preparation.next()?.kind, 'groups');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});

await test('a direct hint cannot invalidate an active group receipt completion', () => {
  const preparation = new HistoryPreparation();
  preparation.complete(preparation.next()!, false);
  const group = preparation.next()!;
  preparation.request('direct');
  preparation.complete(group, false);
  assert.equal(preparation.next()?.kind, 'direct');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});

await test('a demanded area runs before alternating speculative preparation', () => {
  const preparation = new HistoryPreparation();
  const direct = preparation.next()!;
  preparation.complete(direct, true);
  assert.equal(preparation.next()?.kind, 'groups');
  assert.equal(preparation.next(new Set(['direct']))?.kind, 'direct');
  preparation.complete(preparation.next(new Set(['direct']))!, false);
  assert.equal(preparation.has('direct'), false);
  assert.equal(preparation.next(new Set(['direct']))?.kind, 'groups');
});
