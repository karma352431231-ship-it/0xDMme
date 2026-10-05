import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CallPushQueue } from '../src/server/notifications/call-push.ts';
import type { PushJob } from '../src/server/database/index.ts';

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
