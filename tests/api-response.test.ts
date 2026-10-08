import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../src/client/api-response/index.ts';
import { messageApi } from '../src/client/message-api/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';

await test('HTML de 429/502/504 preserva status/operação e nunca mostra o corpo', async () => {
  for (const status of [429, 502, 504]) {
    const response = new Response('<html><h1>segredo-sintético</h1></html>', {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    await assert.rejects(
      readApiJson(response, 'messages/object'),
      (error: unknown) => {
        assert.ok(error instanceof ApiResponseError);
        assert.ok(error instanceof AccountError);
        assert.equal(error.status, status);
        assert.equal(error.operation, 'messages/object');
        assert.equal(error.failure, 'non-json');
        assert.equal(error.responseType, 'html');
        assert.match(error.message, new RegExp(`HTTP ${status}`, 'u'));
        assert.equal(error.message.includes('segredo-sintético'), false);
        assert.equal(error.message.includes('Unexpected token'), false);
        return true;
      },
    );
    assert.equal(response.body?.locked, false);
    assert.equal(response.bodyUsed, true);
  }
});
await test('JSON válido conserva dados e erros de autorização; vazio/adulterado tem diagnóstico próprio', async () => {
  assert.equal(
    await readApiJson(Response.json(null), 'contacts/snapshot'),
    null,
  );
  await assert.rejects(
    readApiJson(
      Response.json({ error: 'Aparelho revogado.' }, { status: 403 }),
      'account/devices/read',
    ),
    (error: unknown) => {
      assert.ok(error instanceof ApiResponseError);
      assert.equal(error.status, 403);
      assert.equal(error.failure, 'http');
      assert.match(error.message, /Aparelho revogado/u);
      return true;
    },
  );
  for (const [status, body] of [
    [200, '{"segredo-sintético":'],
    [503, ''],
  ] as const) {
    await assert.rejects(
      readApiJson(
        new Response(body, {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
        'vault/read',
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiResponseError);
        assert.equal(error.status, status);
        assert.equal(error.failure, 'invalid-json');
        assert.equal(error.message.includes('segredo-sintético'), false);
        return true;
      },
    );
  }
  await assert.rejects(
    readApiJson(new Response('', { status: 502 }), 'vault/read'),
    (error: unknown) => {
      assert.ok(error instanceof ApiResponseError);
      assert.equal(error.responseType, 'other');
      return true;
    },
  );
});
await test('falha de rede, prazo e cancelamento distinguem causas sem expor URL, cabeçalhos ou assinatura e sem repetir', async (t) => {
  const controller = new AbortController();
  controller.abort(new DOMException('segredo-sintético', 'TimeoutError'));
  const cancel = new AbortController();
  cancel.abort();
  const cases = [
    { signal: undefined, failure: 'network' },
    { signal: controller.signal, failure: 'timeout' },
    { signal: cancel.signal, failure: 'cancelled' },
  ];
  for (const value of cases) {
    let requests = 0;
    const options: RequestInit = {
      method: 'POST',
      body: 'assinatura-sintética',
      headers: { 'X-Hash-Talk-CSRF': 'csrf-sintético' },
      ...(value.signal ? { signal: value.signal } : {}),
    };
    t.mock.method(globalThis, 'fetch', (_path: string, init: RequestInit) => {
      requests++;
      assert.equal(init, options);
      throw new TypeError('https://fixture.invalid/?ticket=segredo-sintético');
    });
    await assert.rejects(
      fetchApi('messages/publish', '/api/account/messages/publish', options),
      (error: unknown) => {
        assert.ok(error instanceof ApiResponseError);
        assert.equal(error.status, 0);
        assert.equal(error.failure, value.failure);
        for (const secret of [
          'segredo-sintético',
          'assinatura-sintética',
          'csrf-sintético',
        ])
          assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    assert.equal(requests, 1);
    t.mock.restoreAll();
  }
});
await test('cliente de mensagens não perde HTTP 429 nem contorna sua guarda; rótulos recusam URLs/identificadores', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return Promise.resolve(
      new Response('<html>falha sintética</html>', {
        status: 429,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
  });
  const authority = {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'sintético',
    },
    directory: 'sintético',
    sign: () => Promise.resolve('sintético'),
  } as unknown as VaultAuthority;
  await assert.rejects(
    messageApi(authority, 'snapshot', {}, () => {}),
    (error: unknown) => {
      assert.ok(error instanceof ApiResponseError);
      assert.equal(error.status, 429);
      assert.equal(error.operation, 'messages/snapshot');
      return true;
    },
  );
  await assert.rejects(
    messageApi(authority, 'publish', {}, () => {
      throw new Error('Sessão alterada.');
    }),
    /Sessão alterada/u,
  );
  assert.equal(requests, 1);
  const error = new ApiResponseError({
    operation: '/api/secret?ticket=segredo',
    status: 502,
    failure: 'non-json',
  });
  assert.equal(error.operation, 'api');
  assert.equal(error.message.includes('ticket'), false);
});
