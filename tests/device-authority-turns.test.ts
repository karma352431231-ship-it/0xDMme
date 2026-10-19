import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { authorityTurn } from '../src/client/devices/authority-turns.ts';
import { DeviceController } from '../src/client/devices/controller.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

function controller(accountId: string): DeviceController {
  const result = new DeviceController();
  result.setSession({
    accountId,
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  } as AccountSession);
  return result;
}

async function pending(accountId: string, count: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const snapshot = await navigator.locks.query();
    if (
      snapshot.pending!.filter((lock) => lock.name?.endsWith(accountId))
        .length >= count
    )
      return;
    await setImmediate();
  }
  assert.fail('The native cross-controller acquisition did not queue.');
}

await test('foreground work in another controller precedes queued maintenance without overlapping the native SDK lock', async (t) => {
  const accountId = crypto.randomUUID(),
    owners = Array.from({ length: 3 }, () => controller(accountId)),
    entered = deferred<void>(),
    release = deferred<void>(),
    order: string[] = [];
  let active = 0,
    maximum = 0;
  const operation = (name: string) => async () => {
    active++;
    maximum = Math.max(maximum, active);
    order.push(name);
    if (name === 'active') {
      entered.resolve();
      await release.promise;
    }
    active--;
  };
  const running = owners[0]!.run(operation('active'));
  const jobs = [running];
  t.after(async () => {
    release.resolve();
    await Promise.allSettled(jobs);
  });
  await waitForBoundary(entered.promise);
  jobs.push(owners[1]!.run(operation('maintenance')));
  await pending(accountId, 1);
  jobs.push(
    owners[2]!.run(operation('foreground'), { priority: 'interactive' }),
  );
  await pending(accountId, 2);
  release.resolve();
  await Promise.all(jobs);
  assert.deepEqual(order, ['active', 'foreground', 'maintenance']);
  assert.equal(maximum, 1);
  const snapshot = await navigator.locks.query();
  assert.equal(
    snapshot.held!.some((lock) => lock.name?.endsWith(accountId)),
    false,
  );
});

await test('a queued maintenance turn progresses ahead of later foreground arrivals', async (t) => {
  const accountId = crypto.randomUUID(),
    owners = Array.from({ length: 7 }, () => controller(accountId)),
    entered = deferred<void>(),
    release = deferred<void>(),
    order: string[] = [];
  const running = owners[0]!.run(
    async () => {
      order.push('active');
      entered.resolve();
      await release.promise;
    },
    { priority: 'interactive' },
  );
  const jobs = [running];
  t.after(async () => {
    release.resolve();
    await Promise.allSettled(jobs);
  });
  await waitForBoundary(entered.promise);
  jobs.push(
    owners[1]!.run(() => {
      order.push('maintenance');
      return Promise.resolve();
    }),
  );
  await pending(accountId, 1);
  for (const owner of owners.slice(2)) {
    jobs.push(
      owner.run(
        () => {
          order.push('foreground');
          return Promise.resolve();
        },
        { priority: 'interactive' },
      ),
    );
  }
  await pending(accountId, 6);
  release.resolve();
  await Promise.all(jobs);
  assert.deepEqual(order, [
    'active',
    'maintenance',
    ...Array<string>(5).fill('foreground'),
  ]);
});

await test('operation failure and session replacement release all admission gates while accounts remain independent', async (t) => {
  const accountId = crypto.randomUUID(),
    owner = controller(accountId),
    stale = controller(accountId),
    other = controller(crypto.randomUUID()),
    entered = deferred<void>(),
    release = deferred<void>();
  const running = owner.run(async () => {
    entered.resolve();
    await release.promise;
    throw new Error('synthetic operation failure');
  });
  const failure = assert.rejects(running, /synthetic operation failure/);
  t.after(async () => {
    release.resolve();
    await failure;
  });
  await waitForBoundary(entered.promise);
  let executed = false;
  const rejected = assert.rejects(
    stale.run(
      () => {
        executed = true;
        return Promise.resolve();
      },
      { priority: 'interactive' },
    ),
    /Session changed/,
  );
  await pending(accountId, 1);
  assert.equal(
    await waitForBoundary(other.run(() => Promise.resolve('independent'))),
    'independent',
  );
  stale.setSession(null);
  release.resolve();
  await Promise.all([failure, rejected]);
  assert.equal(executed, false);
  assert.equal(
    await controller(accountId).run(() => Promise.resolve('recovered')),
    'recovered',
  );
  const snapshot = await navigator.locks.query();
  assert.equal(
    snapshot.held!.some((lock) => lock.name?.endsWith(accountId)),
    false,
  );
  assert.equal(
    snapshot.pending!.some((lock) => lock.name?.endsWith(accountId)),
    false,
  );
});

