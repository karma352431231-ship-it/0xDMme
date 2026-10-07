import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicModerationWorker } from '../src/server/public-moderation/index.ts';
import { publicModerationPolicy } from '../src/shared/public-moderation/index.ts';
import type { PublicModerationClaim } from '../src/server/database/index.ts';

const job: PublicModerationClaim = {
  id: crypto.randomUUID(),
  owner: crypto.randomUUID(),
  target: crypto.randomUUID(),
  kind: 'avatar',
  contentHash: 'a'.repeat(64),
  modelHash: 'b'.repeat(64),
  runtime: 'test',
  policy: publicModerationPolicy,
  lease: crypto.randomUUID(),
};
const bind = () => Promise.resolve(() => Promise.resolve());
await test('worker: sem scanner validado não consome nem aprova a fila', async () => {
  const worker = new PublicModerationWorker({
    runner: null,
    bind,
    queue: {
      recover: () => Promise.resolve(0),
      claim: () => Promise.reject(new Error('Não consumir sem scanner.')),
      finish: () => Promise.reject(new Error('Não aprovar sem scanner.')),
      fail: () => Promise.resolve(),
    },
  });
  await worker.initialize();
  worker.start();
  await worker.run();
  await worker.close();
});
await test('worker: inferência concorrente é compartilhada e aborto não confirma uma decisão tardia', async () => {
  let enter: () => void = () => {
    throw new Error('Não inicializado.');
  };
  const entered = new Promise<void>((accept) => {
    enter = accept;
  });
  let claims = 0,
    failed = 0,
    finished = 0;
  const worker = new PublicModerationWorker({
    bind,
    queue: {
      recover: () => Promise.resolve(0),
      claim: () => {
        claims++;
        return Promise.resolve(job);
      },
      finish: () => {
        finished++;
        return Promise.resolve();
      },
      fail: () => {
        failed++;
        return Promise.resolve();
      },
    },
    runner: {
      model: { hash: job.modelHash, runtime: job.runtime },
      evaluate: (current, signal) => {
        enter();
        return new Promise((accept) => {
          signal.addEventListener(
            'abort',
            () =>
              accept({
                ...current,
                frames: 1,
                expectedFrames: 1,
                verdict: 'allow',
              }),
            { once: true },
          );
        });
      },
    },
  });
  const first = worker.run(),
    second = worker.run();
  await entered;
  await worker.close();
  await Promise.all([first, second]);
  assert.equal(claims, 1);
  assert.equal(failed, 1);
  assert.equal(finished, 0);
  assert.throws(() => worker.start(), /encerrado/);
});
