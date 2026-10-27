import { constants } from 'node:fs';
import { mkdir, open, realpath, rename, unlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { reportObject } from './model.ts';

export const diagnosticLimit = 131072;
export function diagnosticDirectory(objects: string): string {
  return resolve(objects, '.diagnostics');
}
export async function prepareDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await realpath(directory)) !== resolve(directory))
    throw new Error('Diagnostic directory must not use symbolic links.');
  if (((await stat(directory)).mode & 0o077) !== 0)
    throw new Error('Diagnostic directory must be private.');
}
export async function writePrivate(path: string, value: object): Promise<void> {
  const content = JSON.stringify(value);
  if (Buffer.byteLength(content) > diagnosticLimit)
    throw new Error('Diagnostic report exceeds its budget.');
  // One writer per owned report; a fixed temporary file cannot accumulate after crashes.
  const pending = path + '.pending';
  try {
    const file = await open(
      pending,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_TRUNC |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.chmod(0o600);
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(pending, path);
  } finally {
    await unlink(pending).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    });
  }
}
export async function readPrivate(
  path: string,
): Promise<Record<string, unknown> | null> {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  ).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  });
  if (!file) return null;
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size > diagnosticLimit
    )
      throw new Error('Private diagnostics unavailable.');
    const content = Buffer.alloc(diagnosticLimit + 1);
    const { bytesRead } = await file.read(content, 0, content.length, 0);
    if (bytesRead > diagnosticLimit)
      throw new Error('Diagnostic report exceeds its budget.');
    return reportObject(
      JSON.parse(content.subarray(0, bytesRead).toString('utf8')) as unknown,
    );
  } finally {
    await file.close();
  }
}
export function diagnosticFile(
  directory: string,
  name: 'events' | 'lifecycle' | 'fatal' | 'service-exit',
): string {
  return join(directory, name + '.json');
}
