import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { cacheableRequest } from '../src/shared/pwa-policy/index.ts';
import { readWebConfiguration } from '../src/server/web-configuration/index.ts';
import {
  createWebServer,
  loadWebAssets,
} from '../src/server/web-host/index.ts';

const databaseUrl = 'postgresql://hash_talk_dev@127.0.0.1:45432/hash_talk_dev';

await test('main source package above 2 MiB loads completely', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), '0xdmme-source-size-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = '/source-0123456789abcdef.tar.gz';
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);
  const manifest = [
    { path: '/index.html', type: 'text/html' },
    { path: '/sw.js', type: 'text/javascript' },
    { path: source, type: 'application/gzip' },
  ];
  await writeFile(resolve(directory, 'assets.json'), JSON.stringify(manifest));
  await writeFile(resolve(directory, 'index.html'), '0xDMme');
  await writeFile(resolve(directory, 'sw.js'), '');
  await writeFile(resolve(directory, source.slice(1)), bytes);
  const root = pathToFileURL(directory + '/');
  const assets = await loadWebAssets(root);
  assert.deepEqual(assets.get(source)?.content, bytes);
  manifest[2] = { path: '/app-0123456789abcdef.js', type: 'text/javascript' };
  await writeFile(resolve(directory, 'assets.json'), JSON.stringify(manifest));
  await writeFile(resolve(directory, 'app-0123456789abcdef.js'), bytes);
  await assert.rejects(loadWebAssets(root), /Asset exceeds the limit/u);
});

