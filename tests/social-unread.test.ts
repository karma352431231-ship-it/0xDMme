import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dmUnreadCount } from '../src/client/social-dm/unread.ts';
import { DmUnreadUpdates } from '../src/client/communities/dm-unread-updates.ts';
import { deferred } from './fixtures/deferred.ts';

await test('public unread counts use local cursors, deduplicate metadata and reject unrelated or oversized responses', () => {
  const peer = crypto.randomUUID(),
    other = crypto.randomUUID();
  const cursors = [
    { peer, through: 3 },
    { peer: other, through: 0 },
  ];
  assert.equal(
    dmUnreadCount(
      [
        { peer, sequences: [1, 3, 4, 4, 7] },
        { peer: other, sequences: [2] },
      ],
      cursors,
    ),
    3,
  );
  assert.throws(() =>
    dmUnreadCount([{ peer: crypto.randomUUID(), sequences: [4] }], cursors),
  );
  assert.throws(() =>
    dmUnreadCount(
      [{ peer, sequences: Array.from({ length: 101 }, (_, i) => i + 1) }],
      cursors,
    ),
  );
  assert.throws(() => dmUnreadCount([{ peer, sequences: [-1] }], cursors));
  assert.throws(() =>
    dmUnreadCount(
      [
        { peer, sequences: [] },
        { peer, sequences: [] },
      ],
      cursors,
    ),
  );
});

await test('public badge reads coalesce live hints across pages and discard a late response after session loss', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  let held = deferred<number>();
  const counts: number[] = [],
    pages: (string | null)[] = [];
  let hold = true,
    concurrency = 0,
    maximum = 0;
  const updates = new DmUnreadUpdates({
    page: (after) => {
      pages.push(after);
      return Promise.resolve({ peers: ['peer'], next: after ? null : 'next' });
    },
    count: async () => {
      concurrency++;
      maximum = Math.max(maximum, concurrency);
      const count = hold ? await held.promise : 2;
      concurrency--;
      return count;
    },
    changed: (count) => counts.push(count),
  });
  updates.reset(true);
  updates.request();
  assert.deepEqual(
    pages,
    [],
    'optional public reads wait for foreground readiness',
  );
  updates.start();
  updates.request();
  updates.request();
  updates.request();
  hold = false;
  held.resolve(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 1);
  assert.equal(counts.at(-1), 4);
  assert.deepEqual(pages, [null, 'next', null, 'next']);
  hold = true;
  held = deferred<number>();
  updates.request();
  await Promise.resolve();
  const pagesBeforeReset = pages.length;
  updates.reset(false);
  held.resolve(2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(counts.at(-1), 0);
  assert.equal(
    pages.length,
    pagesBeforeReset,
    'late counts cannot page through the next session',
  );
});
