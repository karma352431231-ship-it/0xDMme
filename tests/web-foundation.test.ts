import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { cacheableRequest } from '../src/shared/pwa-policy/index.ts';
import { readWebConfiguration } from '../src/server/web-configuration/index.ts';
import {
  createWebServer,
  loadWebAssets,
} from '../src/server/web-host/index.ts';

const databaseUrl = 'postgresql://hash_talk_dev@127.0.0.1:45432/hash_talk_dev';

await test('fontes públicas incluem instruções/licenças do build e excluem backend/dados privados', async () => {
  const assets = await loadWebAssets();
  const sourcePath = [...assets.keys()].find((path) =>
    path.endsWith('.tar.gz'),
  );
  assert.ok(sourcePath);
  assert.match(
    Buffer.from(assets.get('/')?.content ?? []).toString(),
    /Código e licenças/u,
  );
  const { stdout } = await promisify(execFile)(
    'tar',
    ['-tzf', resolve('dist/web', sourcePath.slice(1))],
    { timeout: 10_000, maxBuffer: 200_000 },
  );
  const paths = stdout.trim().split('\n');
  for (const required of [
    'package-lock.json',
    'src/tools/build-web.ts',
    'src/tools/frontend-source.ts',
    'src/tools/frontend-vendor-source.ts',
    'src/client/account/index.ts',
    'src/client/app/wallet.html',
    'src/client/phantom-native/index.ts',
    'src/shared/wallet-approval/index.ts',
    'src/client/app/phantom-probe.html',
    'LICENSE-GPL-3.0.txt',
    'docs/FONTES_FRONTEND.md',
    'vendor/libsodium-0.8.4/README.md',
    'node_modules/@wallet-standard/app/LICENSE',
    'node_modules/libsodium-wrappers/LICENSE',
    'node_modules/libsodium/LICENSE',
  ])
    assert.ok(paths.includes(required), `Fonte necessária: ${required}`);
  for (const path of paths)
    assert.doesNotMatch(
      path,
      /(?:^|\/)(?:\.local|\.git|\.env[^/]*|\.\.|server)(?:\/|$)|^\//u,
    );
  const worker = Buffer.from(assets.get('/sw.js')?.content ?? []).toString();
  assert.ok(!worker.includes(sourcePath));
  const preferredPath = [...assets.keys()].find((path) =>
    path.endsWith('.tar.xz'),
  );
  assert.ok(preferredPath);
  assert.ok(
    (assets.get(preferredPath)?.content.length ?? Infinity) <= 2 * 1024 * 1024,
  );
  assert.ok(!worker.includes(preferredPath));
});

await test('configuração isola banco e objetos locais e recusa perfis públicos', () => {
  assert.equal(
    readWebConfiguration({ HASH_TALK_DATABASE_URL: databaseUrl }).port,
    45100,
  );
  for (const value of [
    undefined,
    'postgresql://127.0.0.1/another_project',
    'postgresql://remote.example/hash_talk_dev',
    `${databaseUrl}?options=x`,
  ]) {
    assert.throws(() =>
      readWebConfiguration(value ? { HASH_TALK_DATABASE_URL: value } : {}),
    );
  }
  for (const overrides of [
    { HASH_TALK_PROFILE: 'production' },
    { HASH_TALK_PORT: '65536' },
    { HASH_TALK_PORT: '45100x' },
    { HASH_TALK_OBJECT_DIRECTORY: '/tmp/objects' },
    { HASH_TALK_OBJECT_DIRECTORY: '.local/../public' },
  ])
    assert.throws(() =>
      readWebConfiguration({
        HASH_TALK_DATABASE_URL: databaseUrl,
        ...overrides,
      }),
    );
});

await test('staging exige origem canônica HTTPS, cluster/role exclusivos e objetos confinados', () => {
  const environment = {
    HASH_TALK_PROFILE: 'staging',
    HASH_TALK_PUBLIC_ORIGIN: 'https://0xdmme.app',
    HASH_TALK_DATABASE_URL:
      'postgresql://hash_talk_stage:synthetic@127.0.0.1:45433/hash_talk_stage',
  };
  const config = readWebConfiguration(environment);
  assert.equal(config.profile, 'staging');
  assert.equal(config.origin, 'https://0xdmme.app');
  assert.equal(config.port, 45113);
  assert.equal(config.socketPath, '/run/0xdmme-web/web.sock');
  assert.equal(config.objectDirectory, '/var/lib/0xdmme/data/objects/content');
  for (const overrides of [
    { HASH_TALK_PUBLIC_ORIGIN: undefined },
    { HASH_TALK_PUBLIC_ORIGIN: 'http://0xdmme.app' },
    { HASH_TALK_PUBLIC_ORIGIN: 'https://attacker.example' },
    { HASH_TALK_PUBLIC_ORIGIN: 'https://0xdmme.app/path' },
    { HASH_TALK_DATABASE_URL: databaseUrl },
    {
      HASH_TALK_DATABASE_URL: environment.HASH_TALK_DATABASE_URL.replace(
        ':45433',
        ':5432',
      ),
    },
    {
      HASH_TALK_DATABASE_URL: environment.HASH_TALK_DATABASE_URL.replace(
        ':synthetic',
        '',
      ),
    },
    { HASH_TALK_OBJECT_DIRECTORY: '/var/lib/another-project' },
    { HASH_TALK_OBJECT_DIRECTORY: '/var/lib/0xdmme/data/objects/../postgres' },
  ])
    assert.throws(() => readWebConfiguration({ ...environment, ...overrides }));
});