await test('public sources include build instructions and licenses and exclude backend and private data', async () => {
  const assets = await loadWebAssets();
  const sourcePath = [...assets.keys()].find((path) =>
    path.endsWith('.tar.gz'),
  );
  assert.ok(sourcePath);
  assert.match(
    Buffer.from(assets.get('/')?.content ?? []).toString(),
    /Source code and licenses/u,
  );
  const { stdout } = await promisify(execFile)(
    'tar',
    ['-tzf', resolve('dist/web', sourcePath.slice(1))],
    { timeout: 10_000, maxBuffer: 200_000 },
  );
  const paths = stdout.trim().split('\n');
  for (const required of [
    'src/client/communities/controller.ts',
    'src/shared/communities/index.ts',
    'src/shared/community-posts/index.ts',
    'src/shared/community-discovery/index.ts',
    'src/client/public-profile/controller.ts',
    'src/shared/public-profile/index.ts',
    'src/shared/public-avatar/index.ts',
    'src/shared/image-inspection/index.ts',
    'src/client/representatives/controller.ts',
    'src/client/wallet-statements/index.ts',
    'src/client/account/login-notice.ts',
    'src/client/phantom-native/statement.ts',
    'src/shared/representatives/statements.ts',
    'src/shared/wallet-recovery/statement.ts',
    'src/shared/representatives/index.ts',
    'src/client/daily/index.ts',
    'src/client/emoji/index.ts',
    'src/client/emoji/catalog.ts',
    'src/client/emoji/artwork.ts',
    'src/client/language/index.ts',
    'src/client/language-record/index.ts',
    'src/shared/i18n/catalog.ts',
    'src/tools/frontend-emoji.ts',
    'src/tools/frontend-emoji-locales.ts',
    'src/tools/frontend-localization.ts',
    'vendor/emoji/annotations-en.json',
    'vendor/emoji/annotations-zh.json',
    'vendor/emoji/annotationsDerived-en.json',
    'vendor/emoji/annotationsDerived-zh.json',
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
    'docs/FRONTEND_SOURCES.md',
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
    /Emoji artwork and licenses/u,
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

await test('configuration isolates local database and objects and rejects public profiles', () => {
  assert.deepEqual(
    readWebConfiguration({
      HASH_TALK_DATABASE_URL: databaseUrl,
      HASH_TALK_ACCOUNT_CAPACITY_BYTES: '900000000',
    }).contentCapacity,
    { mode: 'fixed', bytes: 900000000 },
  );
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

await test('staging requires canonical HTTPS origin, dedicated cluster and role and confined objects', () => {
  const environment = {
    HASH_TALK_PROFILE: 'staging',
    HASH_TALK_PUBLIC_ORIGIN: 'https://0xdmme.app',
    HASH_TALK_DATABASE_URL:
      'postgresql://hash_talk_stage:synthetic@127.0.0.1:45433/hash_talk_stage',
  };
  const config = readWebConfiguration(environment);
  assert.equal(config.profile, 'staging');
  assert.deepEqual(config.contentCapacity, {
    mode: 'volume',
    directory: '/opt/0xdmme/release',
  });
  for (const retired of ['900000000', '0', 'invalid'])
    assert.deepEqual(
      readWebConfiguration({
        ...environment,
        HASH_TALK_ACCOUNT_CAPACITY_BYTES: retired,
      }).contentCapacity,
      config.contentCapacity,
    );
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

await test('offline policy restricts cache to pinned public build assets', () => {
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
    '/?atualizar=1',
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

await test('server rejects origin violations, mutations, traversal and private data; health fails without persistence', async (t) => {
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
  const fresh = await get('/?atualizar=1', navigationHeaders);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body, (await get('/')).body);
  assert.equal(fresh.headers['cache-control'], 'no-store');
  assert.match(
    String(fresh.headers['content-security-policy']),
    /'wasm-unsafe-eval'/u,
  );
  assert.equal(
    fresh.headers['permissions-policy'],
    'camera=(self), microphone=(self), geolocation=(), payment=()',
  );
  assert.equal(
    (await get('/?atualizar=1', navigationHeaders, 'POST')).status,
    403,
  );
  assert.equal((await get('/?atualizar=1', {}, 'POST')).status, 405);
  assert.equal(
    (await get('/?atualizar=1', { 'sec-fetch-site': 'cross-site' })).status,
    403,
  );
  for (const path of [
    '/?atualizar=2',
    '/?atualizar=1&extra=1',
    '/?atualizar=1&atualizar=1',
  ])
    assert.equal((await get(path)).status, 404);
  for (const path of [
    '/split/feed',
    '/communities/id/AAAAAAAAQACAAAAAAAAAAQ/posts/AAAAAAAAQACAAAAAAAAAAg',
    '/split/communities/id/AAAAAAAAQACAAAAAAAAAAQ/posts/AAAAAAAAQACAAAAAAAAAAg',
    '/split/profile/karma',
    '/users/handle/karma',
    '/communities/new-community',
    '/communities/new-community/posts/' + crypto.randomUUID(),
    '/settings/privacy',
  ]) {
    const direct = await get(path);
    assert.equal(direct.status, 200, path);
    assert.match(
      String(direct.headers['content-security-policy']),
      /'wasm-unsafe-eval'/u,
    );
    assert.equal(direct.headers['cache-control'], 'no-store');
  }
  for (const path of [
    '/api/unknown',
    '/split/unknown',
    '/users/handle/karma/extra',
  ])
    assert.equal((await get(path)).status, 404, path);
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
  assert.match(approval.body, /Confirm signature/u);
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
  assert.match(nativeProbe.body, /not create an account/u);
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
  // Only the app shell may reach KLIPY and the opt-in YouTube player.
  const shellPolicy = String(page.headers['content-security-policy']);
  assert.doesNotMatch(shellPolicy, /'unsafe-eval'|'unsafe-inline'/u);
  assert.deepEqual(
    [...new Set(shellPolicy.match(/https:\/\/[^\s;]+/gu))].sort(),
    [
      'https://api.klipy.com',
      'https://static.klipy.com',
      'https://www.youtube-nocookie.com',
    ],
  );
  assert.match(shellPolicy, /script-src 'self' 'wasm-unsafe-eval';/u);
  assert.match(shellPolicy, /media-src blob: https:\/\/static\.klipy\.com;/u);
  assert.match(shellPolicy, /connect-src 'self' https:\/\/api\.klipy\.com;/u);
  assert.match(shellPolicy, /frame-src https:\/\/www\.youtube-nocookie\.com;/u);
  assert.doesNotMatch(
    String((await get('/wallet.html')).headers['content-security-policy']),
    /https:/u,
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
  const notificationPolicy = String(
    (await get('/sw.js')).headers['content-security-policy'],
  );
  assert.match(notificationPolicy, /script-src 'self' 'wasm-unsafe-eval';/u);
  assert.match(notificationPolicy, /img-src 'self' blob: data:;/u);
  assert.doesNotMatch(
    notificationPolicy,
    /(?:api|static)\.klipy|youtube|unsafe-inline|script-src[^;]*'unsafe-eval'/u,
  );
  assert.doesNotMatch(shellPolicy, /img-src[^;]*data:/u);
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

await test('web accepts more than 32 simultaneous sockets without a fixed visitor ceiling', async (t) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let admitted = 0;
  let ready = () => {};
  const allAdmitted = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const host = createWebServer({
    origin: 'http://127.0.0.1:45100',
    assets: new Map(),
    database: { healthy: () => Promise.resolve(true) },
    objects: { healthy: () => Promise.resolve(true) },
    publicProfiles: {
      handle: async (_request, response) => {
        if (++admitted === 40) ready();
        await gate;
        response.end('synthetic');
      },
      close: () => {},
    },
  });
  t.after(() => host.close());
  await new Promise<void>((resolve) =>
    host.server.listen(0, '127.0.0.1', resolve),
  );
  const address = host.server.address();
  assert.ok(address && typeof address !== 'string');
  const clients = Array.from(
    { length: 40 },
    () =>
      new Promise<number>((resolve) => {
        const client = request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: '/api/public-profiles/synthetic',
            agent: false,
            headers: { Host: '127.0.0.1:45100' },
          },
          (response) => {
            response.resume();
            response.once('end', () => resolve(response.statusCode ?? 0));
          },
        );
        client.once('error', () => resolve(0));
        client.end();
      }),
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      allAdmitted,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Not all sockets were admitted.')),
          5000,
        );
      }),
    ]);
    assert.equal(admitted, 40);
  } finally {
    clearTimeout(timeout);
    release();
    const statuses = await Promise.all(clients);
    assert.ok(statuses.every((status) => status === 200));
  }
});
