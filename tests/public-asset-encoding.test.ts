import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { request } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { compressedFrontendAssets } from '../src/tools/frontend-compression.ts';
import { publicAssetRepresentation } from '../src/server/public-asset-encoding/index.ts';
import {
  createWebServer,
  loadWebAssets,
} from '../src/server/web-host/index.ts';

const name = 'app-0123456789abcdef.js';
const bytes = Buffer.from(
  "console.log('Public application code');\n".repeat(5000),
);
const compressed = compressedFrontendAssets(new Map([[name, bytes]])).get(
  name,
)!;

for (const [accepted, encoded] of [
  [undefined, false],
  ['gzip, deflate, br, zstd', true],
  ['BR;q=0.5', true],
  ['br;q=0', false],
  ['*;q=0.8', true],
  ['br;q=0, *;q=1', false],
  ['br;q=invalid', false],
  ['br;q=1.1', false],
  ['br;q=0.000', false],
] as const)
  await test(`public Brotli negotiation: ${accepted ?? 'absent'}`, () => {
    const identity = {
      content: bytes,
      etag: 'identity',
      type: 'text/javascript',
    };
    const variant = {
      ...identity,
      br: { content: compressed, etag: 'encoded' },
    };
    const selected = publicAssetRepresentation(variant, accepted);
    assert.equal(selected.encoding === 'br', encoded);
    assert.equal(selected.etag, encoded ? 'encoded' : 'identity');
    assert.equal(
      publicAssetRepresentation(identity, accepted).encoding,
      undefined,
    );
  });

await test('build compresses only fixed public startup assets and preserves their decoded bytes', () => {
  const files = new Map([
    [name, bytes],
    ['matrix-crypto-18.9.0.wasm', bytes],
    ['private.json', bytes],
    ['api-account-profile.json', bytes],
    ['source-0123456789abcdef.tar.gz', bytes],
    ['sw.js', bytes],
  ]);
  const variants = compressedFrontendAssets(files);
  assert.deepEqual([...variants.keys()], [name, 'matrix-crypto-18.9.0.wasm']);
  for (const [path, body] of variants) {
    assert.deepEqual(brotliDecompressSync(body), files.get(path));
    assert.ok(body.byteLength < bytes.byteLength);
  }
});

async function encodingFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), '0xdmme-public-encoding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = [
    { path: '/index.html', type: 'text/html' },
    { path: '/sw.js', type: 'text/javascript' },
    { path: `/${name}`, type: 'text/javascript', br: `/${name}.br` },
    { path: `/${name}.br`, type: 'application/octet-stream' },
  ];
  await writeFile(join(directory, 'index.html'), '<!doctype html>');
  await writeFile(join(directory, 'sw.js'), '// public worker');
  await writeFile(join(directory, name), bytes);
  await writeFile(join(directory, `${name}.br`), compressed);
  const save = () =>
    writeFile(join(directory, 'assets.json'), JSON.stringify(manifest));
  await save();
  return { directory, manifest, save, root: pathToFileURL(directory + '/') };
}

await test('asset loading rejects missing, mismatched and oversized encoded representations and foreign paths', async (t) => {
  const f = await encodingFixture(t);
  const original = f.manifest[2]!.br!;
  f.manifest[2]!.br = '/other.br';
  await f.save();
  await assert.rejects(loadWebAssets(f.root), /encoding path/u);
  f.manifest[2]!.br = original;
  f.manifest.pop();
  await f.save();
  await assert.rejects(loadWebAssets(f.root), /encoding is missing/u);
  f.manifest.push({ path: `/${name}.br`, type: 'application/octet-stream' });
  await f.save();
  const different = Buffer.alloc(bytes.byteLength, 0x61);
  await writeFile(
    join(f.directory, `${name}.br`),
    compressedFrontendAssets(new Map([[name, different]])).get(name)!,
  );
  await assert.rejects(loadWebAssets(f.root), /differs from its source/u);
  await writeFile(join(f.directory, name), 'short original');
  await assert.rejects(loadWebAssets(f.root), { code: 'ERR_BUFFER_TOO_LARGE' });
});

await test('native HTTP serves exact public representations, variant ETags, HEAD and 304 without changing security headers', async (t) => {
  const f = await encodingFixture(t);
  const assets = await loadWebAssets(f.root);
  const host = createWebServer({
    origin: 'http://127.0.0.1:45100',
    assets,
    database: { healthy: () => Promise.resolve(true) },
    objects: { healthy: () => Promise.resolve(true) },
  });
  await new Promise<void>((resolve) =>
    host.server.listen(0, '127.0.0.1', resolve),
  );
  t.after(() => host.close());
  const address = host.server.address();
  assert.ok(address && typeof address !== 'string');
  const get = (headers: Record<string, string> = {}, method = 'GET') =>
    new Promise<{
      status: number;
      headers: import('node:http').IncomingHttpHeaders;
      body: Buffer;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: `/${name}`,
          method,
          headers: { host: '127.0.0.1:45100', ...headers },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
  const identity = await get({ 'accept-encoding': 'br;q=0, gzip' });
  assert.equal(identity.status, 200);
  assert.deepEqual(identity.body, bytes);
  assert.equal(identity.headers['content-encoding'], undefined);
  const encoded = await get({ 'accept-encoding': 'gzip, br' });
  assert.equal(encoded.headers['content-encoding'], 'br');
  assert.equal(encoded.headers.vary, 'Accept-Encoding');
  assert.equal(encoded.headers['cache-control'], 'no-store');
  assert.equal(
    encoded.headers['content-security-policy'],
    identity.headers['content-security-policy'],
  );
  assert.equal(encoded.headers['content-type'], 'text/javascript');
  assert.deepEqual(brotliDecompressSync(encoded.body), bytes);
  assert.notEqual(encoded.headers.etag, identity.headers.etag);
  const head = await get({ 'accept-encoding': 'br' }, 'HEAD');
  assert.equal(Number(head.headers['content-length']), encoded.body.byteLength);
  assert.equal(head.body.byteLength, 0);
  const unchanged = await get({
    'accept-encoding': 'br',
    'if-none-match': encoded.headers.etag!,
  });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.vary, 'Accept-Encoding');
  assert.equal(unchanged.body.byteLength, 0);
  assert.equal(
    (
      await get({
        'accept-encoding': 'br',
        'if-none-match': identity.headers.etag!,
      })
    ).status,
    200,
  );
});
