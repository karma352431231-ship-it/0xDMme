import { privatePushCandidates } from '../src/shared/private-notification/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationDelivery } from '../src/client/pwa/notification.ts';
import type { PrivateNotificationDetail } from '../src/client/notification-private/index.ts';
import { deferred } from './fixtures/deferred.ts';
import type { TestContext } from 'node:test';

function fixture(t: TestContext) {
  const candidate = {
    kind: 'direct' as const,
    id: crypto.randomUUID(),
    peer: crypto.randomUUID(),
  };
  const inspection = {
    allowed: true,
    call: false,
    publicScope: 'a'.repeat(64),
    privateCandidates: [candidate],
  };
  const notifications: {
    title: string;
    options: NotificationOptions & { renotify?: boolean };
  }[] = [];
  const detailed = deferred<PrivateNotificationDetail[]>();
  const started = deferred<AbortSignal>();
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
      open: () => Promise.resolve({ match: () => Promise.resolve(undefined) }),
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
  return { delivery, inspection, notifications, detailed, started, result };
}
await test('the first private alert never waits for local decryption; detail replaces it without a second sound', async (t) => {
  const f = fixture(t);
  const work = f.delivery.request();
  await f.started.promise;
  assert.equal(
    f.notifications.length,
    1,
    'Alert is visible while decryption is still blocked',
  );
  assert.equal(
    f.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  f.detailed.resolve([f.result]);
  await work;
  assert.equal(f.notifications[1]?.title, f.result.title);
  assert.equal(f.notifications[1]?.options.body, f.result.body);
  assert.equal(f.notifications[1]?.options.icon, f.result.icon);
  assert.equal(
    f.notifications[1]?.options.tag,
    f.notifications[0]?.options.tag,
  );
  assert.equal(f.notifications[1]?.options.silent, true);
  assert.equal(f.notifications[1]?.options.renotify, false);
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
    assert.equal(f.notifications.length, 1);
  });
}
await test('local decryption failure retains only the initial authorized generic alert', async (t) => {
  const f = fixture(t);
  const work = f.delivery.request();
  await f.started.promise;
  f.detailed.reject(new Error('No local key.'));
  await work;
  assert.equal(f.notifications.length, 1);
});
await test('the detail deadline aborts local work and suppresses a late decrypted result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(t),
    work = f.delivery.request();
  const signal = await f.started.promise;
  t.mock.timers.tick(8000);
  assert.equal(signal.aborted, true);
  f.detailed.resolve([f.result]);
  await work;
  assert.equal(f.notifications.length, 1);
});

await test('a later push is alerted while an older local read remains blocked', async (t) => {
  const f = fixture(t),
    old = f.delivery.request();
  const signal = await f.started.promise;
  const next = f.delivery.request();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  assert.equal(
    f.notifications.length,
    2,
    'The new generic alert does not queue behind detail decryption',
  );
  f.detailed.resolve([f.result]);
  await Promise.all([old, next]);
  assert.equal(f.notifications.length, 3, 'Only the current read can enrich');
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
