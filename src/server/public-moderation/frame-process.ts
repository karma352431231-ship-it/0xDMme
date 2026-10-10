import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { MediaRuntime } from '../community-media/index.ts';
import type { PreparedFrameInput } from './frame-contract.ts';
import { AccountError, object } from '../../shared/account/index.ts';
export const frameDemuxers = {
  'image/png': 'png_pipe',
  'image/jpeg': 'jpeg_pipe',
  'image/gif': 'gif',
  'video/mp4': 'mov',
} as const;
export function pipeProcess(
  runtime: MediaRuntime,
  input: PreparedFrameInput,
  request: {
    binary: 'ffmpeg' | 'ffprobe';
    args: string[];
    signal: AbortSignal;
  },
) {
  const binary = runtime[request.binary];
  const child = spawn(
    runtime.limit ?? binary,
    runtime.limit
      ? [
          '--as=8589934592',
          '--nproc=128',
          '--fsize=1048576',
          '--',
          binary,
          ...request.args,
        ]
      : request.args,
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      signal: request.signal,
      killSignal: 'SIGKILL',
    },
  );
  // Decoder diagnostics can carry media metadata. Never persist or export them.
  child.stderr.resume();
  child.stdin.on('error', () => child.kill('SIGKILL'));
  child.stdin.end(input.bytes);
  return child;
}
export async function inspectPreparedFrames(options: {
  runtime: MediaRuntime;
  input: PreparedFrameInput;
  signal: AbortSignal;
}): Promise<{ frames: number; width: number; height: number }> {
  const { runtime, input, signal } = options;
  const child = pipeProcess(runtime, input, {
    binary: 'ffprobe',
    signal,
    args: [
      '-v',
      'error',
      '-threads',
      '4',
      '-max_alloc',
      '268435456',
      '-protocol_whitelist',
      'pipe',
      '-format_whitelist',
      frameDemuxers[input.type],
      '-f',
      frameDemuxers[input.type],
      '-i',
      'pipe:0',
      '-count_frames',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=nb_read_frames,width,height',
      '-of',
      'json',
    ],
  });
  const closed = completion(child);
  let output = '';
  try {
    for await (const chunk of child.stdout) {
      if (
        !(chunk instanceof Uint8Array) ||
        Buffer.byteLength(output) + chunk.length > 4096
      )
        throw new Error('Invalid prepared metadata.');
      output += Buffer.from(chunk).toString('utf8');
    }
    if (!(await closed)) throw new Error('Incomplete media inspection.');
    signal.throwIfAborted();
    return preparedMetadata(output, input.maximumFrames);
  } catch {
    child.kill('SIGKILL');
    await closed;
    throw new AccountError(503, 'Inspeção da mídia indisponível.');
  }
}
function preparedMetadata(output: string, maximum: number) {
  const streams = object(JSON.parse(output))['streams'];
  if (!Array.isArray(streams) || streams.length !== 1)
    throw new Error('Invalid stream count.');
  const data = object(streams[0]),
    frames = Number(data['nb_read_frames']),
    width = Number(data['width']),
    height = Number(data['height']);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > maximum)
    throw new Error('Incomplete or excessive frame count.');
  if (
    ![width, height].every(
      (v) => Number.isSafeInteger(v) && v >= 1 && v <= 2048,
    )
  )
    throw new Error('Prepared native dimensions exceed budget.');
  return { frames, width, height };
}
/** Resolves only on process close, including spawn/abort errors, so no child escapes its job. */
export function completion(
  child: ChildProcessWithoutNullStreams,
): Promise<boolean> {
  return new Promise((resolve) => {
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    child.once('close', (code) => resolve(!failed && code === 0));
  });
}
