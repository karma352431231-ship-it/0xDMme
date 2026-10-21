import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { promisify } from 'node:util';
import { sourceTar } from '../src/tools/source-tar.ts';
import { attestationArguments } from '../src/tools/release/authenticate.ts';
import { describeFile, readUnder } from '../src/tools/release/files.ts';
import {
  encodeManifest,
  maximumManifest,
  parseManifest,
  repository,
} from '../src/tools/release/manifest.ts';
import {
  compareManifests,
  loadManifest,
  produceManifest,
  releaseSources,
  verifyLocal,
} from '../src/tools/release/produce.ts';
import { verifyPublic } from '../src/tools/release/public.ts';

const commit = 'a'.repeat(40);
const toolchain = { node: '24.14.0', npm: '11.9.0' };
const execute = promisify(execFile);

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), '0xdmme-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = {
    'src/server/main.ts': 'export const synthetic = true;',
    'infra/sample.service': '# synthetic service template',
    'package.json': '{}',
    'package-lock.json': '{}',
    '.nvmrc': '24.14.0',
    'dist/web/index.html': '<!doctype html><p>Synthetic public app</p>',
    'dist/web/sw.js': '// synthetic worker',
    '.local/VPS_SSH_TARGET': 'synthetic-user@192.0.2.123',
    '.env': 'SYNTHETIC_PRIVATE_VALUE=never-publish',
  };
  for (const [path, bytes] of Object.entries(data)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), bytes);
  }
  await writeFile(
    join(root, 'dist/web/assets.json'),
    JSON.stringify([
      { path: '/index.html', type: 'text/html' },
      { path: '/sw.js', type: 'text/javascript' },
    ]),
  );
  const input = {
    root,
    commit,
    sourcePaths: await releaseSources(root),
    toolchain,
  };
  const manifest = await produceManifest(input);
  return { root, input, manifest };
}

await test('public proof exports only approved identifiers and hashes, never private deployment inputs', async (t) => {
  const { root, input, manifest } = await fixture(t);
  const withPrivateMetadata = {
    ...input,
    vps: 'synthetic-private-host',
    baseline: { secret: 'never-publish' },
  };
  const text = encodeManifest(await produceManifest(withPrivateMetadata));
  assert.equal(text, encodeManifest(manifest));
  for (const secret of [
    '192.0.2.123',
    'synthetic-user',
    'never-publish',
    '.local',
    root,
    'synthetic-private-host',
  ])
    assert.ok(!text.includes(secret));
  assert.deepEqual(Object.keys(JSON.parse(text) as object), [
    'schema',
    'repository',
    'commit',
    'toolchain',
    'sources',
    'assetIndex',
    'assets',
  ]);
  await verifyLocal(manifest, root);
});

await test('release schema rejects private fields, path escape, duplicates, unsupported tools and unbounded data', async (t) => {
  const { manifest } = await fixture(t);
  const invalid = [
    { ...manifest, ssh: 'synthetic' },
    { ...manifest, toolchain: { ...toolchain, hostname: 'synthetic' } },
    { ...manifest, repository: 'untrusted/repository' },
    { ...manifest, commit: 'short' },
    { ...manifest, toolchain: { ...toolchain, node: '25.0.0' } },
    {
      ...manifest,
      sources: [
        ...manifest.sources,
        { path: '.local/VPS_SSH_TARGET', bytes: 1, sha256: 'b'.repeat(64) },
      ],
    },
    {
      ...manifest,
      assets: [{ path: '/../.env', bytes: 1, sha256: 'b'.repeat(64) }],
    },
    {
      ...manifest,
      assets: [{ path: '/index.html', bytes: -1, sha256: 'b'.repeat(64) }],
    },
    {
      ...manifest,
      assets: [{ path: '/index.html', bytes: 1, sha256: 'invalid' }],
    },
    { ...manifest, assets: [...manifest.assets, ...manifest.assets] },
    { ...manifest, sources: [...manifest.sources].reverse() },
    { ...manifest, sources: [] },
  ];
  for (const value of invalid)
    assert.throws(() => parseManifest(JSON.stringify(value)));
  assert.throws(() => parseManifest(' '.repeat(maximumManifest + 1)));
});

