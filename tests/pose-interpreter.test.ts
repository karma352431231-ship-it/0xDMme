import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ModerationInterpreter } from '../src/server/public-moderation/interpreter.ts';

function interpreter(mode: string) {
  return new ModerationInterpreter({
    executable: process.execPath,
    args: [
      fileURLToPath(
        new URL('./fixtures/pose-interpreter.mjs', import.meta.url),
      ),
      mode,
      'a'.repeat(64),
    ],
    model: 'a'.repeat(64),
  });
}
await test('processo persistente associa cada resposta à solicitação e encerra', async () => {
  const worker = interpreter('ok');
  try {
    await worker.ready(AbortSignal.timeout(3000));
    for (let id = 1; id <= 2; id++)
      assert.deepEqual(await worker.evaluate({}, AbortSignal.timeout(3000)), {
        id,
        verdicts: ['allow'],
      });
  } finally {
    await worker.close();
  }
  await assert.rejects(
    worker.evaluate({}, AbortSignal.timeout(1000)),
    /indisponível/u,
  );
});
await test('identidade incorreta, saída inesperada e falha do processo impedem resultado', async () => {
  for (const mode of [
    'wrong-model',
    'startup-exit',
    'stale',
    'exit',
    'oversized',
  ]) {
    const worker = interpreter(mode);
    try {
      await assert.rejects(
        worker.evaluate({}, AbortSignal.timeout(3000)),
        /indisponível/u,
      );
    } finally {
      await worker.close();
    }
  }
});
await test('aborto e close interrompem inferência travada, sem promessa ou processo pendente', async () => {
  for (const action of ['abort', 'close']) {
    const worker = interpreter('hang'),
      stop = new AbortController();
    await worker.ready(AbortSignal.timeout(3000));
    const result = worker.evaluate({}, stop.signal);
    const rejected = assert.rejects(result, /indisponível/u);
    if (action === 'abort') stop.abort();
    else await worker.close();
    await rejected;
    await worker.close();
  }
});
await test('inferência simultânea e requisição excessiva não são enfileiradas sem limite', async () => {
  const worker = interpreter('hang'),
    stop = new AbortController();
  await worker.ready(AbortSignal.timeout(3000));
  const pending = worker.evaluate({}, stop.signal),
    rejected = assert.rejects(pending, /indisponível/u);
  await assert.rejects(worker.evaluate({}, stop.signal), /progress/u);
  stop.abort();
  await rejected;
  await worker.close();
  const next = interpreter('ok');
  try {
    await assert.rejects(
      next.evaluate(
        { bytes: 'x'.repeat(50_500_000) },
        AbortSignal.timeout(3000),
      ),
      /indisponível/u,
    );
  } finally {
    await next.close();
  }
});
