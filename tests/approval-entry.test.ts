import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  walletApprovalRequest,
  approvalEntryUrl,
  approvalDocumentUrl,
} from '../src/shared/wallet-approval/index.ts';
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
  let expires = Date.now() + 120_000;
  const consumed = new Set<string>();
  const entry = createApprovalEntry(
    {
      approvalRequest(value: unknown) {
        const request = validated(value);
        const expected =
          request.ticket === 'a'.repeat(64)
            ? 'solana'
            : request.ticket === 'b'.repeat(64)
              ? 'evm'
              : undefined;
        if (
          !expected ||
          request.ecosystem !== expected ||
          consumed.has(request.ticket)
        )
          throw new AccountError(401, 'Pedido inválido.');
        return Promise.resolve({
          request,
          expiresAt: new Date(expires).toISOString(),
          serverTime: new Date().toISOString(),
        });
      },
    },
    origin,
    new TextEncoder().encode(
      '<!doctype html><html><head><title>Aprovar</title></head><body>Documento próprio</body></html>',
    ),
  );
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: { healthy: () => Promise.resolve(true) },
    objects: { healthy: () => Promise.resolve(true) },
    account: {
      close: () => {},
      async handle(request, response) {
        if (approvalDocumentUrl(request.url))
          return entry.document(request, response);
        if (approvalEntryUrl(request.url))
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
  await checkSolanaWallets();
  async function checkSolanaWallets() {
    for (const wallet of ['MetaMask', 'Backpack']) {
      const validSolana = await get(
        `/wallet-entry?${query.replace('Phantom', wallet)}`,
        navigation,
      );
      assert.equal(validSolana.status, 303);
      assert.equal(
        validSolana.headers.location,
        wallet === 'Backpack'
          ? '/wallet-approval'
          : '/wallet.html#configuracoes',
      );
      if (wallet === 'Backpack') {
        const delivered = await get('/wallet-approval', {
          ...navigation,
          cookie: responseCookie(validSolana.headers).split(';')[0] ?? '',
        });
        assert.equal(delivered.status, 200);
        assert.ok(delivered.body.includes('a'.repeat(64)));
        assert.equal(delivered.headers['set-cookie'], undefined);
      }
      assert.match(
        responseCookie(validSolana.headers),
        new RegExp(`\\.${wallet}\\.solana;`, 'u'),
      );
    }
  }
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
    query.replace('Phantom', 'Solflare'),
    'x'.repeat(513),
  ]) {
    const rejected = await get(`/wallet-entry?${bad}`, {
      ...navigation,
      cookie,
    });
    assert.equal(
      rejected.headers.location,
      `/wallet.html#configuracoes?invalid=1&reason=${bad === query.replace('solana', 'evm') ? 'unavailable' : 'parameters'}`,
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
  const chrome = await get(
    `/wallet-entry?${query}&returnBrowser=chrome`,
    navigation,
  );
  assert.equal(chrome.headers.location, '/wallet.html#configuracoes');
  const chromeCookie = responseCookie(chrome.headers).split(';')[0] ?? '';
  assert.match(chromeCookie, /\.chrome$/u);
  const chromeRecovered = await get('/api/account/approval-request', {
    cookie: chromeCookie,
  });
  assert.equal(
    (JSON.parse(chromeRecovered.body) as { request: { returnBrowser: string } })
      .request.returnBrowser,
    'chrome',
  );
  for (const suffix of [
    '&returnBrowser=javascript',
    '&returnBrowser=chrome&returnBrowser=default',
    '&returnBrowser=https://evil.example',
  ]) {
    const invalid = await get(`/wallet-entry?${query}${suffix}`, navigation);
    assert.equal(
      invalid.headers.location,
      '/wallet.html#configuracoes?invalid=1&reason=parameters',
    );
  }
  await checkDirectDocument();
  await checkPathDocument();
  async function checkPathDocument() {
    expires = Date.now() + 120_000;
    for (const [network, ticket] of [
      ['solana', 'a'.repeat(64)],
      ['evm', 'b'.repeat(64)],
    ] as const) {
      const path = `/wallet-entry/${ticket}/${network}/Backpack`;
      const entered = await get(path, navigation);
      assert.equal(entered.status, 303);
      assert.equal(entered.headers.location, '/wallet-approval');
      assert.equal(entered.body, '');
      const raw = responseCookie(entered.headers);
      assert.ok(maxAge(raw) > 0 && maxAge(raw) <= 120);
      assert.match(raw, /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/u);
      const cookie = raw.split(';')[0] ?? '';
      const direct = await get('/wallet-approval', { ...navigation, cookie });
      assert.equal(direct.status, 200);
      assert.equal(direct.headers.location, undefined);
      assert.equal(direct.headers['set-cookie'], undefined);
      assert.equal(direct.headers['cache-control'], 'no-store');
      assert.equal(direct.headers['referrer-policy'], 'no-referrer');
      assert.match(
        direct.body,
        /type="application\/json" id="xdmme-wallet-approval-request"/u,
      );
      assert.ok(direct.body.includes(ticket));
      assert.doesNotMatch(
        direct.body,
        /data-rejected|sessionToken|browserToken|signature/u,
      );
      assert.equal(
        (
          await get('/wallet-approval', { ...navigation, cookie })
        ).body.includes(ticket),
        true,
      );
      assert.equal((await get(path, navigation, 'POST')).status, 403);
      assert.equal(
        (await get('/wallet-approval', navigation, 'POST')).status,
        403,
      );
      assert.equal(
        (
          await get('/wallet-approval', {
            'Sec-Fetch-Site': 'cross-site',
            cookie,
          })
        ).status,
        403,
      );
      for (const ref of [origin, `${origin}/`]) {
        for (const query of [`ref=${encodeURIComponent(ref)}`, `ref=${ref}`]) {
          const forwarded = await get(`${path}?${query}`, navigation);
          assert.equal(forwarded.status, 303);
          assert.equal(forwarded.headers.location, '/wallet-approval');
          const refCookie =
            responseCookie(forwarded.headers).split(';')[0] ?? '';
          const restored = await get('/wallet-approval', {
            ...navigation,
            cookie: refCookie,
          });
          assert.ok(restored.body.includes(ticket));
          assert.doesNotMatch(
            restored.body,
            /data-rejected|"ref"|sessionToken|browserToken|signature/u,
          );
        }
      }
      consumed.add(ticket);
      const used = await get('/wallet-approval', { ...navigation, cookie });
      assert.match(used.body, /data-rejected="unavailable">null<\/script>/u);
      assert.equal(used.headers['set-cookie'], undefined);
      assert.ok(!used.body.includes(ticket));
      const replay = await get(path, navigation);
      assert.equal(replay.status, 303);
      assert.equal(
        replay.headers.location,
        '/wallet-approval?invalid=1&reason=unavailable',
      );
      consumed.clear();
    }
    for (const path of [
      `/wallet-entry/PRIVATE/evm/Backpack`,
      `/wallet-entry/${'a'.repeat(64)}/other/Backpack`,
      `/wallet-entry/${'a'.repeat(64)}/solana/Phantom`,
      `/wallet-entry/${'a'.repeat(64)}/solana/Backpack?view=page`,
      `/wallet-entry/${'a'.repeat(64)}/solana/Backpack/extra`,
      ...[
        'ref=',
        'ref=https%3A%2F%2Fevil.example',
        'ref=http%3A%2F%2F0xdmme.app',
        'ref=https%3A%2F%2F0xdmme.app.evil.example',
        'ref=https%3A%2F%2Fuser%400xdmme.app',
        'ref=https%3A%2F%2F0xdmme.app%2Fwallet.html',
        'ref=https%3A%2F%2F0xdmme.app&ref=https%3A%2F%2F0xdmme.app',
        'ref=https%3A%2F%2F0xdmme.app&ecosystem=evm',
        'ref=https%3A%2F%2F0xdmme.app&ticket=PRIVATE',
        'ref=https%3A%2F%2F0xdmme.app&view=page',
        'ref=https%3A%2F%2F0xdmme.app&other=PRIVATE',
      ].map(
        (query) => `/wallet-entry/${'a'.repeat(64)}/solana/Backpack?${query}`,
      ),
    ]) {
      const invalid = await get(path, navigation);
      assert.equal(invalid.status, 303);
      assert.equal(
        invalid.headers.location,
        '/wallet-approval?invalid=1&reason=parameters',
      );
      assert.equal(maxAge(responseCookie(invalid.headers)), 0);
      const final = await get(invalid.headers.location, {
        ...navigation,
        cookie,
      });
      assert.match(final.body, /data-rejected="parameters">null<\/script>/u);
      assert.doesNotMatch(final.body, /PRIVATE|a{64}/u);
    }
    const missing = await get('/wallet-approval', navigation);
    assert.match(missing.body, /data-rejected="missing">null<\/script>/u);
    for (const cookie of [
      '__Host-0xdmme-approval=bad',
      '__Host-0xdmme-approval=' + 'a'.repeat(64) + '.Phantom.solana',
    ]) {
      const invalid = await get('/wallet-approval', { ...navigation, cookie });
      assert.match(invalid.body, /data-rejected="parameters">null<\/script>/u);
    }
    const extra = await get('/wallet-approval?ticket=PRIVATE', {
      ...navigation,
      cookie,
    });
    assert.match(extra.body, /data-rejected="parameters">null<\/script>/u);
    assert.doesNotMatch(extra.body, /PRIVATE|a{64}/u);
    expires = Date.now() - 1;
    const expired = await get('/wallet-approval', {
      ...navigation,
      cookie: '__Host-0xdmme-approval=' + 'a'.repeat(64) + '.Backpack.solana',
    });
    assert.match(expired.body, /data-rejected="unavailable">null<\/script>/u);
  }
  async function checkDirectDocument() {
    for (const [network, ticket] of [
      ['solana', 'a'.repeat(64)],
      ['evm', 'b'.repeat(64)],
    ]) {
      const direct = await get(
        `/wallet-entry?ticket=${ticket}&wallet=Backpack&ecosystem=${network}&view=page`,
        navigation,
      );
      assert.equal(direct.status, 200);
      assert.equal(direct.headers.location, undefined);
      assert.equal(direct.headers['set-cookie'], undefined);
      assert.equal(direct.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(direct.headers['cache-control'], 'no-store');
      assert.equal(direct.headers['referrer-policy'], 'no-referrer');
      assert.match(
        direct.body,
        /type="application\/json" id="xdmme-wallet-approval-request"/u,
      );
      const payload =
        /id="xdmme-wallet-approval-request">([^<]+)<\/script>/u.exec(
          direct.body,
        )?.[1];
      assert.ok(payload);
      const state = JSON.parse(payload) as {
        request: { wallet: string; ticket: string; ecosystem: string };
      };
      assert.equal(state.request.wallet, 'Backpack');
      assert.equal(state.request.ticket, ticket);
      assert.equal(state.request.ecosystem, network);
      assert.doesNotMatch(direct.body, /sessionToken|signature|browserToken/u);
    }
    for (const suffix of ['&view=page', '&view=evil', '&view=page&view=page']) {
      const direct = await get(`/wallet-entry?${query}${suffix}`, navigation);
      assert.equal(direct.status, 303);
      assert.equal(direct.body, '');
      assert.match(direct.headers.location ?? '', /reason=parameters/u);
    }
    const directPath = `/wallet-entry?${query.replace('Phantom', 'Backpack')}&view=page`;
    assert.equal((await get(directPath, navigation, 'POST')).status, 403);
    consumed.add('a'.repeat(64));
    const replay = await get(directPath, navigation);
    assert.equal(replay.status, 303);
    assert.equal(replay.body, '');
    assert.match(replay.headers.location ?? '', /reason=unavailable/u);
    consumed.clear();
    expires = Date.now() - 1;
    const expired = await get(directPath, navigation);
    assert.equal(expired.status, 303);
    assert.equal(expired.body, '');
    assert.match(expired.headers.location ?? '', /reason=unavailable/u);
  }
});
