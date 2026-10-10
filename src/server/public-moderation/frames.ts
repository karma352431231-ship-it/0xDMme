import type { Readable } from 'node:stream';
import { AccountError, object } from '../../shared/account/index.ts';
import type { MediaRuntime } from '../community-media/index.ts';
import {
  pipeProcess,
  completion,
  frameDemuxers as demuxers,
} from './frame-process.ts';
import { classifyPreparedRgbaFrames } from './prepared-frames.ts';
import type {
  FrameVerdict,
  PreparedFrameInput,
  PublicFrameDetector,
  ResizedFrameDetector,
} from './frame-contract.ts';
export type {
  FrameVerdict,
  PreparedFrameInput,
  PublicFrameDetector,
} from './frame-contract.ts';

function decoder(
  runtime: MediaRuntime,
  input: PreparedFrameInput,
  size: number,
  signal: AbortSignal,
) {
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
    demuxers[input.type],
    '-f',
    demuxers[input.type],
    '-i',
    'pipe:0',
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-vf',
    `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2`,
    '-fps_mode',
    'passthrough',
    '-pix_fmt',
    'rgb24',
    '-threads',
    '4',
    '-f',
    'rawvideo',
    'pipe:1',
  ];
  return pipeProcess(runtime, input, { binary: 'ffmpeg', args, signal });
}
async function expectedFrames(
  runtime: MediaRuntime,
  input: PreparedFrameInput,
  signal: AbortSignal,
): Promise<number> {
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
        demuxers[input.type],
        '-f',
        demuxers[input.type],
        '-i',
        'pipe:0',
        '-count_frames',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=nb_read_frames',
        '-of',
        'json',
      ],
    }),
    closed = completion(child);
  let output = '',
    size = 0;
  try {
    for await (const value of child.stdout) {
      if (!(value instanceof Uint8Array))
        throw new Error('Metadados inválidos.');
      size += value.length;
      if (size > 4096) throw new Error('Metadados excedidos.');
      output += Buffer.from(value).toString('utf8');
    }
    if (!(await closed)) throw new Error('Inspeção incompleta.');
    signal.throwIfAborted();
    return readFrameCount(output, input.maximumFrames);
  } catch {
    child.kill('SIGKILL');
    await closed;
    throw new AccountError(503, 'Inspeção da mídia indisponível.');
  }
}
function readFrameCount(output: string, maximum: number): number {
  const data = object(JSON.parse(output)),
    streams = data['streams'];
  if (!Array.isArray(streams) || streams.length !== 1)
    throw new Error('Sequência inválida.');
  const frames = Number(object(streams[0])['nb_read_frames']);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > maximum)
    throw new Error('Sequência excedida ou vazia.');
  return frames;
}
function merge(current: FrameVerdict, next: FrameVerdict): FrameVerdict {
  if (current === 'reject' || next === 'reject') return 'reject';
  return current === 'hold' || next === 'hold' ? 'hold' : 'allow';
}
export async function classifyPreparedFrames(options: {
  runtime: MediaRuntime;
  input: PreparedFrameInput;
  detector: PublicFrameDetector;
  signal: AbortSignal;
}): Promise<{ frames: number; verdict: FrameVerdict }> {
  const { runtime, input, detector, signal } = options;
  if ('classifyPrepared' in detector)
    return classifyPreparedRgbaFrames({ ...options, detector });
  requireFrameInput(input, detector.size);
  signal.throwIfAborted();
  const expected = await expectedFrames(runtime, input, signal);
  const child = decoder(runtime, input, detector.size, signal),
    closed = completion(child);
  try {
    const result = await scanFrames(child.stdout, {
      detector,
      signal,
      expected,
    });
    if (!(await closed)) throw new Error('Decodificação incompleta.');
    signal.throwIfAborted();
    return result;
  } catch {
    child.kill('SIGKILL');
    await closed;
    throw new AccountError(503, 'Análise da mídia indisponível.');
  }
}
async function scanFrames(
  output: Readable,
  options: {
    detector: ResizedFrameDetector;
    signal: AbortSignal;
    expected: number;
  },
): Promise<{ frames: number; verdict: FrameVerdict }> {
  const { detector, signal, expected } = options;
  const frameBytes = detector.size * detector.size * 3;
  let frame = new Uint8Array(frameBytes),
    offset = 0,
    count = 0,
    verdict: FrameVerdict = 'allow';
  const batch: Uint8Array[] = [];
  async function evaluate(): Promise<void> {
    if (!batch.length) return;
    signal.throwIfAborted();
    const results = await detector.classify(batch, signal);
    signal.throwIfAborted();
    if (
      results.length !== batch.length ||
      results.some((v) => !['allow', 'hold', 'reject'].includes(v))
    )
      throw new Error('Cobertura da análise incompleta.');
    for (const result of results) verdict = merge(verdict, result);
    batch.length = 0;
  }
  for await (const value of output) {
    if (!(value instanceof Uint8Array)) throw new Error('Frame inválido.');
    let cursor = 0;
    while (cursor < value.length) {
      const length = Math.min(frameBytes - offset, value.length - cursor);
      frame.set(value.subarray(cursor, cursor + length), offset);
      offset += length;
      cursor += length;
      if (offset !== frameBytes) continue;
      count++;
      if (count > expected) throw new Error('Sequência de mídia excedida.');
      batch.push(frame);
      frame = new Uint8Array(frameBytes);
      offset = 0;
      if (batch.length === 4) await evaluate();
    }
  }
  await evaluate();
  if (offset !== 0 || count !== expected)
    throw new Error('Decodificação incompleta.');
  signal.throwIfAborted();
  return { frames: count, verdict };
}
function requireFrameInput(input: PreparedFrameInput, size: number): void {
  if (!Number.isSafeInteger(size) || size < 32 || size > 512)
    throw new Error('Dimensão da análise inválida.');
  if (!input.bytes.length || input.bytes.length > 25_000_000)
    throw new Error('Mídia preparada inválida.');
  if (
    !Number.isSafeInteger(input.maximumFrames) ||
    input.maximumFrames < 1 ||
    input.maximumFrames > 1804
  )
    throw new Error('Cobertura da análise inválida.');
}