await test('source packaging reproduces bytes across metadata, path, permission and ordering differences', async (t) => {
  const first = await fixture(t),
    second = await fixture(t);
  const paths = ['src/server/main.ts', 'package.json'];
  await utimes(join(second.root, paths[0] ?? ''), 100, 200);
  await chmod(join(second.root, paths[0] ?? ''), 0o755);
  const archive = await sourceTar(first.root, paths);
  assert.deepEqual(archive, await sourceTar(second.root, paths.toReversed()));
  assert.equal(archive.subarray(108, 124).toString(), '0000000\0'.repeat(2));
  assert.equal(archive.subarray(136, 148).toString(), '00000000000\0');
  assert.ok(!archive.includes(Buffer.from(first.root)));
  await writeFile(join(second.root, 'source.tar'), archive);
  const { stdout } = await execute('tar', [
    '-xOf',
    join(second.root, 'source.tar'),
    'src/server/main.ts',
  ]);
  assert.equal(
    stdout,
    await readFile(join(first.root, 'src/server/main.ts'), 'utf8'),
  );
  await assert.rejects(
    sourceTar(first.root, ['../outside']),
    /Invalid source archive path/u,
  );
});

await test('producer rejects private assets, extra installed sources and symlinks before publishing', async (t) => {
  const { root, input } = await fixture(t);
  await assert.rejects(
    produceManifest({
      ...input,
      sourcePaths: [...input.sourcePaths, '.local/VPS_SSH_TARGET'],
    }),
    /Non-source/u,
  );
  await writeFile(join(root, 'src/server/extra.ts'), 'unexpected');
  await assert.rejects(produceManifest(input), /file set differs/u);
  await rm(join(root, 'src/server/extra.ts'));
  await writeFile(
    join(root, 'dist/web/assets.json'),
    JSON.stringify([{ path: '/.env', type: 'text/plain' }]),
  );
  await assert.rejects(produceManifest(input), /Non-public/u);
  await rm(join(root, 'src/server/main.ts'));
  await symlink(join(root, '.env'), join(root, 'src/server/main.ts'));
  await assert.rejects(produceManifest(input), /link or special file/u);
  await assert.rejects(
    readUnder(root, 'src/server/main.ts'),
    /links are forbidden/u,
  );
});

await test('disk verifier rejects changed bytes, extra assets and missing source files', async (t) => {
  const { root, manifest } = await fixture(t);
  await writeFile(join(root, 'src/server/main.ts'), 'different');
  await assert.rejects(verifyLocal(manifest, root), /content differs/u);
  await writeFile(
    join(root, 'src/server/main.ts'),
    'export const synthetic = true;',
  );
  await writeFile(join(root, 'dist/web/extra.js'), '// extra executable');
  await assert.rejects(verifyLocal(manifest, root), /file set differs/u);
  await rm(join(root, 'dist/web/extra.js'));
  await rm(join(root, 'src/server/main.ts'));
  await assert.rejects(verifyLocal(manifest, root), /file set differs/u);
});

await test('local proof binds the asset index as well as the served files', async (t) => {
  const { root, manifest } = await fixture(t);
  await writeFile(join(root, 'dist/web/assets.json'), '[]');
  await assert.rejects(verifyLocal(manifest, root), /content differs/u);
});

await test('independent manifests reproduce exactly and reject a changed artifact', async (t) => {
  const first = await fixture(t),
    second = await fixture(t);
  const paths = [
    join(first.root, 'manifest.json'),
    join(second.root, 'manifest.json'),
  ];
  await writeFile(paths[0] ?? '', encodeManifest(first.manifest));
  await writeFile(paths[1] ?? '', encodeManifest(second.manifest));
  await compareManifests(paths);
  const altered = structuredClone(second.manifest);
  const entry = altered.assets[0];
  assert.ok(entry);
  entry.sha256 = 'b'.repeat(64);
  await writeFile(paths[1] ?? '', encodeManifest(altered));
  await assert.rejects(compareManifests(paths), /builds differ/u);
  await writeFile(paths[1] ?? '', JSON.stringify(second.manifest));
  await assert.rejects(loadManifest(paths[1] ?? ''), /Non-canonical/u);
});

