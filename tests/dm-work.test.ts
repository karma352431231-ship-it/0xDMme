import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmWork } from '../src/client/communities/dm-work.ts';
import { deferred } from './fixtures/deferred.ts';

await test('troca de DM espera IO anterior e substitui navegação antiga, sem ignorar a última abertura', async () => {
  const queue = new DmWork(),
    held = deferred<void>(),
    calls: string[] = [];
  const first = queue.run(async () => {
    calls.push('first');
    await held.promise;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  queue.reset();
  const stale = queue.run(() => {
    calls.push('stale');
    return Promise.resolve();
  });
  queue.reset();
  const latest = queue.run(() => {
    calls.push('latest');
    return Promise.resolve();
  });
  held.resolve();
  await Promise.all([first, stale, latest]);
  assert.deepEqual(calls, ['first', 'latest']);
  assert.equal(queue.busy, false);
});
await test('falha libera a execução seguinte e repete somente o trabalho explicitamente solicitado', async () => {
  const queue = new DmWork();
  await assert.rejects(
    queue.run(() => Promise.reject(new Error('falha'))),
    /falha/u,
  );
  let called = false;
  await queue.run(() => {
    called = true;
    return Promise.resolve();
  });
  assert.equal(called, true);
});
