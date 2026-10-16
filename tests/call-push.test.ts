import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CallPushQueue } from '../src/server/notifications/call-push.ts';
import type { PushJob } from '../src/server/database/index.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { pushJob } from './fixtures/push-job.ts';

const job: PushJob = {
  account_id: crypto.randomUUID(),
  device_id: crypto.randomUUID(),
  generation: '0',
  attempts: 0,
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
    keys: { p256dh: 'a'.repeat(87), auth: 'a'.repeat(22) },
  },
};
await test('avisos de chamada saem imediatamente, só após autorização/consentimento e nunca alteram marcador durável', async () => {
  let allowed = true,
    subscribed = true,
    sent = 0;
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve([job]),
      callEligible: () => Promise.resolve(subscribed),
      retireCallSubscription: () => {
        throw new Error('Aviso de chamada não confirma mensagens.');
      },
    },
    (subscription, delivery) => {
      assert.deepEqual(subscription, job.subscription);
      assert.equal(delivery.urgency, 'high');
      assert.ok(delivery.expiresAt <= Date.now() + 60_000);
      sent++;
      return Promise.resolve();
    },
  );
  const invite = () => ({
    account: job.account_id,
    devices: [job.device_id],
    deadline: Date.now() + 60_000,
    valid: () => Promise.resolve(allowed),
  });
  try {
    await queue.enqueue(invite());
    await queue.flush();
    assert.equal(sent, 1);
    allowed = false;
    await queue.enqueue(invite());
    await queue.flush();
    assert.equal(sent, 1);
    allowed = true;
    subscribed = false;
    await queue.enqueue(invite());
    await queue.flush();
    assert.equal(sent, 1);
    subscribed = true;
    await queue.enqueue({ ...invite(), deadline: Date.now() });
    await queue.flush();
    assert.equal(sent, 1);
  } finally {
    await queue.close();
  }
});

function invite(jobs: PushJob[]) {
  return {
    account: jobs[0]!.account_id,
    devices: jobs.map((job) => job.device_id),
    deadline: Date.now() + 60_000,
    valid: () => Promise.resolve(true),
  };
}

