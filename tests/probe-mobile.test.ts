import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request } from 'node:http';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import {
  allowedProbeOrigin,
  authorizeMobile,
  mobileOrigin,
  serveMobileCertificate,
} from '../src/server/probe-mobile/index.ts';

await test('listener mobile rejeita interface pública, curinga e token fraco', () => {
  const mobile = {
    address: '192.168.1.20',
    cert: Buffer.alloc(0),
    key: Buffer.alloc(0),
    accessToken: 'a'.repeat(43),
  };
  assert.equal(mobileOrigin(45102, mobile), 'https://192.168.1.20:45102');
  for (const address of ['0.0.0.0', '8.8.8.8', '172.32.0.1', '::1']) {
    assert.throws(() => mobileOrigin(45102, { ...mobile, address }), /privada/);
    assert.throws(
      () => serveMobileCertificate(address, Buffer.alloc(0)),
      /privada/,
    );
  }
  assert.throws(() => mobileOrigin(45102, { ...mobile, accessToken: 'curto' }));
  assert.throws(() => mobileOrigin(80, mobile));
});

function exchange(port: number, path: string, headers: OutgoingHttpHeaders) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders }>(
    (resolve, reject) => {
      const outgoing = request(
        { host: '127.0.0.1', port, path, headers },
        (incoming) => {
          incoming.on('error', reject);
          incoming.resume();
          incoming.on('end', () =>
            resolve({
              status: incoming.statusCode ?? 0,
              headers: incoming.headers,
            }),
          );
        },
      );
      outgoing.setTimeout(2000, () =>
        outgoing.destroy(new Error('Timeout do teste.')),
      );
      outgoing.on('error', reject);
      outgoing.end();
    },
  );
}

await test('origem e acesso temporário protegem API e assets antes da admissão', async () => {
  const origin = 'https://192.168.1.20:45102';
  const token = 'a'.repeat(43);
  const headers = { host: new URL(origin).host };
  const server = createServer((incoming, response) => {
    if (!allowedProbeOrigin(incoming, origin)) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (!authorizeMobile(incoming, response, token)) {
      if (!response.headersSent) {
        response.writeHead(403);
        response.end();
      }
      return;
    }
    response.writeHead(200);
    response.end('admitido');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    assert.equal((await exchange(port, '/api/config', headers)).status, 403);
    assert.equal(
      (await exchange(port, '/vendor/index.mjs', headers)).status,
      403,
    );
    assert.equal(
      (await exchange(port, '/?access=errado', headers)).status,
      403,
    );
    const entry = await exchange(port, `/?access=${token}`, headers);
    assert.equal(entry.status, 303);
    assert.equal(entry.headers.location, '/');
    const vaultEntry = await exchange(
      port,
      `/vault.html?access=${token}`,
      headers,
    );
    assert.equal(vaultEntry.status, 303);
    assert.equal(vaultEntry.headers.location, '/vault.html');
    assert.equal(
      (await exchange(port, `//evil.invalid/?access=${token}`, headers)).status,
      403,
    );
    assert.match(
      entry.headers['set-cookie']?.[0] ?? '',
      /Secure; HttpOnly; SameSite=Strict/,
    );
    const authenticated = {
      ...headers,
      cookie: `__Host-hash-talk-probe=${token}`,
    };
    assert.equal(
      (await exchange(port, '/api/config', authenticated)).status,
      200,
    );
    assert.equal(
      (await exchange(port, '/api/config', { ...authenticated, origin }))
        .status,
      200,
    );
    assert.equal(
      (
        await exchange(port, '/api/config', {
          ...authenticated,
          host: 'evil.invalid',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await exchange(port, '/api/config', {
          ...authenticated,
          origin: 'https://evil.invalid',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await exchange(port, '/api/config', {
          ...authenticated,
          'sec-fetch-site': 'cross-site',
        })
      ).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
