import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicAvatarBlob,
  publicPostMediaBlob,
} from '../src/client/public-media/index.ts';
import {
  publicAvatarPath,
  publicPostMedia,
} from '../src/shared/public-media/index.ts';

await test('download público omite sessão, não segue redirects e valida bytes e MIME', async (t) => {
  const target = crypto.randomUUID(),
    review = crypto.randomUUID(),
    reference = publicAvatarPath('avatar', target, review),
    controller = new AbortController(),
    bytes = new Uint8Array([1, 2, 3]);
  let response = new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
  });
  t.mock.method(globalThis, 'fetch', (url: string, options: RequestInit) => {
    assert.equal(url, reference);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers, undefined);
    return Promise.resolve(response);
  });
  const read = () =>
    publicAvatarBlob({
      kind: 'avatar',
      target,
      reference,
      signal: controller.signal,
    });
  assert.deepEqual(new Uint8Array(await (await read()).arrayBuffer()), bytes);
  for (const [type, length, body] of [
    ['text/html', '3', bytes],
    ['image/png', '3000001', bytes],
    ['image/png', '4', bytes],
    ['image/png', '2', bytes],
    ['image/png', '0', bytes],
  ] as const) {
    response = new Response(body, {
      headers: { 'Content-Type': type, 'Content-Length': length },
    });
    await assert.rejects(read());
  }
  response = new Response(bytes, { status: 404 });
  await assert.rejects(read(), /indisponível/u);
});

await test('resultado e miniatura usam o contrato aprovado; bytes extras são recusados e o reader é cancelado', async (t) => {
  const item = publicPostMedia([
    {
      id: crypto.randomUUID(),
      review: crypto.randomUUID(),
      result: {
        kind: 'video',
        type: 'video/mp4',
        bytes: 3,
        width: 64,
        height: 64,
        seconds: 1,
        fps: 30,
        thumbnailBytes: 2,
        normalized: true,
      },
    },
  ])[0]!;
  let thumbnail = false,
    cancelled = false;
  t.mock.method(globalThis, 'fetch', (url: string, options: RequestInit) => {
    assert.equal(url.endsWith('/thumbnail'), thumbnail);
    assert.equal(options.credentials, 'omit');
    const body = thumbnail
      ? new Uint8Array([1, 2])
      : new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          },
          cancel() {
            cancelled = true;
          },
        });
    return Promise.resolve(
      new Response(body, {
        headers: {
          'Content-Type': thumbnail ? 'image/png' : 'video/mp4',
          'Content-Length': thumbnail ? '2' : '3',
        },
      }),
    );
  });
  await assert.rejects(
    publicPostMediaBlob(item, false, new AbortController().signal),
    /excedida/u,
  );
  assert.equal(cancelled, true);
  thumbnail = true;
  const blob = await publicPostMediaBlob(
    item,
    true,
    new AbortController().signal,
  );
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 2);
});
await test('uma página de mídias mantém quatro leituras ativas; saída cancela itens ainda na fila', async (t) => {
  let active = 0,
    peak = 0,
    requests = 0;
  const finish: Array<() => void> = [];
  t.mock.method(globalThis, 'fetch', () => {
    active++;
    requests++;
    peak = Math.max(peak, active);
    return new Promise<Response>((resolve) =>
      finish.push(() => {
        active--;
        resolve(
          new Response(new Uint8Array([1]), {
            headers: { 'Content-Type': 'image/png', 'Content-Length': '1' },
          }),
        );
      }),
    );
  });
  const target = crypto.randomUUID(),
    reference = publicAvatarPath('avatar', target, crypto.randomUUID()),
    stops = Array.from({ length: 12 }, () => new AbortController()),
    jobs = stops.map((stop) =>
      publicAvatarBlob({
        target,
        reference,
        kind: 'avatar',
        signal: stop.signal,
      }),
    );
  const completed = Promise.allSettled(jobs);
  assert.equal(requests, 4);
  stops[11]!.abort();
  while (finish.length) {
    for (const next of finish.splice(0)) next();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const result = await completed;
  assert.equal(peak, 4);
  assert.equal(requests, 11);
  assert.equal(result.filter((item) => item.status === 'fulfilled').length, 11);
  assert.equal(result[11]?.status, 'rejected');
});
