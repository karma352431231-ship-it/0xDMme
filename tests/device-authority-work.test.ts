import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthorityWork } from '../src/client/devices/authority-work.ts';
import { DeviceController } from '../src/client/devices/controller.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('interactive authority work precedes queued maintenance without interrupting or overlapping active work', async () => {
  const queue = new AuthorityWork(),
    gate = deferred<void>(),
    order: string[] = [];
  let active = 0,
    maximum = 0;
  const work = (name: string) => async () => {
    active++;
    maximum = Math.max(maximum, active);
    order.push(name);
    if (name === 'active') await gate.promise;
    active--;
    return name;
  };
  const running = queue.run(work('active'));
  const background = [
    queue.run(work('background-1')),
    queue.run(work('background-2')),
  ];
  const interactive = queue.run(work('conversation'), 'interactive');
  assert.deepEqual(order, ['active']);
  gate.resolve();
  assert.equal(await interactive, 'conversation');
  await Promise.all([running, ...background]);
  assert.deepEqual(order, [
    'active',
    'conversation',
    'background-1',
    'background-2',
  ]);
  assert.equal(maximum, 1);
});

await test('four interactive turns yield to queued maintenance and errors release the queue', async () => {
  const queue = new AuthorityWork(),
    gate = deferred<void>(),
    order: string[] = [];
  const running = queue.run(() => gate.promise);
  const background = queue.run(() => {
    order.push('background');
    return Promise.resolve();
  });
  const interactive = Array.from({ length: 6 }, (_, i) =>
    queue.run(() => {
      order.push(String(i));
      return Promise.resolve();
    }, 'interactive'),
  );
  gate.resolve();
  await Promise.all([running, background, ...interactive]);
  assert.deepEqual(order, ['0', '1', '2', '3', 'background', '4', '5']);
  const failure = new Error('synthetic failure');
  await assert.rejects(
    queue.run(() => Promise.reject(failure)),
    (error: unknown) => error === failure,
  );
  assert.equal(
    await queue.run(() => Promise.resolve('recovered')),
    'recovered',
  );
});

await test('queue wait counts toward the native acquisition budget and expired jobs never execute', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const queue = new AuthorityWork(),
    gate = deferred<void>();
  const running = queue.run(() => gate.promise);
  const remaining = queue.run((waitMs) => Promise.resolve(waitMs));
  now = 2300;
  gate.resolve();
  await running;
  assert.equal(await remaining, 5700);
  const secondGate = deferred<void>();
  const secondEntered = deferred<void>();
  const second = queue.run(() => {
    secondEntered.resolve();
    return secondGate.promise;
  });
  await secondEntered.promise;
  let executed = false;
  const expired = queue.run(() => {
    executed = true;
    return Promise.resolve();
  });
  const rejected = assert.rejects(expired, { name: 'TimeoutError' });
  now += 8000;
  t.mock.timers.tick(8000);
  await rejected;
  secondGate.resolve();
  await second;
  assert.equal(executed, false);
});

await test('pending authority jobs have a bounded budget and do not run under a changed session', async (t) => {
  const queue = new AuthorityWork(),
    gate = deferred<void>();
  const running = queue.run(() => gate.promise);
  const waiting = Array.from({ length: 64 }, () =>
    queue.run(() => Promise.resolve()),
  );
  await assert.rejects(
    queue.run(() => Promise.resolve()),
    /Aguarde/,
  );
  gate.resolve();
  await Promise.all([running, ...waiting]);
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  let nativeRequests = 0;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (
        name: string,
        options: LockOptions,
        work: () => Promise<unknown>,
      ) => {
        if (name.startsWith('0xdmme-device-authority:')) {
          nativeRequests++;
          assert.equal(options.mode, 'exclusive');
        }
        return work();
      },
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
    else Reflect.deleteProperty(navigator, 'locks');
  });
  const controller = new DeviceController();
  controller.setSession({
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  } as AccountSession);
  const activeGate = deferred<void>();
  const active = controller.run(() => activeGate.promise);
  const activeRejected = assert.rejects(active, /Sessão alterada/);
  let oldAction = false;
  const stale = controller.run(
    () => {
      oldAction = true;
      return Promise.resolve();
    },
    { priority: 'interactive' },
  );
  const staleRejected = assert.rejects(stale, /Sessão alterada/);
  controller.setSession(null);
  activeGate.resolve();
  await Promise.all([activeRejected, staleRejected]);
  assert.equal(oldAction, false);
  assert.equal(nativeRequests, 2);
});
