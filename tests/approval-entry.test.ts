import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import { walletApprovalRequest } from '../src/shared/wallet-approval/index.ts';
import { createApprovalEntry } from '../src/server/account/approval-http.ts';
import { createWebServer } from '../src/server/web-host/index.ts';

function responseCookie(
  headers: import('node:http').IncomingHttpHeaders,
): string {
  const values = headers['set-cookie'];
  assert.ok(values && values.length === 1);
  const value = values[0];
  assert.ok(value);
  return value;
}
function maxAge(cookie: string): number {
  const match = /Max-Age=(\d+)/u.exec(cookie);
  assert.ok(match);
  return Number(match[1]);
}
function validated(value: unknown) {
  try {
    return walletApprovalRequest(value);
  } catch {
    throw new AccountError(400, 'Pedido inválido.');
  }
}

await test('entrada valida campos, limpa URL, limita cookie, preserva capacidade nova e bloqueia navegação de APIs entre sites', async (t) => {
  const origin = 'https://0xdmme.app';
  const expires = Date.now() + 120_000;
  const entry = createApprovalEntry(
    {
      approvalRequest(value: unknown) {
        const request = validated(value);
        if (request.ticket !== 'a'.repeat(64) || request.ecosystem !== 'solana')
          throw new AccountError(401, 'Pedido inválido.');
        return Promise.resolve({
          request,
          expiresAt: new Date(expires).toISOString(),
          serverTime: new Date().toISOString(),
        });
      },
    },
    origin,
  );
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: { healthy: () => Promise.resolve(true) },
    objects: { healthy: () => Promise.resolve(true) },
    account: {
      close: () => {},
      async handle(request, response) {
        if (request.url?.startsWith('/wallet-entry?'))
          return entry.enter(request, response);
        if (request.url === '/api/account/approval-request') {
          try {
            response.end(JSON.stringify(await entry.restore(request)));
          } catch {
            response.writeHead(401).end();
          }
          return;
        }
        response.end();
      },
    },
  });
  await new Promise<void>((resolve) =>
    host.server.listen(0, '127.0.0.1', resolve),
  );
  t.after(() => host.close());
  const address = host.server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  function get(
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
  ) {
    return new Promise<{
      status: number;
      headers: import('node:http').IncomingHttpHeaders;
      body: string;
    }>((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: { host: '0xdmme.app', ...headers },
        },
        (response) => {
          const parts: Buffer[] = [];
          response.on('data', (value: Buffer) => parts.push(value));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(parts).toString(),
            }),
          );
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end();
    });
  }
  const navigation = {
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
  };
  const query = `ticket=${'a'.repeat(64)}&wallet=Phantom&ecosystem=solana`;
  const first = await get(`/wallet-entry?${query}`, navigation);
  assert.equal(first.status, 303);
  assert.equal(first.body, '');
  assert.equal(first.headers.location, '/wallet.html#configuracoes');
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.headers['referrer-policy'], 'no-referrer');
  const rawCookie = responseCookie(first.headers);
  assert.match(rawCookie, /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/u);
  const maximum = maxAge(rawCookie);
  assert.ok(maximum > 0 && maximum <= 120);
  const again = await get(`/wallet-entry?${query}`, navigation);
  assert.ok(maxAge(responseCookie(again.headers)) <= maximum);
  const cookie = rawCookie.split(';')[0] ?? '';
  const recovered = await get('/api/account/approval-request', { cookie });
  assert.equal(recovered.status, 200);
  assert.equal(
    (JSON.parse(recovered.body) as { request: { ticket: string } }).request
      .ticket,
    'a'.repeat(64),
  );
  assert.equal(
    (await get('/api/account/approval-request', navigation)).status,
    403,
  );
  assert.equal(
    (await get(`/wallet-entry?${query}`, navigation, 'POST')).status,
    403,
  );
  assert.equal(
    (
      await get(`/wallet-entry?${query}`, {
        ...navigation,
        host: 'attacker.example',
      })
    ).status,
    403,
  );
  for (const bad of [
    query + '&ticket=' + 'b'.repeat(64),
    query + '&redirect=https://evil.example',
    'ticket=bad&wallet=Phantom&ecosystem=solana',
    query.replace('solana', 'evm'),
    query.replace('Phantom', 'Other'),
    'x'.repeat(513),
  ]) {
    const rejected = await get(`/wallet-entry?${bad}`, {
      ...navigation,
      cookie,
    });
    assert.equal(
      rejected.headers.location,
      '/wallet.html#configuracoes?invalid=1',
    );
    assert.match(responseCookie(rejected.headers), /Max-Age=0/u);
    assert.equal(rejected.body, '');
  }
  for (const badCookie of [
    cookie + '; ' + cookie,
    '__Host-0xdmme-approval=bad',
    cookie + '.extra',
  ]) {
    const rejected = await get('/api/account/approval-request', {
      cookie: badCookie,
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['set-cookie'], undefined);
  }
  assert.equal((await get('/api/account/approval-request')).body, 'null');
  const later = await get('/api/account/approval-request', { cookie });
  assert.equal(later.headers['set-cookie'], undefined);
});
