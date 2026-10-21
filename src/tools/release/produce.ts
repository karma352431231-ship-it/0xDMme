import { readBoundedFile } from '../bounded-file.ts';
import {
  describeFile,
  inventory,
  readUnder,
  samePaths,
  verifyFiles,
} from './files.ts';
import {
  assetPath,
  encodeManifest,
  maximumManifest,
  parseManifest,
  repository,
  sourcePath,
} from './manifest.ts';
import type { ReleaseManifest } from './manifest.ts';

export async function releaseSources(root: string): Promise<string[]> {
  return [
    ...(await inventory(root, 'src')),
    ...(await inventory(root, 'infra')),
    'package.json',
    'package-lock.json',
    '.nvmrc',
  ].sort();
}

async function publicPaths(root: string): Promise<string[]> {
  const value: unknown = JSON.parse(
    (await readUnder(root, 'dist/web/assets.json', maximumManifest)).toString(),
  );
  if (!Array.isArray(value) || !value.length || value.length > 128)
    throw new Error('Invalid public asset index.');
  const paths = (value as unknown[])
    .map((item) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('path' in item) ||
        typeof item.path !== 'string' ||
        !assetPath(item.path)
      )
        throw new Error('Non-public asset rejected.');
      return item.path;
    })
    .sort();
  const actual = (await inventory(root, 'dist/web')).filter(
    (path) => path !== 'dist/web/assets.json',
  );
  samePaths(
    actual,
    paths.map((path) => 'dist/web' + path),
  );
  return paths;
}

export async function produceManifest(input: {
  root: string;
  commit: string;
  sourcePaths: string[];
  toolchain: { node: string; npm: string };
}): Promise<ReleaseManifest> {
  if (input.sourcePaths.some((path) => !sourcePath(path)))
    throw new Error('Non-source path rejected.');
  samePaths(await releaseSources(input.root), input.sourcePaths);
  const sources = [];
  for (const path of [...input.sourcePaths].sort())
    sources.push(describeFile(path, await readUnder(input.root, path)));
  const assets = [];
  for (const path of await publicPaths(input.root))
    assets.push(
      describeFile(path, await readUnder(input.root, 'dist/web' + path)),
    );
  // Reconstruct through the public schema: no spread of private input metadata.
  return parseManifest(
    JSON.stringify({
      schema: 1,
      repository,
      commit: input.commit,
      toolchain: { node: input.toolchain.node, npm: input.toolchain.npm },
      sources,
      assetIndex: describeFile(
        'dist/web/assets.json',
        await readUnder(input.root, 'dist/web/assets.json', maximumManifest),
      ),
      assets,
    }),
  );
}

export async function loadManifest(path: string): Promise<ReleaseManifest> {
  const text = (await readBoundedFile(path, maximumManifest)).toString();
  const manifest = parseManifest(text);
  if (text !== encodeManifest(manifest))
    throw new Error('Non-canonical release manifest.');
  return manifest;
}

export async function verifyLocal(
  manifest: ReleaseManifest,
  root: string,
): Promise<void> {
  samePaths(
    await releaseSources(root),
    manifest.sources.map((entry) => entry.path),
  );
  await verifyFiles(root, manifest.sources);
  await verifyFiles(root, [manifest.assetIndex]);
  samePaths(
    (await inventory(root, 'dist/web')).filter(
      (path) => path !== 'dist/web/assets.json',
    ),
    manifest.assets.map((entry) => 'dist/web' + entry.path),
  );
  await verifyFiles(root, manifest.assets, 'dist/web');
}

export async function compareManifests(paths: string[]): Promise<void> {
  if (paths.length !== 2)
    throw new Error('Two independently built manifests are required.');
  const [first, second] = await Promise.all(paths.map(loadManifest));
  if (!first || !second || encodeManifest(first) !== encodeManifest(second))
    throw new Error('Independent release builds differ.');
}
