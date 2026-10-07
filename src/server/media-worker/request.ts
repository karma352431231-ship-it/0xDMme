import { lstat, realpath, chmod } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { object, keys, uuid } from '../../shared/account/index.ts';
import { mediaCommandPaths } from '../community-media/index.ts';
import type { MediaProcessRequest } from '../community-media/index.ts';

export function mediaWorkerRequest(value: unknown): MediaProcessRequest | null {
  const input = object(value);
  if (input['operation'] === 'health') {
    keys(input, ['operation']);
    return null;
  }
  keys(input, ['operation', 'binary', 'args', 'maximumBytes']);
  const args = workerArgs(input['args']);
  if (
    input['operation'] !== 'process' ||
    !['ffmpeg', 'ffprobe'].includes(String(input['binary'])) ||
    !Number.isInteger(input['maximumBytes']) ||
    Number(input['maximumBytes']) < 1 ||
    Number(input['maximumBytes']) > 100_000_000
  )
    throw new Error('Pedido de mídia inválido.');
  return {
    binary: input['binary'] === 'ffmpeg' ? 'ffmpeg' : 'ffprobe',
    args,
    maximumBytes: Number(input['maximumBytes']),
  };
}
function workerArgs(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 128)
    throw new Error('Argumentos inválidos.');
  return value.map((arg: unknown) => {
    if (typeof arg !== 'string' || arg.length > 1024 || arg.includes('\0'))
      throw new Error('Argumento inválido.');
    return arg;
  });
}

export async function verifyWorkerPaths(
  root: string,
  request: MediaProcessRequest,
): Promise<string[]> {
  const paths = mediaCommandPaths(request);
  if (!paths.length || paths.length > 2) throw new Error('Caminhos inválidos.');
  let id: string | null = null;
  for (const path of paths) {
    const directory = dirname(path),
      candidate = uuid(basename(directory));
    if (
      directory !== resolve(root, candidate) ||
      (id && id !== candidate) ||
      !['source', 'result', 'thumbnail'].includes(basename(path))
    )
      throw new Error('Caminho fora da mídia pública.');
    if ((await realpath(directory)) !== directory)
      throw new Error('Diretório irregular.');
    id = candidate;
    await verifyRegularFile(path);
  }
  return paths;
}

async function verifyRegularFile(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error('Arquivo irregular.');
  } catch (error: unknown) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      ['result', 'thumbnail'].includes(basename(path))
    ))
      throw error;
  }
}

export async function shareWorkerOutput(paths: string[]): Promise<void> {
  for (const path of paths) {
    if (basename(path) === 'source') continue;
    await verifyRegularFile(path);
    await chmod(path, 0o640);
  }
}
