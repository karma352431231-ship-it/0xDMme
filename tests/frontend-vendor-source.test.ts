import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frontendVendorSource } from '../src/tools/frontend-vendor-source.ts';

await test('fontes preferenciais exigem arquivo exato e versões revisadas, sem baixar dependências', async (t) => {
  const root = await mkdtemp(join(tmpdir(), '0xdmme-vendor-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archiveDirectory = join(root, 'vendor/libsodium-0.8.4');
  await mkdir(archiveDirectory, { recursive: true });
  const archivePath = join(archiveDirectory, 'preferred-source.tar.xz');
  await copyFile('vendor/libsodium-0.8.4/preferred-source.tar.xz', archivePath);
  for (const name of ['libsodium', 'libsodium-wrappers']) {
    const directory = join(root, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ version: '0.8.4' }),
    );
  }
  const bytes = await frontendVendorSource(root);
  assert.ok(bytes.length < 2 * 1024 * 1024);
  await writeFile(archivePath, 'altered-source');
  await assert.rejects(frontendVendorSource(root), /alteradas sem revisão/u);
  await writeFile(archivePath, bytes);
  await writeFile(
    join(root, 'node_modules/libsodium/package.json'),
    JSON.stringify({ version: '0.8.5' }),
  );
  await assert.rejects(frontendVendorSource(root), /nova revisão de versão/u);
});
