import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { NativeApiTransport } from '../src/client/native-api/index.ts';
import { WakeupFrames } from '../src/client/message-live/index.ts';
import { LiveRequest } from '../src/client/message-live/request.ts';
import { installNativeApiTransport } from '../src/client/api-transport/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import {
  chunk,
  deferred,
  FixtureBridge,
} from './fixtures/native-api-bridge.ts';

function fixture(t: TestContext) {
  const bridge = new FixtureBridge();
  const transport = new NativeApiTransport(bridge);
  t.after(() => transport.close());
  return { bridge, transport };
}
function failure(error: unknown): boolean {
  assert.ok(error instanceof TypeError);
  assert.equal(error.message, 'Native API exchange failed.');
  return true;
}
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

await test('native request preserves signed JSON and CSRF; the bridge receives no configurable destination or cookie', async (t) => {
  const { bridge, transport } = fixture(t);
  const body = JSON.stringify({
    signature: 'synthetic-signature',
    payload: { value: 'fixture' },
  });
  bridge.chunks = [chunk('{"ok":true}', true)];
  const response = await transport.fetch('/api/account/messages/publish', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Hash-Talk-CSRF': 'a'.repeat(64),
    },
    body,
  });
  assert.equal(bridge.reads.length, 0, 'do not prefetch an unconsumed body');
  assert.equal(response.headers.has('set-cookie'), false);
  assert.deepEqual(await response.json(), { ok: true });
  const request = bridge.opened[0]!;
  assert.equal(request.body, body);
  assert.equal(request.headers['x-hash-talk-csrf'], 'a'.repeat(64));
  assert.equal(request.credentials, 'same-origin');
  assert.match(request.id, /^[a-f0-9-]{36}$/u);
  assert.deepEqual(
    Object.keys(request).sort(),
    ['id', 'path', 'method', 'credentials', 'headers', 'body'].sort(),
  );
  assert.equal(bridge.cancelled.length, 0, 'native EOF releases the handle');
});

await test('public reads and view receipts preserve anonymous credentials', async (t) => {
  const { bridge, transport } = fixture(t);
  for (const path of [
    '/api/communities?after=fixture%20cursor',
    '/api/public-profiles/handle',
    '/api/public-media/avatar/id/review',
  ]) {
    const response = await transport.fetch(path, { credentials: 'omit' });
    await response.text();
    assert.equal(bridge.opened.at(-1)?.credentials, 'omit');
  }
  assert.equal(new Set(bridge.opened.map((request) => request.id)).size, 3);
});

await test('invalid destinations and privileged request headers fail before calling native code', async (t) => {
  const { bridge, transport } = fixture(t);
  const paths = [
    'https://untrusted.invalid/api/account/session',
    '//untrusted.invalid/api/account/session',
    'https://0xdmme.app/api/account/session',
    '/api/account/../session',
    '/api/account/%2e%2e/session',
    '/api/account/%2f/session',
    '/api/account\\session',
    '/api/account/session#secret',
    '/api/account//session',
    '/api/accounting/session',
    '/api/unknown/session',
    '/wallet-entry',
    '/api/account/session\n',
  ];
  for (const path of paths)
    await assert.rejects(transport.fetch(path, {}), failure);
  for (const name of [
    'Cookie',
    'Authorization',
    'Host',
    'Origin',
    'Referer',
    'X-Forwarded-Host',
  ])
    await assert.rejects(
      transport.fetch('/api/account/session', {
        headers: { [name]: 'synthetic-secret' },
      }),
      failure,
    );
  assert.equal(bridge.opened.length, 0);
});

await test('native transport refuses unsupported modes and oversized UTF-8 without widening its contract', async (t) => {
  const { bridge, transport } = fixture(t);
  const inputs: RequestInit[] = [
    { method: 'DELETE' },
    { credentials: 'include' },
    { redirect: 'follow' },
    { mode: 'no-cors' },
    { keepalive: true },
    { method: 'GET', body: '{}' },
    { method: 'POST', body: new Blob(['fixture']) },
    { method: 'POST', body: '{}' },
    {
      method: 'POST',
      body: 'é'.repeat(4_200_001),
      headers: { 'Content-Type': 'application/json' },
    },
  ];
  for (const input of inputs)
    await assert.rejects(transport.fetch('/api/account/login', input), failure);
  assert.equal(bridge.opened.length, 0);
});

