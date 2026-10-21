import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { frontendSource } from '../src/tools/frontend-source.ts';
import { loadWebAssets } from '../src/server/web-host/index.ts';

await test('portable package preserves exact sources and licenses without private Mac metadata', async (t) => {
  const root = process.cwd(),
    temporary = await mkdtemp(join(tmpdir(), '0xdmme-source-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const sources = [
    'src/client/public-search/index.ts',
    'src/client/public-search/query.ts',
    'src/client/message-runtime/index.ts',
    'src/client/messages/startup.ts',
    'src/client/groups/actions-ui.ts',
    'src/client/groups/admission.ts',
    'src/shared/groups/index.ts',
    'src/shared/groups/links.ts',
    'LICENSES.md',
    'package-lock.json',
  ];
  const archive = await frontendSource(root, new Set(sources));
  const path = join(temporary, 'source.tar.gz');
  await writeFile(path, archive);
  const execute = promisify(execFile);
  const { stdout: listed } = await execute('tar', ['-tzf', path]);
  const entries = listed.trim().split('\n');
  assert.ok(entries.length <= 2048);
  assert.ok(
    entries.every(
      (name) =>
        !name.startsWith('/') &&
        !name.split('/').some((part) => part === '..' || part.startsWith('._')),
    ),
  );
  for (const source of sources) {
    assert.ok(entries.includes(source));
    const { stdout } = await execute('tar', ['-xOzf', path, source], {
      encoding: 'buffer',
      maxBuffer: 24 * 1024 * 1024,
    });
    assert.deepEqual(stdout, await readFile(join(root, source)));
  }
  await execute('tar', ['-xzf', path, '-C', temporary]);
  for (const source of sources) {
    await utimes(join(temporary, source), 100, 200);
    await chmod(join(temporary, source), 0o755);
  }
  assert.deepEqual(await frontendSource(temporary, new Set(sources)), archive);
});

await test('source packaging preserves more than 1024 files and rejects an unbounded source tree', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), '0xdmme-source-count-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const execute = promisify(execFile);
  const path = join(temporary, 'source.tar.gz');
  await writeFile(path, await frontendSource(process.cwd(), new Set()));
  const { stdout: initial } = await execute('tar', ['-tzf', path]);
  await execute('tar', ['-xzf', path, '-C', temporary]);
  const initialCount = initial.trim().split('\n').length;
  const dependency = 'node_modules/source-count-fixture';
  let count = initialCount;
  const grow = async (target: number) => {
    while (count < target) {
      const directory = join(
        temporary,
        dependency,
        String(Math.floor(count / 128)),
      );
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, `${count}.js`),
        `export const n = ${count};`,
      );
      count++;
    }
  };
  await grow(1025);
  const input = `${dependency}/${Math.floor(initialCount / 128)}/${initialCount}.js`;
  await writeFile(path, await frontendSource(temporary, new Set([input])));
  const { stdout: listed } = await execute('tar', ['-tzf', path]);
  const names = listed.trim().split('\n');
  assert.equal(new Set(names).size, 1025);
  assert.ok(names.includes(input));
  const { stdout: source } = await execute('tar', ['-xOzf', path, input]);
  assert.equal(source, await readFile(join(temporary, input), 'utf8'));
  await grow(2049);
  await assert.rejects(
    frontendSource(temporary, new Set([input])),
    /Source count exceeds the limit/u,
  );
});

await test('source files above 2 MiB are packaged and served without relaxing other asset limits', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), '0xdmme-large-source-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const execute = promisify(execFile);
  const initial = join(temporary, 'initial.tar.gz');
  await writeFile(initial, await frontendSource(process.cwd(), new Set()));
  await execute('tar', ['-xzf', initial, '-C', temporary]);
  const dependency = 'node_modules/source-limit-fixture/index.js';
  const bytes = randomBytes(2 * 1024 * 1024 + 1024);
  await mkdir(join(temporary, 'node_modules/source-limit-fixture'), {
    recursive: true,
  });
  await writeFile(join(temporary, dependency), bytes);
  const archive = await frontendSource(temporary, new Set([dependency]));
  assert.ok(archive.byteLength > 2 * 1024 * 1024);
  const sourcePath = `/source-${createHash('sha256').update(archive).digest('hex').slice(0, 16)}.tar.gz`;
  await writeFile(join(temporary, sourcePath.slice(1)), archive);
  const { stdout } = await execute(
    'tar',
    ['-xOzf', join(temporary, sourcePath.slice(1)), dependency],
    { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024 },
  );
  assert.deepEqual(stdout, bytes);
  await writeFile(join(temporary, 'index.html'), '<!doctype html>');
  await writeFile(join(temporary, 'sw.js'), '// synthetic shell');
  const manifest = [
    { path: '/index.html', type: 'text/html' },
    { path: '/sw.js', type: 'text/javascript' },
    { path: sourcePath, type: 'application/gzip' },
  ];
  const root = pathToFileURL(temporary + '/');
  await writeFile(join(temporary, 'assets.json'), JSON.stringify(manifest));
  assert.deepEqual(
    (await loadWebAssets(root)).get(sourcePath)?.content,
    archive,
  );
  await writeFile(join(temporary, 'oversized.js'), archive);
  manifest.push({ path: '/oversized.js', type: 'text/javascript' });
  await writeFile(join(temporary, 'assets.json'), JSON.stringify(manifest));
  await assert.rejects(loadWebAssets(root), /Asset exceeds the limit/u);
});
