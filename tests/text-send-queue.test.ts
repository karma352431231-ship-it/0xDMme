import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TextSendQueue } from '../src/client/messages/text-send.ts';
import type { TextDraft } from '../src/client/messages/text-send.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const draft = (id: string): TextDraft => ({
  id,
  peer: 'captured-recipient',
  text: `Synthetic ${id}`,
});

await test('offline drafts save locally and a failed transfer does not spin; explicit new input resumes the durable queue', async (t) => {
  let online = false,
    sends = 0;
  const q = new TextSendQueue({
    save: () => Promise.resolve(),
    available: () => online,
    transmit: () => {
      sends++;
      return Promise.resolve({ ok: false, more: true });
    },
    changed: () => {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => q.reset());
  q.enqueue(draft('offline'));
  await turn();
  assert.equal(q.unsaved, false);
  assert.equal(sends, 0);
  online = true;
  q.resume();
  await turn();
  for (let n = 0; n < 20; n++) q.resume();
  await turn();
  assert.equal(sends, 1);
  q.enqueue(draft('explicit-next'));
  await turn();
  assert.equal(sends, 2);
});

await test('admission captures its recipient and published placeholders contain only bounded metadata until verified history replaces them', async (t) => {
  const held = deferred<void>(),
    saved: string[] = [];
  const q = new TextSendQueue({
    save: async (value) => {
      await held.promise;
      saved.push(value.peer);
    },
    available: () => false,
    transmit: () => Promise.resolve({ ok: true, more: false }),
    changed: () => {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => q.reset());
  const input = draft('captured');
  q.enqueue(input);
  input.peer = 'different-current-contact';
  held.resolve();
  await turn();
  assert.deepEqual(saved, ['captured-recipient']);
  for (let n = 0; n < 40; n++) q.acknowledge({ id: String(n), peer: 'one' });
  assert.equal(q.published.length, 32);
  q.observed([], 'another');
  assert.equal(q.published.length, 32);
  q.observed([], 'one');
  assert.equal(q.published.length, 0);
});

await test('rapid texts save in FIFO order while transmission waits, without dropping the next drafts', async (t) => {
  const held = deferred<{ ok: boolean; more: boolean }>(),
    saved: string[] = [];
  let transmissions = 0;
  const q = new TextSendQueue({
    save: (value) => {
      saved.push(value.id);
      return Promise.resolve();
    },
    transmit: () => {
      transmissions++;
      return transmissions === 1
        ? held.promise
        : Promise.resolve({ ok: true, more: false });
    },
    available: () => true,
    changed: () => {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => q.reset());
  q.enqueue(draft('a'));
  await turn();
  q.enqueue(draft('b'));
  q.enqueue(draft('c'));
  await turn();
  assert.deepEqual(saved, ['a', 'b', 'c']);
  assert.equal(q.unsaved, false);
  assert.equal(transmissions, 1);
  held.resolve({ ok: true, more: false });
  await turn();
  assert.equal(
    transmissions,
    2,
    'Drafts saved during the first transfer need another turn.',
  );
});

await test('a save failure retains the original ID and remaining texts, without an automatic retry loop', async (t) => {
  const ids: string[] = [],
    errors: unknown[] = [];
  let failed = true;
  const q = new TextSendQueue({
    save: (value) => {
      ids.push(value.id);
      return failed
        ? Promise.reject(new Error('Synthetic storage failure'))
        : Promise.resolve();
    },
    transmit: () => Promise.resolve({ ok: true, more: false }),
    available: () => true,
    changed: () => {},
    failed: (error) => errors.push(error),
  });
  t.after(() => q.reset());
  q.enqueue(draft('a'));
  q.enqueue(draft('b'));
  await turn();
  q.resume();
  await turn();
  assert.deepEqual(ids, ['a']);
  assert.equal(q.waiting[0]?.failed, true);
  assert.equal(errors.length, 1);
  failed = false;
  q.retry();
  await turn();
  assert.deepEqual(ids, ['a', 'a', 'b']);
});

await test('session replacement cancels queued plaintext and old completions cannot publish or dequeue the next session', async (t) => {
  const held = deferred<void>(),
    ids: string[] = [];
  let sends = 0;
  const q = new TextSendQueue({
    save: (value) => {
      ids.push(value.id);
      return value.id === 'old' ? held.promise : Promise.resolve();
    },
    transmit: () => {
      sends++;
      return Promise.resolve({ ok: true, more: false });
    },
    available: () => true,
    changed: () => {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => q.reset());
  q.enqueue(draft('old'));
  q.enqueue(draft('cancelled'));
  q.reset();
  q.enqueue(draft('new'));
  held.resolve();
  await turn();
  assert.deepEqual(ids, ['old', 'new']);
  assert.equal(sends, 1);
  assert.equal(q.unsaved, false);
});

await test('admission is bounded and typing defers background reads for one quiet window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const held = deferred<void>();
  let changes = 0;
  const q = new TextSendQueue({
    save: () => held.promise,
    transmit: () => Promise.resolve({ ok: false, more: true }),
    available: () => true,
    changed: () => {
      changes++;
    },
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => q.reset());
  for (let n = 0; n < 32; n++) q.enqueue(draft(String(n)));
  assert.throws(() => q.enqueue(draft('overflow')), /Aguarde/u);
  assert.equal(q.waiting.length, 32);
  q.reset();
  q.deferBackground();
  assert.equal(q.pending, true);
  const before = changes;
  t.mock.timers.tick(1000);
  assert.equal(q.pending, false);
  assert.equal(changes, before + 1);
  held.resolve();
  await turn();
});
