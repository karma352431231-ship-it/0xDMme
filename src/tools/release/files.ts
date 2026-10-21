import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ReleaseFile } from './manifest.ts';
import { maximumFile } from './manifest.ts';
import { readBoundedFile } from '../bounded-file.ts';

export function describeFile(path: string, content: Uint8Array): ReleaseFile {
  return {
    path,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export async function readUnder(
  root: string,
  path: string,
  limit = maximumFile,
): Promise<Buffer> {
  if (
    !path ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '..' || part === '.')
  )
    throw new Error('Unsafe release file path.');
  let current = resolve(root);
  for (const part of path.split('/')) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error('Release links are forbidden.');
  }
  return readBoundedFile(current, limit);
}

export async function inventory(
  root: string,
  base: string,
  budget = { remaining: 4096 },
): Promise<string[]> {
  if (
    base.split('/').length > 16 ||
    !(await lstat(join(root, base))).isDirectory()
  )
    throw new Error('Invalid release directory.');
  const entries = await readdir(join(root, base), { withFileTypes: true });
  budget.remaining -= entries.length;
  if (budget.remaining < 0)
    throw new Error('Release directory exceeds its budget.');
  const result: string[] = [];
  for (const entry of entries) {
    const path = base + '/' + entry.name;
    if (entry.isDirectory())
      result.push(...(await inventory(root, path, budget)));
    else if (entry.isFile()) result.push(path);
    else throw new Error('Release contains a link or special file.');
    if (result.length > 2048)
      throw new Error('Release file count exceeds its budget.');
  }
  return result.sort();
}

export function samePaths(actual: string[], expected: string[]): void {
  if (
    JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())
  )
    throw new Error('Release file set differs.');
}

export async function verifyFiles(
  root: string,
  entries: ReleaseFile[],
  prefix = '',
): Promise<void> {
  for (const entry of entries) {
    const bytes = await readUnder(root, prefix + entry.path, entry.bytes);
    const actual = describeFile(entry.path, bytes);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256)
      throw new Error('Release file content differs.');
  }
}