await test('public verifier compares complete bodies and rejects altered or unavailable assets', async (t) => {
  const { root, manifest } = await fixture(t);
  const reader = async (entry: { path: string }) =>
    readFile(join(root, 'dist/web' + entry.path));
  await verifyPublic(manifest, reader);
  await assert.rejects(
    verifyPublic(manifest, () => Promise.resolve(Buffer.from('altered'))),
    /differs/u,
  );
  await assert.rejects(
    verifyPublic(manifest, () => Promise.reject(new Error('unavailable'))),
    /unavailable/u,
  );
});

await test('public transport has fixed origin, no credentials, no redirects and bounded bodies', async (t) => {
  const { root, manifest } = await fixture(t);
  const observed: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, options: RequestInit) => {
      observed.push(url);
      assert.ok(url.startsWith('https://0xdmme.app/'));
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.equal(
        new Headers(options.headers).get('Accept-Encoding'),
        'identity',
      );
      assert.ok(options.signal instanceof AbortSignal);
      const path =
        new URL(url).pathname === '/' ? '/index.html' : new URL(url).pathname;
      return new Response(await readFile(join(root, 'dist/web' + path)));
    },
  );
  await verifyPublic(manifest);
  assert.ok(observed.includes('https://0xdmme.app/?atualizar=1'));
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('x'.repeat(1000))),
  );
  await assert.rejects(verifyPublic(manifest), /expected size/u);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('', { status: 302 })),
  );
  await assert.rejects(verifyPublic(manifest), /unavailable/u);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      new Response('', { headers: { 'Content-Encoding': 'gzip' } }),
    ),
  );
  await assert.rejects(verifyPublic(manifest), /encoding/u);
});

await test('authentication pins the repository, main ref, exact commit, workflow and hosted signer', () => {
  const args = attestationArguments('manifest.json', commit);
  assert.deepEqual(args, [
    'attestation',
    'verify',
    resolve('manifest.json'),
    '--hostname',
    'github.com',
    '--repo',
    repository,
    '--signer-workflow',
    repository + '/.github/workflows/release-proof.yml',
    '--source-ref',
    'refs/heads/main',
    '--source-digest',
    commit,
    '--cert-identity',
    'https://github.com/' +
      repository +
      '/.github/workflows/release-proof.yml@refs/heads/main',
    '--deny-self-hosted-runners',
  ]);
  assert.throws(() => attestationArguments('manifest.json', 'main'));
});

await test('CLI fails closed on an unauthenticated manifest and never reports E2EE as verified', async (t) => {
  const { root, manifest } = await fixture(t);
  const path = join(root, 'manifest.json');
  await writeFile(path, encodeManifest(manifest));
  await assert.rejects(
    execute(process.execPath, [
      'src/tools/release/verify.ts',
      'public',
      path,
      'b'.repeat(40),
    ]),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'stderr' in error);
      assert.match(
        String(error.stderr),
        /No version or E2EE guarantee was established/u,
      );
      assert.ok(!String(error.stderr).includes(root));
      return true;
    },
  );
});

await test('CLI refuses an exact manifest when signature verification is unavailable', async (t) => {
  const { root, manifest } = await fixture(t);
  const path = join(root, 'manifest.json');
  await writeFile(path, encodeManifest(manifest));
  const empty = join(root, 'empty-bin');
  await mkdir(empty);
  await assert.rejects(
    execute(
      process.execPath,
      ['src/tools/release/verify.ts', 'public', path, commit],
      {
        env: { ...process.env, PATH: empty },
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'stderr' in error);
      assert.match(
        String(error.stderr),
        /No version or E2EE guarantee was established/u,
      );
      return true;
    },
  );
});

await test('release file descriptions hash content without copying arbitrary metadata', () => {
  const value = describeFile('/sw.js', Buffer.from('synthetic'));
  assert.deepEqual(Object.keys(value), ['path', 'bytes', 'sha256']);
});