await test('call pushes exceed 512 pending invitations and three active sends within memory admission', async (t) => {
  let available = 1_073_741_824;
  t.mock.method(process, 'availableMemory', () => available);
  const batches = Array.from({ length: 17 }, () => {
    const account = crypto.randomUUID();
    return Array.from({ length: 32 }, () => pushJob(account));
  });
  const accounts = new Map(batches.map((jobs) => [jobs[0]!.account_id, jobs]));
  const held = deferred<void>(),
    started = deferred<void>();
  let sends = 0;
  const queue = new CallPushQueue(
    {
      callJobs: (account) => Promise.resolve(accounts.get(account)!),
      callEligible: () => Promise.resolve(true),
      retireCallSubscription: () => Promise.resolve(),
    },
    () => {
      if (++sends === 544) started.resolve();
      return held.promise;
    },
  );
  try {
    for (const jobs of batches) await queue.enqueue(invite(jobs));
    await waitForBoundary(started.promise);
    assert.equal(sends, 544);
  } finally {
    held.resolve();
    await queue.close();
  }
  available = 16_777_216;
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('call batch pressure is atomic and recovery releases success and failed admission budgets', async (t) => {
  let available = 2_097_152,
    sends = 0;
  t.mock.method(process, 'availableMemory', () => available);
  const account = crypto.randomUUID(),
    jobs = Array.from({ length: 3 }, () => pushJob(account));
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve(jobs),
      callEligible: () => Promise.resolve(true),
      retireCallSubscription: () => Promise.resolve(),
    },
    () => {
      sends++;
      return Promise.resolve();
    },
  );
  try {
    await assert.rejects(queue.enqueue(invite(jobs)), /Orçamento temporário/);
    assert.equal(sends, 0);
    const released = reserveOperationMemory(available);
    assert.ok(released);
    released();
    available = 4_194_304;
    await queue.enqueue(invite(jobs));
    await queue.flush();
    assert.equal(sends, 3);
  } finally {
    await queue.close();
  }
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('replacement invitations wait for the current device send and retain its reservation', async (t) => {
  const available = 3_145_728;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = [pushJob()],
    held = deferred<void>(),
    started = deferred<void>();
  let sends = 0;
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve(jobs),
      callEligible: () => Promise.resolve(true),
      retireCallSubscription: () => Promise.resolve(),
    },
    () => {
      sends++;
      started.resolve();
      return sends === 1 ? held.promise : Promise.resolve();
    },
  );
  try {
    await queue.enqueue(invite(jobs));
    await waitForBoundary(started.promise);
    await queue.enqueue(invite(jobs));
    assert.equal(sends, 1);
    assert.equal(reserveOperationMemory(1_048_577), null);
    held.resolve();
    await queue.flush();
    assert.equal(sends, 2);
  } finally {
    held.resolve();
    await queue.close();
  }
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('shutdown owns pending authorization and prevents a late external send', async (t) => {
  const available = 1_048_576;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = [pushJob()],
    eligible = deferred<boolean>(),
    entered = deferred<void>();
  let sends = 0;
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve(jobs),
      callEligible: () => {
        entered.resolve();
        return eligible.promise;
      },
      retireCallSubscription: () => Promise.resolve(),
    },
    () => {
      sends++;
      return Promise.resolve();
    },
  );
  await queue.enqueue(invite(jobs));
  await waitForBoundary(entered.promise);
  const closing = queue.close();
  try {
    assert.equal(reserveOperationMemory(1), null);
  } finally {
    eligible.resolve(true);
    await closing;
  }
  assert.equal(sends, 0);
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('expiry releases a replacement while an older active send still owns its memory', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 });
  const available = 2_097_152;
  t.mock.method(process, 'availableMemory', () => available);
  const jobs = [pushJob()],
    held = deferred<void>(),
    started = deferred<void>();
  let sends = 0;
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve(jobs),
      callEligible: () => Promise.resolve(true),
      retireCallSubscription: () => Promise.resolve(),
    },
    () => {
      sends++;
      started.resolve();
      return held.promise;
    },
  );
  try {
    await queue.enqueue(invite(jobs));
    await started.promise;
    await queue.enqueue({ ...invite(jobs), deadline: Date.now() + 1000 });
    assert.equal(reserveOperationMemory(1), null);
    t.mock.timers.tick(1000);
    const released = reserveOperationMemory(1_048_576);
    assert.ok(released);
    released();
    held.resolve();
    await queue.flush();
    assert.equal(sends, 1);
  } finally {
    held.resolve();
    await queue.close();
  }
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});
await test('falhas têm duas tentativas no máximo, cancelamento/expiração impedem retry e inscrição 410 é removida', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
  let attempts = 0,
    removed = 0,
    allowed = true,
    status = 503;
  const queue = new CallPushQueue(
    {
      callJobs: () => Promise.resolve([job]),
      callEligible: () => Promise.resolve(true),
      retireCallSubscription: () => {
        removed++;
        return Promise.resolve();
      },
    },
    () => {
      attempts++;
      return Promise.reject(
        Object.assign(new Error('Sintético'), { statusCode: status }),
      );
    },
  );
  const invite = () => ({
    account: job.account_id,
    devices: [job.device_id],
    deadline: Date.now() + 60_000,
    valid: () => Promise.resolve(allowed),
  });
  try {
    await queue.enqueue(invite());
    await queue.flush();
    assert.equal(attempts, 1);
    t.mock.timers.tick(3000);
    await queue.flush();
    assert.equal(attempts, 2);
    t.mock.timers.tick(10_000);
    await queue.flush();
    assert.equal(attempts, 2);
    await queue.enqueue(invite());
    await queue.flush();
    allowed = false;
    t.mock.timers.tick(3000);
    await queue.flush();
    assert.equal(attempts, 3);
    allowed = true;
    await queue.enqueue({ ...invite(), deadline: Date.now() + 2000 });
    await queue.flush();
    t.mock.timers.tick(3000);
    await queue.flush();
    assert.equal(attempts, 4);
    status = 410;
    await queue.enqueue(invite());
    await queue.flush();
    assert.equal(removed, 1);
  } finally {
    await queue.close();
  }
});
