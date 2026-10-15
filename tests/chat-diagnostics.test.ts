import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { observeAuthorityLocks } from '../src/tools/chat-diagnostics/locks.ts';
import {
  observeNetwork,
  requestCategory,
} from '../src/tools/chat-diagnostics/network.ts';
import {
  controlFrames,
  observeControlFrames,
} from '../src/tools/chat-diagnostics/stream.ts';
import { deferred } from './fixtures/deferred.ts';

await test('capture is bounded, stops recording and excludes identifiers from request categories', (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://0xdmme.app/', origin: 'https://0xdmme.app' },
  });
  t.after(() => {
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  assert.equal(
    requestCategory('/api/account/messages/snapshot?secret=private'),
    'messages/snapshot',
  );
  assert.equal(
    requestCategory('/api/account/messages/private-contact-id'),
    'other-account-api',
  );
  assert.equal(
    requestCategory('/api/account/messages/object/private-contact-id'),
    null,
  );
  assert.equal(
    requestCategory('https://example.com/api/account/messages/snapshot'),
    null,
  );
  const capture = new Recording();
  for (let i = 0; i < 1600; i++) capture.record('manual-marker');
  assert.equal(capture.report().events.length, 1500);
  assert.equal(capture.report().droppedEvents, 100);
  capture.stop();
  const stopped = capture.report();
  capture.record('late-callback');
  assert.deepEqual(capture.report(), stopped);
});

await test('network observation keeps response/body/signal and failures intact without initiating requests or retaining private data', async (t) => {
  const previous = ['window', 'location'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const capture = new Recording();
  const signal = new AbortController().signal;
  const options = {
    method: 'POST',
    signal,
    headers: { 'X-Hash-Talk-CSRF': 'secret-csrf' },
    body: 'private-message-body',
  };
  const response = Response.json({ secret: 'private-response-body' });
  const failure = new Error('private-failure-message');
  const headers = deferred<Response>();
  let requests = 0;
  const nativeFetch: typeof fetch = (input, init) => {
    requests++;
    assert.equal(input, '/api/account/messages/snapshot?private-query');
    assert.equal(init, options);
    return requests === 1 ? headers.promise : Promise.reject(failure);
  };
  const host = { fetch: nativeFetch };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://0xdmme.app/', origin: 'https://0xdmme.app' },
  });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const json = Reflect.get(Response.prototype, 'json');
  const stop = observeNetwork(capture.record, () => ['lock-1']);
  t.after(stop);
  assert.equal(requests, 0);
  const pending = host.fetch(
    '/api/account/messages/snapshot?private-query',
    options,
  );
  assert.equal(capture.report().events.at(-1)?.kind, 'request-start');
  headers.resolve(response);
  assert.equal(await pending, response);
  assert.equal(response.bodyUsed, false);
  assert.deepEqual(await response.json(), { secret: 'private-response-body' });
  assert.ok(
    capture.report().events.some((event) => event.kind === 'response-body'),
  );
  await assert.rejects(
    host.fetch('/api/account/messages/snapshot?private-query', options),
    (error: unknown) => error === failure,
  );
  const text = JSON.stringify(capture.report());
  for (const secret of [
    'private-query',
    'secret-csrf',
    'private-message-body',
    'private-response-body',
    'private-failure-message',
  ])
    assert.ok(!text.includes(secret));
  stop();
  assert.equal(host.fetch, nativeFetch);
  assert.equal(Reflect.get(Response.prototype, 'json'), json);
  assert.equal(requests, 2);
});

await test('authority observation separates queue/hold time, preserves options/results and restores the installed lock method', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  const capture = new Recording();
  const entered = deferred<void>(),
    gate = deferred<void>(),
    granted = deferred<void>();
  const options: LockOptions = {
    mode: 'exclusive',
    signal: new AbortController().signal,
  };
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const manager = {
    async request<T>(
      name: string,
      incoming: LockOptions | LockGrantedCallback<T>,
      callback?: LockGrantedCallback<T>,
    ): Promise<Awaited<T>> {
      assert.equal(name, '0xdmme-device-authority:private-account');
      assert.equal(incoming, options);
      await granted.promise;
      assert.ok(callback);
      return await callback({ name, mode: 'exclusive' });
    },
  };
  const native = Reflect.get(manager, 'request');
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: manager,
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
    else Reflect.deleteProperty(navigator, 'locks');
  });
  const hook = observeAuthorityLocks(capture.record);
  t.after(hook.stop);
  const pending = manager.request(
    '0xdmme-device-authority:private-account',
    options,
    async (lock) => {
      assert.equal(lock?.name, '0xdmme-device-authority:private-account');
      entered.resolve();
      await gate.promise;
      return 'private-callback-result';
    },
  );
  assert.equal(capture.report().events.at(-1)?.kind, 'lock-queued');
  now = 1200;
  granted.resolve();
  await entered.promise;
  assert.deepEqual(hook.active(), ['lock-1']);
  now = 3500;
  gate.resolve();
  assert.equal(await pending, 'private-callback-result');
  assert.deepEqual(hook.active(), []);
  assert.equal(
    capture.report().events.find((e) => e.kind === 'lock-acquired')?.['waitMs'],
    1200,
  );
  assert.equal(
    capture.report().events.find((e) => e.kind === 'lock-released')?.['heldMs'],
    2300,
  );
  assert.ok(!JSON.stringify(capture.report()).includes('private-'));
  hook.stop();
  assert.equal(Reflect.get(manager, 'request'), native);
});

await test('control observation accepts only empty complete protocol frames and preserves stream values, completion and cancellation', async (t) => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  assert.deepEqual(
    controlFrames(bytes('event: changed\ndata: {}\n\n: heartbeat\n\n')),
    ['changed', 'heartbeat'],
  );
  for (const input of [
    'event: changed\ndata: {"secret":"private"}\n\n',
    'event: changed\ndata: {}\n',
    'private-message-body',
    'event: private-contact\ndata: {}\n\n',
  ])
    assert.deepEqual(controlFrames(bytes(input)), []);
  const capture = new Recording();
  const chunk = bytes('event: removed\ndata: {}\n\n');
  let cancelled: unknown = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
    },
    cancel(reason: unknown) {
      cancelled = reason;
    },
  });
  const reader = stream.getReader();
  const native = Reflect.get(
    ReadableStreamDefaultReader.prototype,
    'read',
  ) as typeof reader.read;
  const stop = observeControlFrames(capture.record);
  t.after(stop);
  assert.equal((await reader.read()).value, chunk);
  assert.equal(capture.report().events.at(-1)?.['event'], 'removed');
  await reader.cancel('private-cancellation-reason');
  assert.equal(cancelled, 'private-cancellation-reason');
  assert.equal((await reader.read()).done, true);
  assert.ok(!JSON.stringify(capture.report()).includes('private'));
  stop();
  assert.equal(
    Reflect.get(ReadableStreamDefaultReader.prototype, 'read'),
    native,
  );
});
