import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createDmInbox } from '../src/client/communities/dm-inbox.ts';
import type { SocialRelation } from '../src/shared/social-dm/index.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function onlineBrowser(t: TestContext) {
  const document = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    online = Object.getOwnPropertyDescriptor(navigator, 'onLine'),
    window = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browserDocument = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: browserDocument,
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  t.after(() => {
    if (document) Object.defineProperty(globalThis, 'document', document);
    else Reflect.deleteProperty(globalThis, 'document');
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else Reflect.deleteProperty(navigator, 'onLine');
    if (window) Object.defineProperty(globalThis, 'window', window);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return browserDocument;
}
function relation(): SocialRelation {
  return {
    peer: { id: crypto.randomUUID(), handle: 'synthetic', avatar: null },
    requester: crypto.randomUUID(),
    state: 'approved',
    revision: 1,
    blocked: false,
    blockRevision: 0,
    canSend: true,
  };
}

await test('the handle account inbox receives before notification projection without mounting or selecting a chat', async (t) => {
  onlineBrowser(t);
  const held = deferred<void>(),
    row = relation(),
    counts: number[] = [];
  let receipts = 0,
    projections = 0;
  const inbox = createDmInbox(
    {
      list: (after) =>
        Promise.resolve({ items: [row], next: after ? null : 'next' }),
      receive: async () => {
        await held.promise;
        receipts++;
      },
      unread: () => {
        assert.ok(
          receipts > 0,
          'History must be received before notification projection',
        );
        projections++;
        return Promise.resolve(1);
      },
    },
    (count) => counts.push(count),
  );
  inbox.reset(true);
  inbox.start();
  inbox.request();
  inbox.request();
  await turn();
  assert.equal(projections, 0);
  assert.equal(counts.at(-1), 0);
  held.resolve();
  await turn();
  assert.equal(
    receipts,
    2,
    'One receipt pass per coalesced wakeup, not per directory page',
  );
  assert.equal(projections, 4);
  assert.equal(
    counts.at(-1),
    2,
    'Receiving does not advance local read cursors',
  );
});

for (const invalidated of [false, true])
  await test(`handle receipt failure or session loss cannot publish notification state: invalidated=${invalidated}`, async (t) => {
    onlineBrowser(t);
    const held = deferred<void>(),
      counts: number[] = [];
    let projections = 0;
    const inbox = createDmInbox(
      {
        list: () => Promise.resolve({ items: [relation()], next: null }),
        receive: () => held.promise,
        unread: () => {
          projections++;
          return Promise.resolve(1);
        },
      },
      (count) => counts.push(count),
    );
    inbox.reset(true);
    inbox.start();
    await turn();
    if (invalidated) inbox.reset(false);
    held.reject(new Error('Current authority unavailable'));
    await turn();
    assert.equal(projections, 0);
    assert.equal(counts.at(-1), 0);
  });

await test('an empty handle directory never initializes an alias or receives nonexistent history', async (t) => {
  onlineBrowser(t);
  let receipts = 0;
  const inbox = createDmInbox(
    {
      list: () => Promise.resolve({ items: [], next: null }),
      receive: () => {
        receipts++;
        return Promise.resolve();
      },
      unread: () => Promise.resolve(0),
    },
    () => {},
  );
  inbox.reset(true);
  inbox.start();
  await turn();
  assert.equal(receipts, 0);
});

await test('returning to a visible app resumes handle receipt without entering a DM view and logout removes wakeups', async (t) => {
  const browserDocument = onlineBrowser(t);
  browserDocument.visibilityState = 'hidden';
  let receipts = 0;
  const inbox = createDmInbox(
    {
      list: () => Promise.resolve({ items: [relation()], next: null }),
      receive: () => {
        receipts++;
        return Promise.resolve();
      },
      unread: () => Promise.resolve(1),
    },
    () => {},
  );
  inbox.reset(true);
  inbox.start();
  inbox.request();
  await turn();
  assert.equal(receipts, 0);
  browserDocument.visibilityState = 'visible';
  browserDocument.dispatchEvent(new Event('visibilitychange'));
  await turn();
  assert.equal(receipts, 1);
  inbox.reset(false);
  browserDocument.dispatchEvent(new Event('visibilitychange'));
  await turn();
  assert.equal(receipts, 1);
});
