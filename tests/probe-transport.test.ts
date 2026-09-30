import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedResponse } from '../src/client/probe-transport/index.ts';
import { maxResponseBytes } from '../src/shared/crypto-probe/index.ts';

await test('corpo grande é interrompido antes de alimentar JSON/motor criptográfico', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(maxResponseBytes + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(boundedResponse(new Response(stream)), /excede/);
  assert.equal(canceled, true);
});

await test('UTF-8 malformado e status de erro não são apresentados como sucesso', async () => {
  await assert.rejects(boundedResponse(new Response(new Uint8Array([0xff]))));
  await assert.rejects(
    boundedResponse(new Response('{}', { status: 403 })),
    /rejeitada/,
  );
  assert.equal(
    await boundedResponse(new Response('{"texto":"ação"}')),
    '{"texto":"ação"}',
  );
});
