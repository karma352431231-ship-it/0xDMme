import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { protectNativePhysicalFixture } from './fixtures/native-physical-admission.ts';

const token = 'a'.repeat(64);
const header = 'x-0xdmme-synthetic-admission';

function exchange(port: number, admission?: string) {
  const body = Buffer.from(
    '{"message":"Synthetic Unicode — 测试","signature":"unchanged"}',
  );
  return new Promise<{
    status: number;
    body: string;
    cookie: string[] | undefined;
  }>((resolve, reject) => {
    const call = request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/account/messages/page',
        signal: AbortSignal.timeout(3_000),
        headers: {
          origin: 'https://0xdmme.app',
          'content-type': 'application/json',
          'content-length': body.length,
          ...(admission === undefined ? {} : { [header]: admission }),
        },
      },
      (response) => {
        const parts: Buffer[] = [];
        response.on('data', (data: Buffer) => parts.push(data));
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(parts).toString(),
            cookie: response.headers['set-cookie'],
          }),
        );
      },
    );
    call.on('error', reject);
    call.end(body);
  });
}

await test('physical fixture rejects before account handling and preserves real accepted transport bytes/status', async (t) => {
  let reached = 0;
  const server = createServer((incoming, response) => {
    reached++;
    assert.equal(incoming.headers['origin'], 'https://0xdmme.app');
    assert.equal(incoming.headers[header], undefined);
    assert.ok(
      !incoming.rawHeaders.some((value) => value.toLowerCase() === header),
    );
    const parts: Buffer[] = [];
    incoming.on('data', (data: Buffer) => parts.push(data));
    incoming.on('end', () => {
      assert.equal(
        Buffer.concat(parts).toString(),
        '{"message":"Synthetic Unicode — 测试","signature":"unchanged"}',
      );
      response.writeHead(401, {
        'content-type': 'application/json',
        'set-cookie': ['synthetic=private; HttpOnly; Secure; SameSite=Strict'],
      });
      response.end('{"error":"unauthenticated"}');
    });
  });
  protectNativePhysicalFixture(server, token);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  assert.equal((await exchange(port)).status, 403);
  assert.equal((await exchange(port, 'b'.repeat(64))).status, 403);
  assert.equal(reached, 0);
  const result = await exchange(port, token);
  assert.equal(reached, 1);
  assert.equal(result.status, 401);
  assert.equal(result.body, '{"error":"unauthenticated"}');
  assert.deepEqual(result.cookie, [
    'synthetic=private; HttpOnly; Secure; SameSite=Strict',
  ]);
});

await test('physical admission validates setup before replacing the sole HTTP(S) handler', () => {
  const listener = (_request: unknown, response: { end: () => void }) =>
    response.end();
  const server = createServer(listener);
  for (const invalid of ['', token + '\n', 'z'.repeat(64)]) {
    assert.throws(() => protectNativePhysicalFixture(server, invalid));
    assert.deepEqual(server.listeners('request'), [listener]);
  }
  server.on('request', () => undefined);
  assert.throws(() => protectNativePhysicalFixture(server, token));
  assert.equal(server.listenerCount('request'), 2);
  const secure = createSecureServer(listener);
  protectNativePhysicalFixture(secure, token);
  assert.equal(secure.listenerCount('request'), 1);
});