await test('HTTP errors retain status and content type without retrying mutations', async (t) => {
  const { bridge, transport } = fixture(t);
  for (const status of [401, 403, 429, 502, 503, 504]) {
    bridge.head = {
      status,
      headers: {
        'content-type': 'text/html',
        'retry-after': '3',
        'x-0xdmme-server-time': '1800000000000',
      },
    };
    bridge.chunks = [chunk('<html>synthetic failure</html>', true)];
    const response = await transport.fetch('/api/account/login', {});
    assert.equal(response.status, status);
    assert.equal(response.headers.get('content-type'), 'text/html');
    assert.equal(response.headers.get('x-0xdmme-server-time'), '1800000000000');
    await response.body?.cancel();
  }
  assert.equal(bridge.opened.length, 6);
});

await test('redirects, private response metadata and malformed headers are rejected and cancelled', async (t) => {
  const heads: unknown[] = [
    { status: 302, headers: { location: 'https://untrusted.invalid/' } },
    { status: 200, headers: { 'set-cookie': 'synthetic-private-cookie' } },
    { status: 200, headers: {}, cookie: 'synthetic-private-cookie' },
    { status: 200, headers: { 'content-type': 'application/json\nsecret' } },
    { status: 200, headers: { 'content-length': '268435457' } },
    { status: 200, headers: { 'content-length': '-1' } },
    { status: 200, headers: { 'content-length': '3e2' } },
    { status: '200', headers: {} },
  ];
  for (const head of heads) {
    const { bridge, transport } = fixture(t);
    bridge.head = head;
    await assert.rejects(transport.fetch('/api/account/session', {}), failure);
    assert.equal(bridge.cancelled.length, 1);
  }
});

for (const path of [
  '/api/account/messages/live',
  '/api/communities/ranking-events',
]) {
  await test(`native wakeup stream ${path} preserves frames, credentials and backpressure`, async (t) => {
    const { bridge, transport } = fixture(t);
    bridge.head = {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    };
    bridge.chunks = [
      chunk('event: ready\ndata: {}\n'),
      chunk('\nevent: changed\ndata: {}\n\n'),
      chunk('', true),
    ];
    const response = await transport.fetch(path, {
      credentials: 'omit',
      headers: { Accept: 'text/event-stream' },
    });
    const reader = response.body!.getReader();
    const parser = new WakeupFrames();
    assert.equal(bridge.opened[0]?.credentials, 'omit');
    assert.equal(bridge.opened[0]?.headers['accept'], 'text/event-stream');
    assert.equal(bridge.reads.length, 0);
    assert.deepEqual(parser.accept((await reader.read()).value!), []);
    assert.equal(bridge.reads.length, 1);
    assert.deepEqual(parser.accept((await reader.read()).value!), [
      'ready',
      'changed',
    ]);
    assert.equal(bridge.reads.length, 2);
    assert.equal(bridge.reads[0]?.bytes, 4096);
    assert.equal((await reader.read()).done, true);
    reader.releaseLock();
  });
}

await test('the installed client opens its signed live request and receives the first handle hint', async (t) => {
  const installed = Object.getOwnPropertyDescriptor(
    globalThis,
    'INSTALLED_APP',
  );
  Object.defineProperty(globalThis, 'INSTALLED_APP', {
    configurable: true,
    value: true,
  });
  t.after(() => {
    if (installed)
      Object.defineProperty(globalThis, 'INSTALLED_APP', installed);
    else Reflect.deleteProperty(globalThis, 'INSTALLED_APP');
  });
  const { bridge, transport } = fixture(t);
  installNativeApiTransport(transport);
  bridge.head = {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  };
  bridge.chunks = [
    chunk('event: ready\ndata: {}\n\n'),
    chunk('event: handle-messages\ndata: {}\n\n'),
  ];
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) =>
      work({
        session,
        directory: 'b'.repeat(64),
        offline: false,
        epoch: 1,
        events: [],
        key: () => Promise.reject(new Error('Unused')),
        sign: () => Promise.resolve('synthetic-signature'),
      }),
    withLocalVault: () => Promise.reject(new Error('Unused')),
  };
  const controller = new AbortController();
  const response = await new LiveRequest().open({
    access,
    session,
    signal: controller.signal,
    current: () => true,
  });
  assert.equal(bridge.opened.length, 1);
  const request = bridge.opened[0]!;
  assert.equal(request.path, '/api/account/messages/live');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['x-0xdmme-call-wake'], '1');
  assert.equal(request.headers['x-hash-talk-csrf'], session.csrf);
  const parser = new WakeupFrames();
  const reader = response.body!.getReader();
  assert.deepEqual(parser.accept((await reader.read()).value!), ['ready']);
  assert.deepEqual(parser.accept((await reader.read()).value!), [
    'handle-messages',
  ]);
  await reader.cancel();
  reader.releaseLock();
});

