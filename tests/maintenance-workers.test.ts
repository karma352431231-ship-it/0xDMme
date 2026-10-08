import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkConsumers } from '../src/server/work-scheduler/index.ts';
import type { WorkTopic } from '../src/server/database/index.ts';
import { backgroundMode } from '../src/server/background/index.ts';

await test('coletores: falha independente, drenagem por lote, prazo e sinal durante trabalho sem fallback', async () => {
  const listeners = new Map<WorkTopic, (() => void)[]>();
  const signals = {
    subscribe: (topic: WorkTopic, listener: () => void) => {
      const items = listeners.get(topic) ?? [];
      items.push(listener);
      listeners.set(topic, items);
      return () => {
        const index = items.indexOf(listener);
        if (index >= 0) items.splice(index, 1);
      };
    },
  };
  let healthy = 0,
    failing = 0,
    remaining = 3,
    due: number | null = null;
  const consumers = new WorkConsumers(
    [
      {
        topic: 'attachments',
        work: () => {
          failing++;
          return Promise.reject(new Error('Indisponível'));
        },
        next: () => Promise.resolve(null),
      },
      {
        topic: 'status',
        work: async () => {
          healthy++;
          remaining--;
          if (healthy === 1) {
            for (const listener of listeners.get('status') ?? []) listener();
            await delay(5);
          }
        },
        next: () => Promise.resolve(remaining > 0 ? Date.now() : due),
      },
    ],
    signals,
    { fallbackMs: 0 },
  );
  consumers.start();
  await delay(100);
  assert.equal(failing, 1);
  assert.equal(healthy, 3);
  due = Date.now() + 50;
  for (const listener of listeners.get('status') ?? []) listener();
  await delay(35);
  assert.equal(healthy, 4);
  due = null;
  await delay(65);
  assert.equal(healthy, 5);
  await consumers.close();
  assert.equal(listeners.get('status')?.length, 0);
});
await test('workers: modo explícito evita executar cópias no web isolado', () => {
  assert.equal(backgroundMode({}), 'embedded');
  assert.equal(
    backgroundMode({ HASH_TALK_BACKGROUND_MODE: 'isolated' }),
    'isolated',
  );
  assert.throws(() => backgroundMode({ HASH_TALK_BACKGROUND_MODE: 'other' }));
});
