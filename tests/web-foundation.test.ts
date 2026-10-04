import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    'src/client/daily/index.ts',
    'src/client/emoji/index.ts',
    'src/client/emoji/catalog.ts',
    'src/client/emoji/artwork.ts',
    'src/tools/frontend-emoji.ts',
    'vendor/emoji/README.md',
    'vendor/emoji/LICENSE-GRAPHICS.txt',
    'vendor/emoji/LICENSE-UNICODE.txt',
    'src/client/daily-text/index.ts',
    'src/client/message-actions/index.ts',
    'src/client/message-search/index.ts',
    'src/client/message-status/index.ts',
    'src/client/notification-sound/index.ts',
    'src/client/message-live/index.ts',
    'src/client/voice-audio/index.ts',
    'src/client/voice-recording/worklet.ts',
    'src/client/voice-playback/index.ts',
    'src/shared/voice/index.ts',
    'src/shared/daily/index.ts',
    'package-lock.json',
    'src/tools/build-web.ts',
    'src/tools/frontend-source.ts',
    'src/tools/frontend-vendor-source.ts',
    'src/tools/frontend-matrix-source.ts',
    'src/client/messages/index-sync.ts',
    'src/client/message-controls/index.ts',
    'node_modules/@matrix-org/matrix-sdk-crypto-wasm/LICENSE',
    'node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.js',
    'vendor/matrix-crypto-18.9.0/README.md',
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
    'node_modules/qr/src/index.ts',
    'node_modules/qr/src/decode.ts',
    'node_modules/qr/LICENSE-MIT',
    'src/client/device-qr/index.ts',
    'src/client/wallet-recovery/index.ts',
    'src/client/recovery-return/page.ts',
    'src/shared/wallet-recovery/index.ts',
    'src/client/app/recovery.html',
    'node_modules/ethers/src.ts/crypto/signature.ts',
    'node_modules/ethers/LICENSE.md',
    'node_modules/ethers/node_modules/@noble/curves/src/secp256k1.ts',
  ])
    assert.ok(paths.includes(required), `Fonte necessária: ${required}`);
  for (const path of paths)
    assert.doesNotMatch(
      path,
      /(?:^|\/)(?:\.local|\.git|\.env[^/]*|\.\.|server)(?:\/|$)|^\//u,
    );
  const worker = Buffer.from(assets.get('/sw.js')?.content ?? []).toString();
  assert.ok(!worker.includes(sourcePath));
  verifyEmojiSources(assets, worker);
  const preferredPath = [...assets.keys()].find((path) =>
    path.endsWith('.tar.xz'),
  );
  assert.ok(preferredPath);
  assert.ok(
    (assets.get(preferredPath)?.content.length ?? Infinity) <= 2 * 1024 * 1024,
  );
  assert.ok(!worker.includes(preferredPath));
  verifyMatrixSources(assets, worker);
});
function verifyEmojiSources(
  assets: ReadonlyMap<string, { content: Uint8Array }>,
  worker: string,
): void {
  const emojiPath = '/emoji-d7a2c1166a29ac85.json.gz';
  const emoji = assets.get(emojiPath);
  assert.ok(emoji && emoji.content.length <= 2 * 1024 * 1024);
  assert.equal(
    createHash('sha256').update(emoji.content).digest('hex'),
    'd7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a',
  );
  assert.ok(worker.includes(emojiPath));
  assert.match(
    Buffer.from(assets.get('/')?.content ?? []).toString(),
    /Desenhos e licenças dos emojis/u,
  );
}
function verifyMatrixSources(
  assets: ReadonlyMap<string, { content: Uint8Array }>,
  worker: string,
): void {
  const matrixParts = [...assets.keys()]
    .filter((path) => /matrix-crypto-18\.9\.0-source-.*\.bin$/u.test(path))
    .sort();
  assert.equal(matrixParts.length, 18);
  for (const path of matrixParts) {
    assert.ok(
      (assets.get(path)?.content.length ?? Infinity) <= 2 * 1024 * 1024,
    );
    assert.ok(!worker.includes(path));
  }
  const sources = Buffer.concat(
    matrixParts.map((path) => Buffer.from(assets.get(path)?.content ?? [])),
  );
  assert.equal(
    createHash('sha256').update(sources).digest('hex'),
    '1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60',
  );
  assert.ok(assets.get('/matrix-crypto-18.9.0.wasm'));
}

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
  const loaded = assets.get('/');
  assert.ok(loaded);
  const publicHash = createHash('sha256').update(loaded.content).digest('hex');
  const conditional = await get('/', { 'if-none-match': `"${publicHash}"` });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body, '');
  assert.equal(conditional.headers.etag, `"${publicHash}"`);
  assert.equal(conditional.headers['cache-control'], 'no-store');
  const changed = await get('/', { 'if-none-match': `"${'0'.repeat(64)}"` });
  assert.equal(changed.status, 200);
  assert.equal(changed.headers.etag, `"${publicHash}"`);
  assert.equal(
    createHash('sha256').update(changed.body).digest('hex'),
    publicHash,
  );
  assert.equal(
    (
      await get('/', {
        'if-none-match': `"${publicHash}"`,
        'sec-fetch-site': 'cross-site',
      })
    ).status,
    403,
  );
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
  assert.equal(
    page.headers['permissions-policy'],
    'camera=(self), microphone=(self), geolocation=(), payment=()',
  );
  assert.equal(
    (await get('/wallet.html')).headers['permissions-policy'],
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  assert.match(
    String(page.headers['content-security-policy']),
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    String(page.headers['content-security-policy']),
    /'unsafe-eval'|'unsafe-inline'|https:/u,
  );
  assert.match(
    String(page.headers['content-security-policy']),
    /script-src 'self' 'wasm-unsafe-eval';/u,
  );
  assert.match(
    String(page.headers['content-security-policy']),
    /media-src blob:;/u,
  );
  const voiceWorklet = [...assets.keys()].find((path) =>
    path.startsWith('/voice-worklet-'),
  );
  assert.ok(voiceWorklet);
  assert.equal((await get(voiceWorklet)).status, 200);
  const attachmentWorker = [...assets.keys()].find((path) =>
    path.startsWith('/attachment-worker-'),
  );
  assert.ok(attachmentWorker);
  const attachmentResponse = await get(attachmentWorker);
  assert.equal(attachmentResponse.status, 200);
  assert.match(
    String(attachmentResponse.headers['content-security-policy']),
    /script-src 'self' 'wasm-unsafe-eval';/u,
  );
  assert.doesNotMatch(
    String(attachmentResponse.headers['content-security-policy']),
    /'unsafe-eval'|'unsafe-inline'|https:/u,
  );
  assert.equal(
    attachmentResponse.headers['permissions-policy'],
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  assert.doesNotMatch(
    String((await get('/sw.js')).headers['content-security-policy']),
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
