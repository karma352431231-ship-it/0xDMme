import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicModerationService } from '../src/server/public-moderation/index.ts';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise não inicializada.');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

await test('moderação: limpeza concorrente compartilha trabalho e encerramento aguarda o lote em curso', async () => {
  const entered = deferred<void>(),
    done = deferred<number>();
  let avatars = 0,
    photos = 0;
  const service = new PublicModerationService({
    profiles: {
      collectModeration: () => {
        avatars++;
        return Promise.resolve(32);
      },
    },
    communities: {
      collectModeration: () => {
        photos++;
        entered.resolve();
        return done.promise;
      },
    },
  });
  const first = service.clean(),
    second = service.clean();
  await entered.promise;
  let closed = false;
  const closing = service.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  done.resolve(32);
  await Promise.all([first, second, closing]);
  assert.equal(avatars, 1);
  assert.equal(photos, 1);
  assert.equal(closed, true);
  await service.clean();
  assert.equal(avatars, 1);
  assert.throws(() => service.start(), /encerrado/);
});

await test('moderação: erro de coleta é propagado e permite nova rodada sem sobrepor os lotes', async () => {
  let attempts = 0,
    photos = 0;
  const service = new PublicModerationService({
    profiles: {
      collectModeration: () => {
        attempts++;
        return attempts === 1
          ? Promise.reject(new Error('Banco indisponível.'))
          : Promise.resolve(0);
      },
    },
    communities: {
      collectModeration: () => {
        photos++;
        return Promise.resolve(0);
      },
    },
  });
  await assert.rejects(service.clean(), /Banco indisponível/);
  assert.equal(photos, 0);
  await service.clean();
  assert.equal(attempts, 2);
  assert.equal(photos, 1);
  await service.close();
});
