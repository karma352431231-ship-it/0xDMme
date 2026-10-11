import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { AccountError } from '../../shared/account/index.ts';
import type { MediaRuntime } from '../community-media/index.ts';
import {
  completion,
  frameDemuxers,
  inspectPreparedFrames,
} from './frame-process.ts';
import type {
  FrameVerdict,
  PreparedFrameInput,
  PreparedFrameShape,
  PreparedRgbaDetector,
  PreparedRgbaFrame,
} from './frame-contract.ts';

function decodedPair(options: {
  runtime: MediaRuntime;
  input: PreparedFrameInput;
  shape: PreparedFrameShape;
  signal: AbortSignal;
}) {
  const { runtime, input, shape, signal } = options;
  const { width, height, left, top } = shape.context;
  const args = [
    '-hide_banner',
    '-v',
    'error',
    '-nostdin',
    '-xerror',
    '-err_detect',
    'explode',
    '-threads',
    '4',
    '-filter_threads',
    '4',
    '-filter_complex_threads',
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
    '-filter_complex',
    `[0:v:0]split=2[n][c];[n]format=rgba[native];[c]scale=${width}:${height},pad=512:512:${left}:${top},format=rgba[context]`,
    '-map',
    '[context]',
    '-an',
    '-sn',
    '-dn',
    '-fps_mode',
    'passthrough',
    '-pix_fmt',
    'rgba',
    '-threads',
    '4',
    '-f',
    'rawvideo',
    'pipe:1',
    '-map',
    '[native]',
    '-an',
    '-sn',
    '-dn',
    '-fps_mode',
    'passthrough',
    '-pix_fmt',
    'rgba',
    '-threads',
    '4',
    '-f',
    'rawvideo',
    'pipe:3',
  ];
  const child = spawn(
    runtime.limit ?? runtime.ffmpeg,
    runtime.limit
      ? [
          '--as=8589934592',
          '--nproc=128',
          '--fsize=1048576',
          '--',
          runtime.ffmpeg,
          ...args,
        ]
      : args,
    {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      signal,
      killSignal: 'SIGKILL',
    },
  );
  child.stderr.resume();
  child.stdin.on('error', () => child.kill('SIGKILL'));
  child.stdin.end(input.bytes);
  const native = child.stdio[3];
  if (!native || !('read' in native)) {
    child.kill('SIGKILL');
    throw new Error('Native frame pipe unavailable.');
  }
  return { child, native };
}
async function* completeFrames(
  output: Readable,
  bytes: number,
): AsyncGenerator<Uint8Array> {
  let frame = new Uint8Array(bytes),
    offset = 0;
  for await (const chunk of output) {
    if (!(chunk instanceof Uint8Array))
      throw new Error('Invalid decoded frame.');
    let cursor = 0;
    while (cursor < chunk.length) {
      const size = Math.min(bytes - offset, chunk.length - cursor);
      frame.set(chunk.subarray(cursor, cursor + size), offset);
      cursor += size;
      offset += size;
      if (offset !== bytes) continue;
      yield frame;
      frame = new Uint8Array(bytes);
      offset = 0;
    }
  }
  if (offset) throw new Error('Incomplete decoded frame.');
}
function contextShape(width: number, height: number): PreparedFrameShape {
  const factor = Math.min(512 / width, 512 / height),
    w = Math.max(1, canonicalRound(width * factor)),
    h = Math.max(1, canonicalRound(height * factor));
  return {
    native: { width, height },
    context: {
      width: w,
      height: h,
      left: Math.floor((512 - w) / 2),
      top: Math.floor((512 - h) / 2),
    },
  };
}
function canonicalRound(value: number): number {
  const integer = Math.floor(value);
  return value - integer === 0.5 ? integer + (integer % 2) : Math.round(value);
}
async function evaluateBatch(options: {
  frames: PreparedRgbaFrame[];
  shape: PreparedFrameShape;
  detector: PreparedRgbaDetector;
  signal: AbortSignal;
}): Promise<FrameVerdict> {
  const results = await options.detector.classifyPrepared(
    options.frames,
    options.shape,
    options.signal,
  );
  options.signal.throwIfAborted();
  if (
    results.length !== options.frames.length ||
    results.some((v) => !['allow', 'hold', 'reject'].includes(v))
  )
    throw new Error('Incomplete inference coverage.');
  return results.includes('reject')
    ? 'reject'
    : results.includes('hold')
      ? 'hold'
      : 'allow';
}
async function nextPair(
  native: AsyncIterator<Uint8Array>,
  context: AsyncIterator<Uint8Array>,
): Promise<PreparedRgbaFrame | null> {
  const [n, c] = await Promise.all([native.next(), context.next()]);
  if (n.done && c.done) return null;
  if (n.done || c.done) throw new Error('Unpaired media sequence.');
  return { native: n.value, context: c.value };
}
async function pairedScan(options: {
  native: Readable;
  context: Readable;
  expected: number;
  shape: PreparedFrameShape;
  detector: PreparedRgbaDetector;
  signal: AbortSignal;
}) {
  const { shape, signal } = options;
  const native = completeFrames(
      options.native,
      shape.native.width * shape.native.height * 4,
    ),
    context = completeFrames(options.context, 512 * 512 * 4);
  const frames: PreparedRgbaFrame[] = [];
  let count = 0,
    verdict: FrameVerdict = 'allow';
  while (true) {
    signal.throwIfAborted();
    const pair = await nextPair(native, context);
    if (pair === null) break;
    if (++count > options.expected) throw new Error('Unpaired media sequence.');
    frames.push(pair);
    if (frames.length < 2 && count !== options.expected) continue;
    const next = await evaluateBatch({
      frames,
      shape,
      detector: options.detector,
      signal,
    });
    if (next === 'reject' || verdict === 'allow') verdict = next;
    frames.length = 0;
  }
  if (count !== options.expected || frames.length)
    throw new Error('Incomplete prepared sequence.');
  return { frames: count, verdict };
}
export async function classifyPreparedRgbaFrames(options: {
  runtime: MediaRuntime;
  input: PreparedFrameInput;
  detector: PreparedRgbaDetector;
  signal: AbortSignal;
}): Promise<{ frames: number; verdict: FrameVerdict }> {
  const { input, signal } = options;
  if (
    !input.bytes.length ||
    input.bytes.length > 25_000_000 ||
    !Number.isSafeInteger(input.maximumFrames) ||
    input.maximumFrames < 1 ||
    input.maximumFrames > 1804
  )
    throw new Error('Invalid prepared media budget.');
  signal.throwIfAborted();
  const info = await inspectPreparedFrames(options),
    shape = contextShape(info.width, info.height);
  const { child, native } = decodedPair({ ...options, shape }),
    closed = completion(child);
  try {
    const result = await pairedScan({
      native,
      context: child.stdout,
      shape,
      detector: options.detector,
      expected: info.frames,
      signal,
    });
    if (!(await closed)) throw new Error('Incomplete media decoding.');
    signal.throwIfAborted();
    return result;
  } catch {
    child.kill('SIGKILL');
    child.stdout.destroy();
    native.destroy();
    await closed;
    throw new AccountError(503, 'Análise da mídia indisponível.');
  }
}
