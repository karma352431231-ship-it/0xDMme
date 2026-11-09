import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { mobileProductAssets } from './mobile-product-assets.ts';

const root = new URL('../../', import.meta.url);
const directory = new URL('dist/mobile/', root);
const files = await mobileProductAssets(root);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceDirty =
  execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).length > 0;
const maximum = 96 * 1024 * 1024;
if (
  [...files.values()].reduce((total, bytes) => total + bytes.length, 0) >
  maximum
)
  throw new Error('Installed product assets exceed their 96 MiB build budget.');

async function readPreviousManifest(): Promise<unknown> {
  try {
    return JSON.parse(
      await readFile(new URL('build.json', directory), 'utf8'),
    ) as unknown;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
}

async function previousAssets(): Promise<Set<string>> {
  const value = await readPreviousManifest();
  if (value === undefined) return new Set();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('assets' in value) ||
    typeof value.assets !== 'object' ||
    value.assets === null
  )
    throw new Error('Existing mobile build ownership is unknown.');
  const names = Object.keys(value.assets);
  if (
    names.length > 128 ||
    names.some((name) => !/^[a-z0-9][a-z0-9.-]*$/u.test(name))
  )
    throw new Error('Existing mobile build inventory is invalid.');
  return new Set(names);
}

await mkdir(directory, { recursive: true });
const previous = await previousAssets();
const entries = await readdir(directory, { withFileTypes: true });
if (entries.length > 128)
  throw new Error('Existing mobile build inventory is excessive.');
for (const entry of entries)
  if (
    !entry.isFile() ||
    (!previous.has(entry.name) && entry.name !== 'build.json')
  )
    throw new Error('Unexpected mobile build entry; no files were removed.');
for (const [name, bytes] of files)
  await writeFile(new URL(name, directory), bytes);
for (const name of previous)
  if (!files.has(name)) await unlink(new URL(name, directory));
await writeFile(
  new URL('build.json', directory),
  JSON.stringify(
    {
      kind: 'native-product-v1',
      sourceCommit,
      sourceDirty,
      serviceOrigin: 'https://0xdmme.app',
      assets: Object.fromEntries(
        [...files].map(([name, bytes]) => [
          name,
          {
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ]),
      ),
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  `Installed product: ${files.size} packaged local assets. Native connection required.\n`,
);