await test('the native call wake opt-in is limited to a single value on the signed stream route', async (t) => {
  const { bridge, transport } = fixture(t);
  const live = '/api/account/messages/live';
  for (const [path, method, value] of [
    ['/api/communities/ranking-events', 'POST', '1'],
    [live + '?other=1', 'POST', '1'],
    [live, 'GET', '1'],
    [live, 'POST', '0'],
    [live, 'POST', '1, 1'],
  ] as const)
    await assert.rejects(
      transport.fetch(path, {
        method,
        headers: { 'X-0xdmme-Call-Wake': value },
      }),
      failure,
    );
  assert.equal(bridge.opened.length, 0);
});

await test('stream failure never manufactures EOF success or accepts noncanonical/oversized chunks', async (t) => {
  for (const value of [
    { done: false, data: '' },
    { done: true, data: 'Zh==' },
    { done: false, data: 'not base64' },
    { done: 'true', data: '' },
    { done: true, data: '', cookie: 'synthetic' },
    { done: true, data: Buffer.alloc(128 * 1024 + 1).toString('base64') },
  ]) {
    const { bridge, transport } = fixture(t);
    bridge.chunks = [value];
    const response = await transport.fetch(
      '/api/account/messages/snapshot',
      {},
    );
    await assert.rejects(response.text(), failure);
    await flush();
    assert.equal(bridge.cancelled.length, 1);
  }
});

await test('declared response length rejects missing and extra bytes', async (t) => {
  for (const length of ['1', '3']) {
    const { bridge, transport } = fixture(t);
    bridge.head = { status: 200, headers: { 'content-length': length } };
    bridge.chunks = [chunk('ab', true)];
    const response = await transport.fetch('/api/account/session', {});
    await assert.rejects(response.text(), failure);
  }
});

await test('live chunks cannot exceed the existing wakeup parser budget', async (t) => {
  const { bridge, transport } = fixture(t);
  bridge.head = {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  };
  bridge.chunks = [chunk('x'.repeat(4097), true)];
  const response = await transport.fetch('/api/account/messages/live', {});
  await assert.rejects(response.text(), failure);
  assert.equal(bridge.reads[0]?.bytes, 4096);
});

await test('already-aborted calls never start native work or expose the caller reason', async (t) => {
  const { bridge, transport } = fixture(t);
  const signal = AbortSignal.abort(new Error('synthetic-private-reason'));
  await assert.rejects(
    transport.fetch('/api/account/session', { signal }),
    (error: unknown) => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, 'AbortError');
      assert.equal(error.message.includes('private'), false);
      return true;
    },
  );
  assert.equal(bridge.opened.length, 0);
});

await test('abort during headers or body cancels exactly once and ignores late native completion', async (t) => {
  for (const phase of ['headers', 'body']) {
    const { bridge, transport } = fixture(t);
    const reply = deferred<unknown>();
    const caller = new AbortController();
    if (phase === 'headers') bridge.openReply = reply.promise;
    else bridge.readReply = reply.promise;
    const pending = transport.fetch('/api/account/messages/page', {
      signal: caller.signal,
    });
    const result = phase === 'headers' ? pending : (await pending).text();
    await flush();
    caller.abort();
    await assert.rejects(result, { name: 'AbortError' });
    reply.reject(new Error('synthetic-private-native-exception'));
    await flush();
    assert.equal(bridge.cancelled.length, 1);
  }
});

await test('native failure messages are sanitized before reaching a caller', async (t) => {
  const { bridge, transport } = fixture(t);
  bridge.openReply = Promise.reject(
    new Error('https://fixture.invalid?ticket=synthetic-secret'),
  );
  await assert.rejects(transport.fetch('/api/account/session', {}), failure);
});

