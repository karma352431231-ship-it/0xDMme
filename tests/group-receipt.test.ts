import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupReceipt } from '../src/client/groups/receipt.ts';
import type { GroupChange } from '../src/client/groups/receipt.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture(visible: string | null) {
  const calls: string[] = [];
  const receipt = new GroupReceipt({
    visibleGroup: () => visible,
    readSelected: (id) => {
      calls.push('read:' + id);
      return Promise.resolve();
    },
    receipts: () => {
      calls.push('receipts');
      return Promise.resolve();
    },
    reads: () => {
      calls.push('reads');
      return Promise.resolve();
    },
    states: () => {
      calls.push('states');
      return Promise.resolve();
    },
    directory: () => {
      calls.push('directory');
      return Promise.resolve();
    },
    changed: () => calls.push('changed'),
  });
  return { receipt, calls };
}

await test('group content and receipts touch only the open group and counters; a general wakeup refreshes the directory', async () => {
  const cases: {
    visible: string | null;
    change: GroupChange;
    calls: string[];
  }[] = [
    { visible: 'g', change: 'content', calls: ['read:g', 'states', 'changed'] },
    {
      visible: 'g',
      change: 'receipts',
      calls: ['receipts', 'states', 'changed'],
    },
    { visible: null, change: 'content', calls: ['states', 'changed'] },
    { visible: null, change: 'receipts', calls: ['states', 'changed'] },
    { visible: 'g', change: 'all', calls: ['directory'] },
    { visible: null, change: 'all', calls: ['directory'] },
  ];
  for (const { visible, change, calls } of cases) {
    const f = fixture(visible);
    await f.receipt.changed(change);
    assert.deepEqual(f.calls, calls, `${change}, open: ${visible ?? 'none'}`);
  }
  const f = fixture('g');
  await f.receipt.counters();
  assert.deepEqual(f.calls, ['states', 'changed']);
});

await test('verified group content releases a waiting sender before querying counters', async () => {
  const calls: string[] = [];
  let sending = false;
  const receipt = new GroupReceipt({
    visibleGroup: () => 'g',
    readSelected: () => {
      calls.push('verified-content');
      sending = true;
      return Promise.resolve();
    },
    receipts: () => {
      calls.push('receipts');
      return Promise.resolve();
    },
    reads: () => {
      calls.push('reads');
      return Promise.resolve();
    },
    states: () => {
      calls.push('states');
      return Promise.resolve();
    },
    directory: async () => {},
    changed: () => calls.push('changed'),
    ...{
      schedule: {
        shouldYield: () => sending,
        pending: () => {
          calls.push('queued');
        },
      },
    },
  });
  await receipt.changed('content');
  assert.deepEqual(calls, ['verified-content', 'queued']);
  sending = false;
  await receipt.counters();
  assert.deepEqual(calls, ['verified-content', 'queued', 'states', 'changed']);
});

await test('deferred group read metadata coalesces receipt hints without creating read feedback', async () => {
  const calls: string[] = [];
  let sending = true;
  const receipt = new GroupReceipt({
    visibleGroup: () => 'g',
    readSelected: async () => {},
    reads: () => {
      calls.push('read-state');
      return Promise.resolve();
    },
    receipts: () => {
      calls.push('receipts');
      return Promise.resolve();
    },
    states: () => {
      calls.push('states');
      return Promise.resolve();
    },
    directory: async () => {},
    changed: () => {},
    schedule: { shouldYield: () => sending, pending: () => {} },
  });
  receipt.metadata.deferred('g');
  for (let index = 0; index < 3; index++) await receipt.changed('receipts');
  assert.deepEqual(calls, []);
  sending = false;
  await receipt.counters();
  assert.deepEqual(calls, ['read-state', 'states']);
  await receipt.changed('receipts');
  assert.deepEqual(calls, ['read-state', 'states', 'receipts', 'states']);
});

await test('navigation and lifecycle reset discard old selected metadata, and failed work remains explicitly retryable', async () => {
  const held = deferred<void>();
  let group = 'g',
    reads = 0,
    states = 0,
    fail = true;
  const receipt = new GroupReceipt({
    visibleGroup: () => group,
    readSelected: async () => {},
    reads: async () => {
      reads++;
      if (fail) throw new Error('Synthetic metadata failure');
      await held.promise;
    },
    receipts: async () => {},
    states: () => {
      states++;
      return Promise.resolve();
    },
    directory: async () => {},
    changed: () => {},
  });
  receipt.metadata.deferred('g');
  await assert.rejects(receipt.counters(), /Synthetic metadata failure/);
  assert.equal(states, 0);
  fail = false;
  const running = receipt.counters();
  receipt.reset();
  held.resolve();
  await running;
  assert.equal(reads, 2);
  assert.equal(
    states,
    0,
    'An old completion cannot publish into a reset session.',
  );
  receipt.metadata.deferred('g');
  group = 'another';
  await receipt.counters();
  assert.equal(reads, 2, 'The old group is not queried after navigation.');
  assert.equal(states, 1);
});
