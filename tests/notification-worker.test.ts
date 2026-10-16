import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotificationService } from '../src/server/notifications/index.ts';
import type {
  DailyStore,
  DeviceStore,
  PushJob,
  PushJobKey,
  WorkSignals,
} from '../src/server/database/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { pushJob } from './fixtures/push-job.ts';

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
    jobPage: () => Promise.resolve({ items: jobs.slice(0, 16), next: null }),
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

await test('new device notifications progress while an unrelated slow send is pending', async () => {
  const slow = pushJob(),
    fast = pushJob(),
    held = deferred<void>(),
    started = deferred<void>(),
    fastFinished = deferred<void>();
  const markers = [slow];
  const signals: { notify: () => void; subscribe: WorkSignals['subscribe'] } = {
    notify: () => {},
    subscribe: (_topic, listener) => {
      signals.notify = listener;
      return () => {};
    },
  };
  const store = {
    jobPage: () => Promise.resolve({ items: [...markers], next: null }),
    eligible: () => Promise.resolve(true),
    finish: (job: PushJob) => {
      markers.splice(markers.indexOf(job), 1);
      if (job === fast) fastFinished.resolve();
      return Promise.resolve();
    },
    nextPushAttempt: (active: readonly PushJobKey[]) =>
      Promise.resolve(
        markers.some(
          (job) =>
            !active.some(
              (a) =>
                a.account_id === job.account_id &&
                a.device_id === job.device_id,
            ),
        )
          ? Date.now()
          : null,
      ),
  } as unknown as DailyStore;
  const service = new NotificationService({
    store,
    devices: {} as DeviceStore,
    config: { publicKey: 'synthetic' },
    signals: signals as unknown as WorkSignals,
    send: (subscription) => {
      if (subscription === slow.subscription) {
        started.resolve();
        return held.promise;
      }
      return Promise.resolve();
    },
  });
  try {
    service.start();
    await waitForBoundary(started.promise);
    markers.push(fast);
    signals.notify();
    await waitForBoundary(fastFinished.promise);
    assert.deepEqual(markers, [slow]);
  } finally {
    held.resolve();
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
    jobPage: () => {
      calls++;
      return Promise.resolve({ items: calls === 1 ? [job] : [], next: null });
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