function hold(name: string) {
  const entered = deferred<void>(),
    release = deferred<void>();
  const done = navigator.locks.request(name, async () => {
    entered.resolve();
    await release.promise;
  });
  return { entered, release, done };
}

async function pendingName(name: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const snapshot = await navigator.locks.query();
    if (snapshot.pending!.some((lock) => lock.name === name)) return;
    await setImmediate();
  }
  assert.fail('The expected native lock boundary did not queue.');
}

await test('maintenance intent, turn admission and SDK acquisition consume one deadline', async (t) => {
  const accountId = crypto.randomUUID(),
    intentName = `0xdmme-authority-maintenance:${accountId}`,
    turnName = `0xdmme-authority-turn:${accountId}`,
    sdkName = `0xdmme-device-authority:${accountId}`,
    intent = hold(intentName),
    turn = hold(turnName),
    sdk = hold(sdkName),
    timers: AbortController[] = [],
    budgets: number[] = [];
  let now = 0,
    executed = false;
  t.mock.method(performance, 'now', () => now);
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    const timer = new AbortController();
    timers.push(timer);
    budgets.push(ms);
    return timer.signal;
  });
  t.after(async () => {
    intent.release.resolve();
    turn.release.resolve();
    sdk.release.resolve();
    await Promise.all([intent.done, turn.done, sdk.done]);
  });
  await Promise.all([
    intent.entered.promise,
    turn.entered.promise,
    sdk.entered.promise,
  ]);
  const result = authorityTurn(
    accountId,
    () => {
      executed = true;
      return Promise.resolve();
    },
    { waitMs: 100 },
  );
  const rejected = assert.rejects(result, { name: 'TimeoutError' });
  await pendingName(intentName);
  now = 30;
  intent.release.resolve();
  await pendingName(turnName);
  now = 55;
  turn.release.resolve();
  await pendingName(sdkName);
  assert.deepEqual(budgets, [100, 45]);
  timers[1]!.abort(new DOMException('Synthetic deadline', 'TimeoutError'));
  await rejected;
  sdk.release.resolve();
  await sdk.done;
  await setImmediate();
  assert.equal(executed, false);
  const snapshot = await navigator.locks.query();
  assert.equal(
    snapshot.pending!.some((lock) => lock.name?.endsWith(accountId)),
    false,
  );
  assert.equal(
    snapshot.held!.some(
      (lock) => lock.name === intentName || lock.name === turnName,
    ),
    false,
  );
});

for (const stage of ['maintenance', 'turn']) {
  await test(`deadline cancellation at the ${stage} gate never starts the operation`, async (t) => {
    const accountId = crypto.randomUUID(),
      name = `0xdmme-authority-${stage}:${accountId}`,
      blocker = hold(name),
      timer = new AbortController();
    t.mock.method(AbortSignal, 'timeout', () => timer.signal);
    t.after(async () => {
      blocker.release.resolve();
      await blocker.done;
    });
    await waitForBoundary(blocker.entered.promise);
    let executed = false;
    const result = authorityTurn(
      accountId,
      () => {
        executed = true;
        return Promise.resolve();
      },
      { waitMs: 100 },
    );
    const rejected = assert.rejects(result, { name: 'TimeoutError' });
    await pendingName(name);
    timer.abort(new DOMException('Synthetic deadline', 'TimeoutError'));
    await rejected;
    blocker.release.resolve();
    await blocker.done;
    await setImmediate();
    assert.equal(executed, false);
    const snapshot = await navigator.locks.query();
    assert.equal(
      snapshot.pending!.some((lock) => lock.name?.endsWith(accountId)),
      false,
    );
  });
}
