import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmProjections } from '../src/client/communities/dm-projections.ts';
import type { DmProjection } from '../src/client/communities/dm-projections.ts';

function projection(): DmProjection {
  const profile = {
    id: crypto.randomUUID(),
    handle: 'synthetic',
    avatar: null,
  };
  return {
    profile,
    value: {
      peer: profile,
      requester: crypto.randomUUID(),
      state: 'approved',
      revision: 1,
      blocked: false,
      blockRevision: 0,
      canSend: true,
    },
    page: {
      items: [],
      reactionReads: [],
      next: null,
      self: crypto.randomUUID(),
    },
    offline: false,
  };
}
const eligible = { current: true, live: true };
await test('public memory projections require live current recent authorization and invalidate retained blocked content', () => {
  const cache = new DmProjections(),
    data = projection();
  cache.remember(data, eligible);
  assert.equal(cache.get(data.profile.id, true)?.page, data.page);
  assert.equal(cache.get(data.profile.id, false), null);
  data.value = { ...data.value, blocked: true, canSend: false };
  cache.remember(data, eligible);
  assert.equal(cache.get(data.profile.id, true), null);
  for (const state of [
    { ...eligible, current: false },
    { ...eligible, live: false },
  ]) {
    const next = projection();
    cache.remember(next, state);
    assert.equal(cache.get(next.profile.id, true), null);
  }
});
await test('public memory projections enforce entry and byte budgets and clear on account invalidation', () => {
  const cache = new DmProjections(),
    entries = Array.from({ length: 9 }, projection);
  for (const data of entries) cache.remember(data, eligible);
  assert.equal(cache.get(entries[0]!.profile.id, true), null);
  assert.ok(cache.get(entries.at(-1)!.profile.id, true));
  const oversized = projection();
  oversized.profile.handle = 'x'.repeat(1_048_577);
  cache.remember(oversized, eligible);
  assert.equal(cache.get(oversized.profile.id, true), null);
  cache.clear();
  for (const data of entries)
    assert.equal(cache.get(data.profile.id, true), null);
});