await test('HEAD and empty-status responses release native resources without reading a body', async (t) => {
  const { bridge, transport } = fixture(t);
  for (const [method, status] of [
    ['HEAD', 200],
    ['GET', 204],
    ['GET', 205],
  ] as const) {
    bridge.head = { status, headers: {} };
    const response = await transport.fetch('/api/account/session', { method });
    assert.equal(response.body, null);
  }
  assert.equal(bridge.reads.length, 0);
  assert.equal(bridge.cancelled.length, 3);
});

await test('eight-exchange budget is released by cancel and shutdown aborts pending readers', async (t) => {
  const { bridge, transport } = fixture(t);
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      transport.fetch('/api/account/session', {}),
    ),
  );
  await assert.rejects(transport.fetch('/api/account/session', {}), failure);
  await responses[0]!.body!.cancel();
  const next = await transport.fetch('/api/account/session', {});
  bridge.readReply = deferred<unknown>().promise;
  const reading = next.text();
  await flush();
  await transport.close();
  await assert.rejects(reading, { name: 'AbortError' });
  await assert.rejects(transport.fetch('/api/account/session', {}), failure);
  assert.equal(bridge.cancelled.length, 9);
});

await test('failed native disposal disables the transport instead of accumulating orphan requests', async (t) => {
  const { bridge, transport } = fixture(t);
  bridge.cancelReply = Promise.reject(new Error('synthetic native failure'));
  const response = await transport.fetch('/api/account/session', {});
  await response.body!.cancel();
  await assert.rejects(transport.fetch('/api/account/session', {}), failure);
  assert.equal(bridge.opened.length, 1);
});

await test('unread bodies expire and cancel the native exchange', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bridge, transport } = fixture(t);
  const response = await transport.fetch('/api/account/session', {});
  t.mock.timers.tick(30000);
  await assert.rejects(response.text(), { name: 'TimeoutError' });
  await flush();
  assert.equal(bridge.cancelled.length, 1);
});

await test('unacknowledged cancellation is bounded and disables further native requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { bridge, transport } = fixture(t);
  bridge.cancelReply = deferred<void>().promise;
  const response = await transport.fetch('/api/account/session', {});
  const closing = response.body!.cancel();
  await flush();
  t.mock.timers.tick(1000);
  await closing;
  await assert.rejects(transport.fetch('/api/account/session', {}), failure);
  assert.equal(bridge.opened.length, 1);
});

await test('native header/read deadlines reject without waiting for an unresolved bridge promise', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const phase of ['headers', 'body']) {
    const { bridge, transport } = fixture(t);
    const reply = deferred<unknown>();
    if (phase === 'headers') bridge.openReply = reply.promise;
    else bridge.readReply = reply.promise;
    const pending = transport.fetch('/api/account/session', {});
    const result = phase === 'headers' ? pending : (await pending).text();
    await flush();
    t.mock.timers.tick(15000);
    await assert.rejects(result, { name: 'TimeoutError' });
    await flush();
    assert.equal(bridge.cancelled.length, 1);
  }
});

await test('optional native timing is strictly validated without accepting content or changing normal responses', async (t) => {
  const { bridge, transport } = fixture(t);
  bridge.head = {
    status: 200,
    headers: {},
    timing: { receiveUs: 7, encodeUs: 0 },
  };
  bridge.chunks = [
    { ...chunk('ok', true), timing: { receiveUs: 9, encodeUs: 3 } },
  ];
  assert.equal(
    await (await transport.fetch('/api/account/session', {})).text(),
    'ok',
  );
  for (const timing of [
    null,
    { receiveUs: -1, encodeUs: 0 },
    { receiveUs: 1, encodeUs: 0, cookie: 'private' },
    { receiveUs: 1.5, encodeUs: 0 },
    { receiveUs: 1, encodeUs: 600_000_001 },
  ]) {
    bridge.head = { status: 200, headers: {}, timing };
    await assert.rejects(transport.fetch('/api/account/session', {}), failure);
  }
  bridge.head = { status: 200, headers: {} };
  bridge.chunks = [
    {
      ...chunk('secret', true),
      timing: { receiveUs: 1, encodeUs: 0, payload: 'private' },
    },
  ];
  const response = await transport.fetch('/api/account/session', {});
  await assert.rejects(response.text(), failure);
});