await test('política offline limita cache a assets públicos fixados do build', () => {
  const origin = 'https://hash-talk.example';
  const assets = [
    '/',
    '/app-abcd.js',
    '/wallet.html',
    '/wallet-approval',
    '/phantom-probe.html',
  ];
  assert.equal(
    cacheableRequest(new Request(`${origin}/`), origin, assets),
    true,
  );
  for (const path of [
    '/health/ready',
    '/api/messages',
    '/objects/private',
    '/?secret=x',
    '/app-old.js',
    '/wallet.html',
    '/wallet-approval',
    '/wallet-entry?ticket=synthetic',
    '/api/account/approval-request',
    '/phantom-probe.html',
    '/phantom-probe.html?state=synthetic',
  ])
    assert.equal(
      cacheableRequest(new Request(`${origin}${path}`), origin, assets),
      false,
    );
  assert.equal(
    cacheableRequest(
      new Request(`${origin}/`, { method: 'POST' }),
      origin,
      assets,
    ),
    false,
  );
  assert.equal(
    cacheableRequest(
      new Request(`${origin}/`, {
        headers: { authorization: 'Bearer synthetic' },
      }),
      origin,
      assets,
    ),
    false,
  );
  assert.equal(
    cacheableRequest(new Request('https://remote.example/'), origin, assets),
    false,
  );
});

await test('servidor recusa origem, mutação, traversal e dados privados; saúde falha sem persistência', async (t) => {
  let healthy = true;
  const assets = await loadWebAssets();
  const host = createWebServer({
    origin: 'http://127.0.0.1:45100',
    assets,
    database: { healthy: () => Promise.resolve(healthy) },
    objects: { healthy: () => Promise.resolve(true) },
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
      headers: Record<string, unknown>;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers: { host: '127.0.0.1:45100', ...headers },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
          response.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
  }
  const navigationHeaders = {
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
  };
  assert.equal((await get('/', navigationHeaders)).status, 200);
  const approval = await get('/wallet.html', navigationHeaders);
  assert.equal(approval.status, 200);
  assert.match(approval.body, /Confirmar assinatura/u);
  assert.equal(approval.headers['cache-control'], 'no-store');
  assert.doesNotMatch(
    String(approval.headers['content-security-policy']),
    /wasm-unsafe-eval/u,
  );
  const nativeProbe = await get(
    '/phantom-probe.html?state=synthetic&phase=connect',
    navigationHeaders,
  );
  assert.equal(nativeProbe.status, 200);
  assert.match(nativeProbe.body, /Não\s+cria uma conta/u);
  assert.equal(nativeProbe.headers['cache-control'], 'no-store');
  assert.equal(nativeProbe.headers['referrer-policy'], 'no-referrer');
  assert.match(
    String(nativeProbe.headers['content-security-policy']),
    /script-src 'self' 'wasm-unsafe-eval';/u,
  );
  assert.doesNotMatch(
    String(nativeProbe.headers['content-security-policy']),
    /'unsafe-eval'|'unsafe-inline'|https:/u,
  );
  for (const [path, headers, method, expectedStatus] of [
    ['/phantom-probe.html', {}, 'HEAD', 200],
    ['/phantom-probe.html', navigationHeaders, 'POST', 403],
    ['/phantom-probe.html', {}, 'POST', 405],
    ['/phantom-probe.html?state=' + 'a'.repeat(6144), {}, 'GET', 404],
    ['/api/account/session', navigationHeaders, 'GET', 403],
  ] as const) {
    const response = await get(path, headers, method);
    assert.equal(response.status, expectedStatus);
    assert.equal(
      String(response.headers['content-security-policy']).includes(
        "'wasm-unsafe-eval'",
      ),
      expectedStatus === 200,
    );
  }
  assert.equal(
    (
      await get(
        '/phantom-probe.html?state=synthetic',
        navigationHeaders,
        'POST',
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await get('/phantom-probe.html?state=synthetic', {
        'sec-fetch-site': 'cross-site',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await get(
        '/phantom-probe.html?state=' + 'a'.repeat(6144),
        navigationHeaders,
      )
    ).status,
    403,
  );
  assert.equal(
    (await get('/wallet.html', navigationHeaders, 'POST')).status,
    403,
  );
  assert.equal(
    (await get('/api/account/session', navigationHeaders)).status,
    403,
  );
  assert.equal(
    (await get('/', { 'sec-fetch-site': 'cross-site' })).status,
    403,
  );
  assert.equal((await get('/', navigationHeaders, 'POST')).status, 403);
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.body, /0xDMme/);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(
    String(page.headers['content-security-policy']),
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    String(page.headers['content-security-policy']),
    /wasm-unsafe-eval/u,
  );
  assert.equal((await get('/', { host: 'attacker.example' })).status, 403);
  assert.equal(
    (await get('/', { origin: 'https://attacker.example' })).status,
    403,
  );
  assert.equal(
    (await get('/', { 'sec-fetch-site': 'cross-site' })).status,
    403,
  );
  assert.equal((await get('/', {}, 'POST')).status, 405);
  for (const path of [
    '/../.env',
    '/%2e%2e/.env',
    '/.local/objects',
    '/api/config',
    '/?secret=x',
  ])
    assert.equal((await get(path)).status, 404);
  assert.equal((await get('/', {}, 'HEAD')).body, '');
  assert.equal((await get('/health/ready')).status, 200);
  healthy = false;
  assert.equal((await get('/health/ready')).status, 503);
  assert.equal((await get('/health/live')).status, 200);
  const manifest = JSON.parse((await get('/manifest.webmanifest')).body) as {
    icons: { src: string }[];
  };
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons)
    assert.equal((await get(icon.src)).status, 200);
  const worker = await get('/sw.js');
  assert.equal(worker.headers['service-worker-allowed'], '/');
  assert.doesNotMatch(worker.body, /\{\{ASSETS\}\}|\{\{VERSION\}\}/u);
});
