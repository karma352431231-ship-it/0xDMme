import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationService } from '../src/server/notifications/index.ts';
import type {
  DailyStore,
  DeviceStore,
  PushJob,
} from '../src/server/database/index.ts';

await test('push drena mais de um lote e preserva chegada de trabalho durante envio', async () => {
  const jobs: PushJob[] = Array.from({ length: 35 }, () => ({
    account_id: crypto.randomUUID(),
    device_id: crypto.randomUUID(),
    generation: '1',
    subscription: {
      endpoint: 'https://web.push.apple.com/synthetic',
      keys: { p256dh: 'synthetic', auth: 'synthetic' },
    },
    attempts: 0,
  }));
  let delivered = 0;
  const store = {
    jobs: () => Promise.resolve(jobs.slice(0, 16)),
    eligible: () => Promise.resolve(true),
    finish: (job: PushJob) => {
      jobs.splice(jobs.indexOf(job), 1);
      return Promise.resolve();
    },
    nextPushAttempt: () => Promise.resolve(jobs.length ? Date.now() : null),
  } as unknown as DailyStore;
  const service = new NotificationService({
    store,
    devices: {} as DeviceStore,
    config: { publicKey: 'synthetic' },
    send: () => {
      delivered++;
      if (delivered === 35)
        jobs.push({ ...jobs[0]!, account_id: crypto.randomUUID() });
      return Promise.resolve();
    },
  });
  try {
    await service.flush();
    assert.equal(delivered, 36);
    assert.equal(jobs.length, 0);
  } finally {
    await service.close();
  }
});
await test('push indisponível não consome trabalhos; elegibilidade é revalidada e retries permanecem limitados', async () => {
  const job = {
    account_id: crypto.randomUUID(),
    device_id: crypto.randomUUID(),
    generation: '1',
    subscription: {
      endpoint: 'https://web.push.apple.com/synthetic',
      keys: { p256dh: 'synthetic', auth: 'synthetic' },
    },
    attempts: 0,
  };
  const outcomes: string[] = [];
  let eligible = false,
    calls = 0;
  const store = {
    jobs: () => {
      calls++;
      return Promise.resolve(calls === 1 ? [job] : []);
    },
    eligible: () => Promise.resolve(eligible),
    finish: (_job: PushJob, outcome: string) => {
      outcomes.push(outcome);
      return Promise.resolve();
    },
    nextPushAttempt: () => Promise.resolve(null),
  } as unknown as DailyStore;
  const unavailable = new NotificationService({
    store,
    devices: {} as DeviceStore,
    config: null,
  });
  await unavailable.flush();
  await unavailable.close();
  assert.equal(calls, 0);
  const service = new NotificationService({
    store,
    devices: {} as DeviceStore,
    config: { publicKey: 'synthetic' },
    send: () => Promise.reject(new Error('provider unavailable')),
  });
  try {
    await service.flush();
    assert.deepEqual(outcomes, ['sent']);
    eligible = true;
    calls = 0;
    await service.flush();
    assert.deepEqual(outcomes, ['sent', 'retry']);
  } finally {
    await service.close();
  }
});
