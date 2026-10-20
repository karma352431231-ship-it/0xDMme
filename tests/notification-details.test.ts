import { privatePushCandidates } from '../src/shared/private-notification/index.ts';
import type { PrivatePushCandidate } from '../src/shared/private-notification/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationDelivery } from '../src/client/pwa/notification.ts';
import type { PrivateNotificationDetail } from '../src/client/notification-private/index.ts';
import { deferred } from './fixtures/deferred.ts';
import type { TestContext } from 'node:test';

function fixture(t: TestContext, sound = true) {
  const candidate = {
    kind: 'direct' as const,
    id: crypto.randomUUID(),
    peer: crypto.randomUUID(),
  };
  const inspection = {
    allowed: true,
    call: false,
    publicScope: 'a'.repeat(64),
    privateCandidates: [candidate] as PrivatePushCandidate[],
  };
  const notifications: {
    title: string;
    options: NotificationOptions & { renotify?: boolean };
  }[] = [];
  const detailed = deferred<PrivateNotificationDetail[]>();
  const started = deferred<AbortSignal>();
  const reads: AbortSignal[] = [];
  const globals = {
    fetch,
    caches: Object.getOwnPropertyDescriptor(globalThis, 'caches'),
    location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
  };
  globalThis.fetch = () => Promise.resolve(Response.json(inspection));
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://0xdmme.app' },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: () =>
        Promise.resolve({
          match: (path: string) =>
            Promise.resolve(
              path.endsWith('/sound-preference')
                ? new Response(String(sound))
                : undefined,
            ),
        }),
    },
  });
  t.after(() => {
    globalThis.fetch = globals.fetch;
    for (const name of ['caches', 'location'] as const) {
      const descriptor = globals[name];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const delivery = new NotificationDelivery({
    wake: () => Promise.resolve(),
    show: (title, options) => {
      notifications.push({ title, options });
      return Promise.resolve();
    },
    details: ({ signal }) => {
      reads.push(signal);
      started.resolve(signal);
      return detailed.promise;
    },
  });
  const result: PrivateNotificationDetail = {
    candidate,
    title: 'Local contact',
    body: 'Decrypted on this device',
    icon: 'data:image/png;base64,c3ludGhldGlj',
  };
  return {
    delivery,
    inspection,
    notifications,
    detailed,
    started,
    result,
    reads,
  };
}
await test('the first private alert waits for local decryption and already contains the details', async (t) => {
  const f = fixture(t);
  const work = f.delivery.request();
  await f.started.promise;
  try {
    assert.equal(
      f.notifications.length,
      0,
      'No generic alert before decryption',
    );
  } finally {
    f.detailed.resolve([f.result]);
    await work;
  }
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0]?.title, f.result.title);
  assert.equal(f.notifications[0]?.options.body, f.result.body);
  assert.equal(f.notifications[0]?.options.icon, f.result.icon);
  assert.equal(f.notifications[0]?.options.tag, '0xdmme-activity');
  assert.equal(f.notifications[0]?.options.silent, false);
  assert.equal(f.notifications[0]?.options.renotify, true);
});
for (const change of ['authorization', 'message', 'session'] as const) {
  await test(`a ${change} change during decryption cannot expose old private details`, async (t) => {
    const f = fixture(t),
      work = f.delivery.request();
    await f.started.promise;
    if (change === 'authorization') f.inspection.allowed = false;
    if (change === 'message') f.inspection.privateCandidates = [];
    if (change === 'session') f.inspection.publicScope = 'b'.repeat(64);
    f.detailed.resolve([f.result]);
    await work;
    assert.equal(f.notifications.length, 0);
  });
}
await test('local decryption failure emits one freshly authorized generic alert', async (t) => {
  const f = fixture(t);
  const work = f.delivery.request();
  await f.started.promise;
  f.detailed.reject(new Error('No local key.'));
  await work;
  assert.equal(f.notifications.length, 1);
  assert.equal(
    f.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  assert.equal(f.notifications[0]?.options.silent, false);
});
await test('the decryption deadline alerts generically even while local work has not released, without a late replacement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    work = f.delivery.request();
  const signal = await f.started.promise;
  t.mock.timers.tick(8000);
  assert.equal(signal.aborted, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    f.notifications.length,
    1,
    'The fallback must not wait for a stuck read',
  );
  assert.equal(
    f.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  f.detailed.resolve([f.result]);
  await work;
  assert.equal(f.notifications.length, 1);
});

await test('a later push cancels stale decryption and emits only the current detailed alert', async (t) => {
  const f = fixture(t),
    old = f.delivery.request();
  const signal = await f.started.promise;
  const next = f.delivery.request();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  assert.equal(
    f.notifications.length,
    0,
    'Both pushes wait for details; canceled work cannot alert',
  );
  f.detailed.resolve([f.result]);
  await Promise.all([old, next]);
  assert.equal(f.notifications.length, 1, 'Only the current read can alert');
  assert.equal(f.notifications[0]?.options.body, f.result.body);
});

await test('a queued private alert can time out without starting a second read behind a stuck one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    old = f.delivery.request();
  const signal = await f.started.promise;
  const next = f.delivery.request();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  t.mock.timers.tick(8000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.notifications.length, 1);
  assert.equal(
    f.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  f.detailed.resolve([f.result]);
  await Promise.all([old, next]);
  assert.equal(f.notifications.length, 1);
  assert.equal(
    f.reads.length,
    1,
    'The overdue request never starts another local read',
  );
});

await test('decryption failure after consent or unread state changes cannot produce a fallback', async (t) => {
  const f = fixture(t),
    work = f.delivery.request();
  await f.started.promise;
  f.inspection.privateCandidates = [];
  f.detailed.reject(new Error('No local key.'));
  await work;
  assert.equal(f.notifications.length, 0);
});

await test('a detailed private alert retains the device silence preference', async (t) => {
  const f = fixture(t, false),
    work = f.delivery.request();
  await f.started.promise;
  f.detailed.resolve([f.result]);
  await work;
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0]?.options.silent, true);
  assert.equal(f.notifications[0]?.options.renotify, false);
});

await test('coalesced direct and group activity produces only one detailed private alert', async (t) => {
  const f = fixture(t),
    candidate = {
      kind: 'group' as const,
      id: crypto.randomUUID(),
      group: crypto.randomUUID(),
    };
  f.inspection.privateCandidates.push(candidate);
  const work = f.delivery.request();
  await f.started.promise;
  f.detailed.resolve([
    f.result,
    { candidate, title: 'Private group', body: 'Group message' },
  ]);
  await work;
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0]?.options.body, f.result.body);
});

await test('notification candidates admit only bounded private contact/group locators', () => {
  assert.throws(() =>
    privatePushCandidates([
      { kind: 'handle', id: crypto.randomUUID(), peer: crypto.randomUUID() },
    ]),
  );
  assert.throws(() =>
    privatePushCandidates([
      {
        kind: 'direct',
        id: crypto.randomUUID(),
        peer: crypto.randomUUID(),
        text: 'server plaintext',
      },
    ]),
  );
  assert.throws(() => privatePushCandidates([{}, {}, {}]));
});
