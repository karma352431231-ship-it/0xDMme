import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { encodeManifest } from './manifest.ts';
import { produceManifest } from './produce.ts';

const execute = promisify(execFile);
async function git(args: string[]): Promise<string> {
  return (
    await execute('git', args, { maxBuffer: 1024 * 1024, timeout: 10_000 })
  ).stdout;
}
async function clean(): Promise<void> {
  if ((await git(['status', '--porcelain'])).trim())
    throw new Error('A clean committed checkout is required.');
}
try {
  await clean();
  const commit = (await git(['rev-parse', 'HEAD'])).trim();
  const paths = (
    await git([
      'ls-tree',
      '-rz',
      '--name-only',
      'HEAD',
      '--',
      'src',
      'infra',
      'package.json',
      'package-lock.json',
      '.nvmrc',
    ])
  )
    .split('\0')
    .filter(Boolean);
  const npm = (
    await execute('npm', ['--version'], { timeout: 10_000 })
  ).stdout.trim();
  const manifest = await produceManifest({
    root: process.cwd(),
    commit,
    sourcePaths: paths,
    toolchain: { node: process.versions.node, npm },
  });
  await clean();
  if ((await git(['rev-parse', 'HEAD'])).trim() !== commit)
    throw new Error('Release commit changed.');
  await mkdir('dist/release', { recursive: true });
  await writeFile(
    'dist/release/release-manifest.json',
    encodeManifest(manifest),
  );
  console.log(
    JSON.stringify({
      releaseManifest: true,
      commit,
      sourceFiles: manifest.sources.length,
      publicAssets: manifest.assets.length,
    }),
  );
} catch {
  console.error(
    'Release manifest creation failed. Check the clean source tree, build and pinned toolchain locally.',
  );
  process.exitCode = 1;
}
