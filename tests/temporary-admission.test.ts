import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TemporaryRequests,
  withTemporaryAdmission,
} from '../src/server/temporary-admission/index.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('idle expiry releases shared memory without a new request and preserves replacements', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let available = 1_048_576;
  t.mock.method(process, 'availableMemory', () => available);
  const removed: string[] = [];
  const pending = new TemporaryRequests<{ request: number }>({
    unavailable: 'Muitas entradas pendentes. Aguarde.',
    removed: (id) => removed.push(id),
  });
  t.after(() => pending.close());
  const first = { request: 1 },
    replacement = { request: 2 };
  assert.equal(pending.add('first', first, 2000), true);
  assert.equal(pending.add('first', replacement, 3000), false);
  assert.equal(reserveOperationMemory(available), null);
  available = 0;
  assert.throws(() => pending.add('first', replacement, 3000, first));
  assert.equal(pending.get('first'), first);
  available = 1_048_576;
  assert.equal(pending.add('first', replacement, 3000, first), true);
  pending.delete('first', first);
  t.mock.timers.tick(1000);
  assert.equal(pending.get('first'), replacement);
  t.mock.timers.tick(1000);
  assert.deepEqual(removed, ['first', 'first']);
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
  pending.close();
  assert.equal(pending.add('closed', first, 4000), false);
});

await test('temporary operations reject pressure before work and release on success and failure', async (t) => {
  let available = 0;
  t.mock.method(process, 'availableMemory', () => available);
  const held = deferred<void>();
  let calls = 0;
  const work = () => {
    calls++;
    return held.promise;
  };
  await assert.rejects(
    withTemporaryAdmission('Muitos pedidos de login. Aguarde.', work),
  );
  assert.equal(calls, 0);
  available = 1_048_576;
  const active = withTemporaryAdmission(
    'Muitos pedidos de login. Aguarde.',
    work,
  );
  assert.equal(reserveOperationMemory(available), null);
  held.resolve();
  await active;
  await assert.rejects(
    withTemporaryAdmission('Muitos pedidos de login. Aguarde.', () =>
      Promise.reject(new Error('validation failed')),
    ),
  );
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('expiry rechecks the clock and shutdown cancels every owned timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  const pending = new TemporaryRequests<string>({
    unavailable: 'Muitas entradas pendentes. Aguarde.',
    now: () => now,
  });
  assert.equal(pending.add('request', 'opaque', 2000), true);
  t.mock.timers.tick(1000);
  assert.equal(pending.get('request'), 'opaque');
  now = 2000;
  t.mock.timers.tick(1000);
  assert.equal(pending.get('request'), undefined);
  pending.close();
});
