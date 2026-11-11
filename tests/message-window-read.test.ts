import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMessageWindow } from '../src/client/messages/window-read.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

const items: MessageItem[] = Array.from({ length: 5 }, (_, i) => ({
  id: String(i),
  kind: 'text',
  sender: 'sender',
  recipient: 'recipient',
  sequence: i + 1,
  hash: 'a'.repeat(64),
  deleted: false,
  deletion: null,
  sender_revision: 1,
  recipient_revision: 1,
  queue_active: false,
  status: 'received',
}));
await test('local cached reads overlap within a two-item budget while publication preserves verified order', async () => {
  const gates = items.map(() => deferred<void>());
  const paired = deferred<void>();
  let active = 0,
    peak = 0;
  const reading = readMessageWindow({
    items,
    cached: async (item) => {
      active++;
      peak = Math.max(peak, active);
      if (active === 2) paired.resolve();
      await gates[Number(item.id)]!.promise;
      active--;
      return item.id === '1' ? null : { id: item.id };
    },
    missing: (missing) => {
      assert.equal(active, 0);
      assert.deepEqual(
        missing.map((item) => item.id),
        ['1'],
      );
      return Promise.resolve(new Map([['1', { id: '1' }]]));
    },
    complete: (views) => {
      assert.deepEqual(
        views.map((v) => v.id),
        items.map((i) => i.id),
      );
      return Promise.resolve();
    },
  });
  await waitForBoundary(paired.promise);
  for (const gate of gates.toReversed()) gate.resolve();
  assert.deepEqual(
    (await reading).map((v) => v.id),
    items.map((i) => i.id),
  );
  assert.equal(peak, 2);
});

await test('a failed cache verification drains its pair, starts no further reads and publishes nothing', async () => {
  const pending = deferred<void>(),
    paired = deferred<void>();
  let reads = 0,
    settled = false;
  const reading = readMessageWindow<{ id: string }>({
    items,
    cached: async (item) => {
      reads++;
      if (item.id === '0') throw new Error('Cached receipt differs.');
      paired.resolve();
      await pending.promise;
      return { id: item.id };
    },
    missing: () => assert.fail('No missing work after a failed receipt.'),
    complete: () => assert.fail('No publication after a failed receipt.'),
  });
  const rejected = assert.rejects(
    reading.finally(() => {
      settled = true;
    }),
    /Cached receipt differs/,
  );
  await waitForBoundary(paired.promise);
  await Promise.resolve();
  assert.equal(settled, false);
  pending.resolve();
  await rejected;
  assert.equal(reads, 2);
});
