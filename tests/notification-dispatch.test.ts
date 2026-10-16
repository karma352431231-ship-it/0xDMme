import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PushDispatcher } from '../src/server/notifications/dispatcher.ts';
import type {
  PushJob,
  PushJobCursor,
  PushJobPage,
} from '../src/server/database/index.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { pushJob } from './fixtures/push-job.ts';

function pages(jobs: PushJob[]) {
  const result = new Map<string | null, PushJobPage>();
  let after: string | null = null;
  for (let offset = 0; offset < jobs.length; offset += 16) {
    const items = jobs.slice(offset, offset + 16),
      last = items.at(-1)!;
    const next =
      offset + 16 < jobs.length
        ? {
            scheduledAt: '2026-10-16 00:00:00.123456+00',
            account: last.account_id,
            device: last.device_id,
          }
        : null;
    result.set(after, { items, next });
    after = next?.device ?? null;
  }
  return (after: PushJobCursor | null) =>
    Promise.resolve(result.get(after?.device ?? null)!);
}

await test('durable push admits later pages while earlier sends are still pending', async (t) => {
  const available = 134_217_728;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = Array.from({ length: 48 }, () => pushJob()),
    held = deferred<void>(),
    started = deferred<void>();
  const finished: string[] = [];
  let sending = 0;
  const dispatcher = new PushDispatcher({
    store: {
      jobPage: pages(jobs),
      eligible: () => Promise.resolve(true),
      finish: (job) => {
        finished.push(job.device_id);
        return Promise.resolve();
      },
      nextPushAttempt: () => Promise.resolve(null),
    },
    send: () => {
      if (++sending === 48) started.resolve();
      return held.promise;
    },
  });
  const draining = dispatcher.dispatch();
  try {
    await waitForBoundary(started.promise);
    assert.equal(sending, 48);
    assert.equal(finished.length, 0);
  } finally {
    held.resolve();
    await draining;
    await dispatcher.settle();
    dispatcher.stop();
  }
  assert.equal(new Set(finished).size, 48);
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('pressure keeps unadmitted durable markers and retries after resources recover', async (t) => {
  let available = 0,
    reads = 0,
    sends = 0;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = Array.from({ length: 3 }, () => pushJob()),
    finished = new Set<string>();
  const dispatcher = new PushDispatcher({
    store: {
      jobPage: () => {
        reads++;
        return Promise.resolve({
          items: jobs.filter((j) => !finished.has(j.device_id)),
          next: null,
        });
      },
      eligible: () => Promise.resolve(true),
      finish: (job) => {
        finished.add(job.device_id);
        return Promise.resolve();
      },
      nextPushAttempt: () => Promise.resolve(null),
    },
    send: () => {
      sends++;
      return Promise.resolve();
    },
  });
  assert.ok((await dispatcher.dispatch())! > Date.now());
  assert.equal(reads, 0);
  available = 2_097_152;
  assert.ok((await dispatcher.dispatch())! > Date.now());
  await dispatcher.settle();
  assert.equal(sends, 1);
  assert.equal(finished.size, 1);
  available = 8_388_608;
  assert.equal(await dispatcher.dispatch(), null);
  await dispatcher.settle();
  assert.equal(sends, 3);
  dispatcher.stop();
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('a later page failure keeps active sends owned until explicit cleanup settles them', async (t) => {
  const available = 33_554_432;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = Array.from({ length: 16 }, () => pushJob()),
    held = deferred<void>(),
    started = deferred<void>();
  let sends = 0,
    settled = false;
  const dispatcher = new PushDispatcher({
    store: {
      jobPage: (after) =>
        after
          ? Promise.reject(new Error('database page failed'))
          : Promise.resolve({
              items: jobs,
              next: {
                scheduledAt: '2026-10-16',
                account: jobs[15]!.account_id,
                device: jobs[15]!.device_id,
              },
            }),
      eligible: () => Promise.resolve(true),
      finish: () => Promise.resolve(),
      nextPushAttempt: () => Promise.resolve(null),
    },
    send: () => {
      if (++sends === 16) started.resolve();
      return held.promise;
    },
  });
  const draining = dispatcher.dispatch();
  const rejected = assert.rejects(draining, /database page failed/);
  let cleanup: Promise<void> | undefined;
  try {
    await waitForBoundary(started.promise);
    await rejected;
    cleanup = dispatcher.settle().then(() => {
      settled = true;
    });
    assert.equal(settled, false);
  } finally {
    held.resolve();
    await rejected;
    await cleanup;
    await dispatcher.settle();
    dispatcher.stop();
  }
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('one device cannot have overlapping sends from different marker generations', async () => {
  const first = pushJob(),
    second = { ...first, generation: '2' },
    held = deferred<void>(),
    started = deferred<void>();
  const finished: string[] = [];
  let sends = 0;
  const dispatcher = new PushDispatcher({
    store: {
      jobPage: (after) =>
        Promise.resolve(
          after
            ? { items: [second], next: null }
            : {
                items: [first],
                next: {
                  scheduledAt: '2026-10-16',
                  account: first.account_id,
                  device: first.device_id,
                },
              },
        ),
      eligible: () => Promise.resolve(true),
      finish: (job) => {
        finished.push(job.generation);
        return Promise.resolve();
      },
      nextPushAttempt: () => Promise.resolve(0),
    },
    send: () => {
      sends++;
      started.resolve();
      return held.promise;
    },
  });
  const draining = dispatcher.dispatch();
  try {
    await waitForBoundary(started.promise);
    assert.equal(sends, 1);
  } finally {
    held.resolve();
    assert.equal(await draining, 0);
    await dispatcher.settle();
    dispatcher.stop();
  }
  assert.deepEqual(finished, ['1']);
});

await test('shutdown rechecks before send and persistence failures are not mistaken for provider failures', async () => {
  const job = pushJob(),
    authorized = deferred<boolean>(),
    entered = deferred<void>();
  let sent = 0,
    finishes = 0;
  const store = {
    jobPage: () => Promise.resolve({ items: [job], next: null }),
    eligible: () => {
      entered.resolve();
      return authorized.promise;
    },
    finish: () => {
      finishes++;
      return Promise.reject(new Error('marker commit failed'));
    },
    nextPushAttempt: () => Promise.resolve(null),
  };
  const dispatcher = new PushDispatcher({
    store,
    send: () => {
      sent++;
      return Promise.resolve();
    },
  });
  const draining = dispatcher.dispatch();
  await entered.promise;
  dispatcher.stop();
  authorized.resolve(true);
  assert.equal(await draining, null);
  await dispatcher.settle();
  assert.equal(sent, 0);
  assert.equal(finishes, 0);
  const next = new PushDispatcher({
    store,
    send: () => {
      sent++;
      return Promise.resolve();
    },
  });
  try {
    await next.dispatch();
    await assert.rejects(next.settle(), /marker commit failed/);
  } finally {
    next.stop();
  }
  assert.equal(sent, 1);
  assert.equal(finishes, 1);
});

await test('revoked jobs skip delivery and provider failures preserve retirement and retry outcomes', async () => {
  const jobs = Array.from({ length: 4 }, () => pushJob());
  const outcomes = new Map<string, string>();
  const statuses = new Map(
    jobs
      .slice(1)
      .map((job, i) => [job.subscription.endpoint, [404, 410, 503][i]]),
  );
  let sends = 0;
  const dispatcher = new PushDispatcher({
    store: {
      jobPage: () => Promise.resolve({ items: jobs, next: null }),
      eligible: (job) => Promise.resolve(job !== jobs[0]),
      finish: (job, outcome) => {
        outcomes.set(job.device_id, outcome);
        return Promise.resolve();
      },
      nextPushAttempt: () => Promise.resolve(null),
    },
    send: (subscription) => {
      sends++;
      return Promise.reject(
        Object.assign(new Error('Provider rejected delivery.'), {
          statusCode: statuses.get(subscription.endpoint),
        }),
      );
    },
  });
  try {
    await dispatcher.dispatch();
    await dispatcher.settle();
  } finally {
    dispatcher.stop();
  }
  assert.equal(sends, 3);
  assert.deepEqual(
    jobs.map((job) => outcomes.get(job.device_id)),
    ['sent', 'gone', 'gone', 'retry'],
  );
});
