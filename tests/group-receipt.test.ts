import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupReceipt } from '../src/client/groups/receipt.ts';
import type { GroupChange } from '../src/client/groups/receipt.ts';

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
