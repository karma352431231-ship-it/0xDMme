import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedResponse } from '../src/client/probe-transport/index.ts';
import { maxResponseBytes } from '../src/shared/crypto-probe/index.ts';

await test('large body is interrupted before feeding JSON or the cryptographic engine', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(maxResponseBytes + 1));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(boundedResponse(new Response(stream)), /exceed/);
  assert.equal(canceled, true);
});

await test('malformed UTF-8 and error status are never presented as success', async () => {
  await assert.rejects(boundedResponse(new Response(new Uint8Array([0xff]))));
  await assert.rejects(
    boundedResponse(new Response('{}', { status: 403 })),
    /rejected/,
  );
  assert.equal(
    await boundedResponse(new Response('{"texto":"ação"}')),
    '{"texto":"ação"}',
  );
});
