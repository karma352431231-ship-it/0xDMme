import { spawn } from 'node:child_process';
import { isAbsolute, resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { AccountError } from '../../shared/account/index.ts';
import { isolatedMediaProcess } from './isolated.ts';

export interface MediaRuntime {
  ffmpeg: string;
  ffprobe: string;
  limit: string | null;
  socket?: string;
}
export async function verifyMediaBudget(
  runtime: MediaRuntime | null,
): Promise<void> {
  if (runtime?.socket) {
    const output = await isolatedMediaProcess(
      runtime.socket,
      null,
      AbortSignal.timeout(10_000),
    );
    if (output !== '0xdmme-media-worker-v1')
      throw new Error('Worker de mídia divergente.');
    return;
  }
  if (!runtime || process.platform !== 'linux') return;
  await verifyLocalBudget();
}
async function verifyLocalBudget(): Promise<void> {
  const entry = (await readFile('/proc/self/cgroup', 'utf8'))
    .split('\n')
    .find((line) => line.startsWith('0::'));
  if (!entry)
    throw new Error(
      'Processador exige orçamento de memória verificável no Linux.',
    );
  const root = '/sys/fs/cgroup';
  let path = resolve(root, entry.slice(3).replace(/^\//u, ''));
  while (path.startsWith(root)) {
    const value = await memoryLimit(path, root);
    if (value !== 'max' && !/^[1-9]\d*$/u.test(value))
      throw new Error('Limite de memória do processador inválido.');
    if (value !== 'max' && Number(value) < 8_589_934_592)
      throw new Error(
        'Processador exige revisão do orçamento do serviço: limite herdado inferior a 8 GiB.',
      );
    if (path === root) break;
    path = dirname(path);
  }
}
async function memoryLimit(path: string, root: string): Promise<string> {
  try {
    return (await readFile(resolve(path, 'memory.max'), 'utf8')).trim();
  } catch (error: unknown) {
    // The host cgroup root has no memory.max; a mounted container root may have one.
    if (
      path === root &&
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return 'max';
    throw error;
  }
}
export function readMediaRuntime(
  env: Readonly<Record<string, string | undefined>>,
): MediaRuntime | null {
  const ffmpeg = env['HASH_TALK_MEDIA_FFMPEG'],
    ffprobe = env['HASH_TALK_MEDIA_FFPROBE'],
    socket = env['HASH_TALK_MEDIA_SOCKET'];
  if (!ffmpeg && !ffprobe && !socket) return null;
  if (!absoluteBinary(ffmpeg) || !absoluteBinary(ffprobe))
    throw new Error('Configure executáveis absolutos do processador.');
  if (socket && !isAbsolute(socket))
    throw new Error('Configure socket absoluto do processador.');
  return {
    ffmpeg,
    ffprobe,
    limit: process.platform === 'linux' ? '/usr/bin/prlimit' : null,
    ...(socket ? { socket } : {}),
  };
}
function absoluteBinary(value: string | undefined): value is string {
  return Boolean(value && isAbsolute(value));
}
/** No shell; file/pipe protocols only. Linux address space is bounded at 8 GiB.
 * Deployment must additionally isolate the worker from the web service and other projects. */
export function mediaProcess(
  runtime: MediaRuntime,
  request: {
    binary: 'ffmpeg' | 'ffprobe';
    args: string[];
    signal: AbortSignal;
    maximumBytes: number;
  },
): Promise<string> {
  if (runtime.socket)
    return isolatedMediaProcess(runtime.socket, request, request.signal);
  return new Promise((resolve, reject) => {
    const binary = runtime[request.binary];
    const args = runtime.limit
      ? [
          '--as=8589934592',
          '--nproc=128',
          `--fsize=${request.maximumBytes}`,
          '--',
          binary,
          ...request.args,
        ]
      : request.args;
    const child = spawn(runtime.limit ?? binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      signal: request.signal,
      killSignal: 'SIGKILL',
    });
    let output = '',
      size = 0,
      overflow = false;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65_536) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      output += chunk.toString();
    });
    // Diagnostic data can contain filenames/metadata: discard rather than logging it.
    child.stderr.resume();
    child.once('error', () =>
      reject(
        new AccountError(
          503,
          'Processador indisponível ou interrompido. Retome o envio.',
        ),
      ),
    );
    child.once('close', (code) => {
      if (code !== 0 || overflow)
        reject(
          new AccountError(
            422,
            'Não foi possível preparar a mídia dentro dos limites. Confira o arquivo.',
          ),
        );
      else resolve(output);
    });
  });
}
