import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { frontendSource } from '../src/tools/frontend-source.ts';

await test('empacotamento preserva fontes completas quando o gzip passa de 2 MiB', async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const fixture = await mkdtemp(resolve(tmpdir(), '0xdmme-source-build-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await Promise.all(
    [
      'src',
      'docs',
      'vendor',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.nvmrc',
      'LICENSES.md',
      'LICENSE-GPL-3.0.txt',
    ].map((path) =>
      cp(resolve(root, path), resolve(fixture, path), { recursive: true }),
    ),
  );
  const path = 'src/client/app/source-size-fixture.bin';
  const original = randomBytes(3 * 1024 * 1024);
  await writeFile(resolve(fixture, path), original);
  const archive = await frontendSource(fixture, new Set());
  assert.ok(archive.length > 2 * 1024 * 1024);
  const archivePath = resolve(fixture, 'sources.tar.gz');
  await writeFile(archivePath, archive);
  const { stdout } = await promisify(execFile)(
    'tar',
    ['-xOzf', archivePath, path],
    { encoding: 'buffer', maxBuffer: original.length + 1024, timeout: 10_000 },
  );
  assert.equal(stdout.length, original.length);
  assert.equal(
    createHash('sha256').update(stdout).digest('hex'),
    createHash('sha256').update(original).digest('hex'),
  );
});
