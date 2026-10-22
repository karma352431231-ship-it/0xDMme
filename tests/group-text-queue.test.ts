import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupTextQueue } from '../src/client/groups/text-queue.ts';
import { deferred } from './fixtures/deferred.ts';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('a burst of group texts is saved in order to each own group without waiting for a send', async () => {
  const saved: string[] = [],
    sends: ReturnType<typeof deferred<void>>[] = [];
  let pending = 0;
  const queue = groupTextQueue({
    save: (groupId, text) => {
      saved.push(`${groupId}:${text}`);
      pending++;
      return Promise.resolve();
    },
    send: async () => {
      const gate = deferred<void>();
      sends.push(gate);
      await gate.promise;
      pending = 0;
      return true;
    },
    more: () => Promise.resolve(pending > 0),
    available: () => true,
    changed: () => {},
    failed: (error) => assert.fail(String(error)),
  });
  queue.enqueue({ id: crypto.randomUUID(), peer: 'group-a', text: 'one' });
  await settle();
  queue.enqueue({ id: crypto.randomUUID(), peer: 'group-a', text: 'two' });
  queue.enqueue({ id: crypto.randomUUID(), peer: 'group-b', text: 'three' });
  await settle();
  assert.deepEqual(saved, ['group-a:one', 'group-a:two', 'group-b:three']);
  assert.equal(sends.length, 1, 'One transmission at a time');
  sends[0]!.resolve();
  await settle();
  await settle();
  assert.equal(sends.length, 2, 'Texts saved during a send follow it');
  sends[1]!.resolve();
  await settle();
  assert.equal(queue.pending, true, 'The quiet window keeps it pending');
});

await test('a send that did not run keeps the queue retryable without losing saved texts', async () => {
  const saved: string[] = [];
  let attempts = 0;
  const queue = groupTextQueue({
    save: (_groupId, text) => {
      saved.push(text);
      return Promise.resolve();
    },
    send: () => {
      attempts++;
      return Promise.resolve(attempts > 1);
    },
    more: () => Promise.resolve(false),
    available: () => true,
    changed: () => {},
    failed: () => {},
  });
  queue.enqueue({ id: crypto.randomUUID(), peer: 'group-a', text: 'kept' });
  await settle();
  await settle();
  assert.equal(attempts, 1);
  queue.retry();
  await settle();
  await settle();
  assert.equal(attempts, 2);
  assert.deepEqual(saved, ['kept']);
});
