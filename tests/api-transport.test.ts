import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  requestApi,
  installNativeApiTransport,
} from '../src/client/api-transport/index.ts';
import { NativeApiTransport } from '../src/client/native-api/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../src/client/api-response/index.ts';
import { chunk, FixtureBridge } from './fixtures/native-api-bridge.ts';

interface InstalledClient {
  requestApi: typeof requestApi;
  installNativeApiTransport: typeof installNativeApiTransport;
  fetchApi: typeof fetchApi;
  readApiJson: typeof readApiJson;
}
async function installedClient() {
  const result = await build({
    stdin: {
      contents:
        "export * from './src/client/api-transport/index.ts'; export * from './src/client/api-response/index.ts';",
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'InstalledClient',
    define: { INSTALLED_APP: 'true' },
  });
  const output = result.outputFiles[0];
  assert.ok(output);
  let browserRequests = 0;
  const client = new Script(output.text + '\nInstalledClient;').runInNewContext(
    {
      Headers,
      Response,
      WeakMap,
      DOMException,
      Error,
      TypeError,
      fetch: () => {
        browserRequests++;
        throw new Error('Browser HTTP must not run.');
      },
    },
  ) as InstalledClient;
  return { client, browserRequests: () => browserRequests };
}

await test('web API transport preserves the original fetch contract and never installs a native session', async (t) => {
  const expected = new Response('{}');
  const input = {
    credentials: 'omit' as const,
    signal: new AbortController().signal,
  };
  let called = 0;
  t.mock.method(globalThis, 'fetch', (path: string, actual: RequestInit) => {
    called++;
    assert.equal(path, '/api/communities');
    assert.equal(actual, input);
    return Promise.resolve(expected);
  });
  assert.equal(await requestApi('/api/communities', input), expected);
  assert.equal(called, 1);
  const native = new NativeApiTransport(new FixtureBridge());
  assert.throws(() => installNativeApiTransport(native), /unavailable/u);
  await native.close();
});

await test('installed account calls fail closed until native initialization, without browser fallback', async () => {
  const { client, browserRequests } = await installedClient();
  await assert.rejects(
    client.requestApi('/api/account/session', {}),
    /unavailable/u,
  );
  await assert.rejects(
    client.fetchApi('account/session', '/api/account/session', {}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal('failure' in error && error.failure, 'network');
      return true;
    },
  );
  assert.equal(browserRequests(), 0);
});

await test('installed diagnostics retain HTTP/authorization and streamed-body errors from the native adapter', async () => {
  const { client, browserRequests } = await installedClient();
  const bridge = new FixtureBridge();
  const transport = new NativeApiTransport(bridge);
  client.installNativeApiTransport(transport);
  assert.throws(
    () => client.installNativeApiTransport(transport),
    /unavailable/u,
  );
  bridge.head = {
    status: 403,
    headers: { 'content-type': 'application/json' },
  };
  bridge.chunks = [chunk('{"error":"Device authorization changed."}', true)];
  const response = await client.fetchApi(
    'account/session',
    '/api/account/session',
    {},
  );
  await assert.rejects(
    client.readApiJson(response, 'account/session'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal('status' in error && error.status, 403);
      assert.equal('failure' in error && error.failure, 'http');
      assert.match(error.message, /Device authorization changed/u);
      return true;
    },
  );
  bridge.head = {
    status: 200,
    headers: { 'content-type': 'application/json' },
  };
  bridge.readReply = Promise.reject(
    new Error('synthetic-private-native-error'),
  );
  await assert.rejects(
    client.readApiJson(
      await client.fetchApi('account/session', '/api/account/session', {}),
      'account/session',
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal('failure' in error && error.failure, 'network');
      assert.equal(error.message.includes('synthetic-private'), false);
      return true;
    },
  );
  await transport.close();
  await assert.rejects(client.requestApi('/api/account/session', {}));
  assert.equal(browserRequests(), 0);
});

await test('existing API diagnostics remain the public error type on the web path', async (t) => {
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      new Response('{}', {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  await assert.rejects(
    readApiJson(
      await fetchApi('communities/read', '/api/communities', {}),
      'communities/read',
    ),
    (error: unknown) =>
      error instanceof ApiResponseError && error.status === 429,
  );
});
