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

await test('public download omits session, follows no redirects and validates bytes and MIME', async (t) => {
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
  await assert.rejects(read(), /[Uu]navailable/u);
});

await test('result and thumbnail use the approved contract; extra bytes are rejected and the reader is cancelled', async (t) => {
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
    /exceed/u,
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
await test('media page keeps four active reads; leaving cancels queued items', async (t) => {
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

await test('video loads on entering the viewport and releases bytes on leaving without an open or download click', async (t) => {
  const { showPublicPostMedia } =
    await import('../src/client/public-media/index.ts');
  const { CommunityNode, communityDocument } =
    await import('./fixtures/community-dom.ts');
  const document = communityDocument();
  const create = document.createElement;
  const video = Object.assign(new CommunityNode('video'), {
    currentTime: 0,
    duration: 120,
    src: '',
    poster: '',
    controls: false,
    preload: '',
    autoplay: false,
    load() {},
    pause() {},
  });
  document.createElement = (tag) => (tag === 'video' ? video : create(tag));
  for (const element of [video])
    Object.assign(element, { style: { setProperty() {} } });
  const originalCreate = document.createElement;
  document.createElement = (tag) => {
    const node = originalCreate(tag);
    return Object.assign(node, {
      style: { setProperty() {} },
      isConnected: true,
    });
  };
  let visible: (entries: Array<{ isIntersecting: boolean }>) => void = () => {},
    disconnected = false,
    requested = 0;
  const globals = ['document', 'IntersectionObserver'] as const;
  const previous = globals.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  const revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', () => `blob:synthetic-${requested}`);
  t.mock.method(URL, 'revokeObjectURL', (url: string) => {
    revoked.push(url);
  });
  t.mock.method(globalThis, 'fetch', (path: string) => {
    requested++;
    const thumbnail = path.endsWith('/thumbnail');
    return Promise.resolve(
      new Response(new Uint8Array(thumbnail ? 2 : 3), {
        headers: {
          'Content-Type': thumbnail ? 'image/png' : 'video/mp4',
          'Content-Length': thumbnail ? '2' : '3',
        },
      }),
    );
  });
  const stop = new AbortController();
  try {
    const host = new CommunityNode();
    const cleanup = showPublicPostMedia(
      host as unknown as HTMLElement,
      [
        {
          id: crypto.randomUUID(),
          review: crypto.randomUUID(),
          result: {
            kind: 'video',
            type: 'video/mp4',
            bytes: 3,
            width: 360,
            height: 640,
            seconds: 120,
            fps: 30,
            thumbnailBytes: 2,
            normalized: true,
          },
        },
      ],
      stop.signal,
    );
    assert.equal(requested, 0);
    assert.equal(host.querySelectorAll('video').length, 1);
    visible([{ isIntersecting: true }]);
    while (!video.src)
      await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(requested, 2);
    assert.equal(video.controls, true);
    assert.equal(video.autoplay, false);
    assert.equal(video.preload, 'auto');
    assert.equal(host.querySelectorAll('a').length, 0);
    assert.equal(host.textContent.includes('Abrir vídeo'), false);
    visible([{ isIntersecting: false }]);
    assert.equal(revoked.length, 1);
    cleanup();
    assert.equal(revoked.length, 2);
    assert.equal(disconnected, true);
  } finally {
    stop.abort();
    for (const [index, name] of globals.entries()) {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

await test('feed photo loads full bytes on entering the viewport and releases them on leaving; click remains available', async (t) => {
  const { showPublicPostMedia } =
    await import('../src/client/public-media/index.ts');
  const { CommunityNode, communityDocument } =
    await import('./fixtures/community-dom.ts');
  const document = communityDocument();
  let visible: (entries: Array<{ isIntersecting: boolean }>) => void = () => {},
    disconnected = false;
  const saved = ['document', 'IntersectionObserver'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  const paths: string[] = [],
    revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', () => 'blob:photo');
  t.mock.method(URL, 'revokeObjectURL', (url: string) => revoked.push(url));
  t.mock.method(globalThis, 'fetch', (url: string, options: RequestInit) => {
    paths.push(url);
    assert.equal(options.credentials, 'omit');
    return Promise.resolve(
      new Response(new Uint8Array(3), {
        headers: { 'Content-Type': 'image/png', 'Content-Length': '3' },
      }),
    );
  });
  try {
    const host = new CommunityNode(),
      stop = new AbortController();
    const cleanup = showPublicPostMedia(
      host as unknown as HTMLElement,
      [
        {
          id: crypto.randomUUID(),
          review: crypto.randomUUID(),
          result: {
            kind: 'photo',
            type: 'image/png',
            bytes: 3,
            width: 1000,
            height: 800,
            seconds: 0,
            fps: 0,
            thumbnailBytes: 2,
            normalized: true,
          },
        },
      ],
      stop.signal,
    );
    assert.equal(paths.length, 0);
    visible([{ isIntersecting: true }]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(paths.length, 1);
    assert.equal(paths[0]!.endsWith('/thumbnail'), false);
    assert.equal(host.querySelector('img')!.hidden, false);
    assert.equal(
      host.querySelector('button')!.getAttribute('aria-label'),
      'Zoom in on image',
    );
    visible([{ isIntersecting: false }]);
    assert.equal(host.querySelector('img')!.hidden, true);
    assert.deepEqual(revoked, ['blob:photo']);
    cleanup();
    assert.equal(disconnected, true);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
