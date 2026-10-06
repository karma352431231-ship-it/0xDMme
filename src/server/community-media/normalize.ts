import { resolve } from 'node:path';
import { AccountError, object } from '../../shared/account/index.ts';
import {
  imageShape,
  metadataFree,
} from '../../shared/image-inspection/index.ts';
import {
  communityMediaLimits,
  communityMediaResult,
} from '../../shared/community-media/index.ts';
import type {
  CommunityMediaSource,
  CommunityMediaResult,
} from '../../shared/community-media/index.ts';
import { CommunityMediaFiles } from './files.ts';
import { mediaProcess, verifyMediaBudget } from './process.ts';
import type { MediaRuntime } from './process.ts';

export interface MediaShape {
  codec: string;
  format: string;
  width: number;
  height: number;
  seconds: number;
  fps: number;
  frames: number;
  audio: boolean;
}
function number(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw new AccountError(422, 'Metadados de mídia inválidos.');
  return n;
}
export function readMediaShape(value: unknown): MediaShape {
  const data = object(value),
    format = object(data['format']);
  if (!Array.isArray(data['streams']) || data['streams'].length > 8)
    throw new AccountError(422, 'Streams inválidos.');
  const streams = data['streams'].map(object),
    videos = streams.filter((s) => s['codec_type'] === 'video');
  if (videos.length !== 1)
    throw new AccountError(422, 'Use um único vídeo ou imagem.');
  const video = videos[0]!;
  const rate = String(video['avg_frame_rate']).split('/');
  const denominator = number(rate[1]);
  return {
    codec: String(video['codec_name']),
    format: String(format['format_name']),
    width: number(video['width']),
    height: number(video['height']),
    seconds: number(format['duration'] ?? video['duration'] ?? 0),
    fps: denominator ? number(rate[0]) / denominator : 0,
    frames: number(video['nb_read_frames'] ?? video['nb_frames'] ?? 0),
    audio: streams.some((s) => s['codec_type'] === 'audio'),
  };
}
export function validateMediaSource(
  source: CommunityMediaSource,
  shape: MediaShape,
): void {
  if (!shape.width || !shape.height || !shape.frames)
    throw new AccountError(422, 'Mídia vazia ou incompleta.');
  if (source.kind === 'photo') {
    validatePhoto(shape);
    return;
  }
  validateAnimation(source, shape);
}
function validateAnimation(
  source: CommunityMediaSource,
  shape: MediaShape,
): void {
  if (source.kind === 'gif' && shape.codec !== 'gif')
    throw new AccountError(422, 'Use um arquivo GIF.');
  if (source.kind === 'video') validateVideoFormat(shape);
  if (
    !shape.seconds ||
    shape.seconds > communityMediaLimits[source.kind].seconds
  )
    throw new AccountError(
      422,
      source.kind === 'gif'
        ? 'GIF deve ter até 20 segundos.'
        : 'Vídeo deve ter até 60 segundos.',
    );
}
function validateVideoFormat(shape: MediaShape): void {
  if (
    !shape.format
      .split(',')
      .some((f) => ['mov', 'mp4', 'matroska', 'webm'].includes(f))
  )
    throw new AccountError(422, 'Use vídeo MP4, MOV ou WebM.');
}
function validatePhoto(shape: MediaShape): void {
  if (
    !['png', 'mjpeg', 'webp'].includes(shape.codec) ||
    shape.frames !== 1 ||
    shape.audio ||
    Math.max(shape.width, shape.height) > 2048
  )
    throw new AccountError(
      422,
      'Use uma foto preparada PNG, JPEG ou WebP de até 2.048 px.',
    );
}
async function probe(
  runtime: MediaRuntime,
  path: string,
  signal: AbortSignal,
): Promise<MediaShape> {
  const output = await mediaProcess(runtime, {
    binary: 'ffprobe',
    signal,
    maximumBytes: 100_000_000,
    args: [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-format_whitelist',
      'mov,matroska,webm,gif,png_pipe,jpeg_pipe,webp_pipe',
      '-threads',
      '4',
      '-count_frames',
      '-show_entries',
      'format=format_name,duration:stream=codec_name,codec_type,width,height,duration,avg_frame_rate,nb_read_frames,nb_frames',
      '-of',
      'json',
      path,
    ],
  });
  return readMediaShape(JSON.parse(output) as unknown);
}
export class CommunityMediaNormalizer {
  private readonly runtime: MediaRuntime | null;
  private readonly files: CommunityMediaFiles;
  constructor(runtime: MediaRuntime | null, files: CommunityMediaFiles) {
    this.runtime = runtime;
    this.files = files;
  }
  available(): boolean {
    return this.runtime !== null;
  }
  async initialize(): Promise<void> {
    await verifyMediaBudget(this.runtime);
  }
  async prepare(
    source: CommunityMediaSource,
    stop: AbortSignal,
  ): Promise<CommunityMediaResult> {
    if (!this.runtime)
      throw new AccountError(503, 'Processador de mídia não configurado.');
    const signal = AbortSignal.any([stop, AbortSignal.timeout(360_000)]),
      path = await this.files.assemble(source);
    const input = await probe(this.runtime, path, signal);
    validateMediaSource(source, input);
    await this.files.resetOutput(source.id);
    const directory = await this.files.directory(source.id);
    const base = [
      '-hide_banner',
      '-nostdin',
      '-v',
      'error',
      '-xerror',
      '-err_detect',
      'explode',
      '-n',
      '-filter_threads',
      '4',
      '-filter_complex_threads',
      '4',
      '-max_alloc',
      '268435456',
      '-protocol_whitelist',
      'file,pipe',
      '-format_whitelist',
      'mov,matroska,webm,gif,png_pipe,jpeg_pipe,webp_pipe',
      '-threads',
      '4',
      '-i',
      path,
    ];
    const photoType = await this.prepareMain({
      source,
      input,
      base,
      directory,
      signal,
    });
    await this.run(
      [
        ...base,
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        'scale=144:144:force_original_aspect_ratio=decrease',
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-threads',
        '1',
        '-map_metadata',
        '-1',
        '-f',
        'image2',
        resolve(directory, 'thumbnail'),
      ],
      signal,
      96_000,
    );
    const output =
      source.kind === 'photo'
        ? input
        : await probe(this.runtime, resolve(directory, 'result'), signal);
    this.validateOutput(source, input, output);
    const bytes = await this.files.outputSize(
        source.id,
        'result',
        communityMediaLimits[source.kind].result,
      ),
      thumbnailBytes = await this.files.outputSize(
        source.id,
        'thumbnail',
        96_000,
      );
    return communityMediaResult({
      kind: source.kind,
      type: photoType ?? (source.kind === 'gif' ? 'image/gif' : 'video/mp4'),
      bytes,
      width: output.width,
      height: output.height,
      seconds: source.kind === 'photo' ? 0 : output.seconds,
      fps: source.kind === 'photo' ? 0 : output.fps,
      thumbnailBytes,
      normalized: source.kind !== 'photo',
    });
  }
  private async prepareMain(request: {
    source: CommunityMediaSource;
    input: MediaShape;
    base: string[];
    directory: string;
    signal: AbortSignal;
  }): Promise<string | null> {
    const { source, base, directory, signal } = request;
    if (source.kind === 'photo') {
      const bytes = await this.files.read(source.id, 'source', 3_000_000),
        shape = imageShape(bytes, 4_194_304);
      if (!metadataFree(bytes, shape.type))
        throw new AccountError(
          422,
          'Prepare a foto para remover seus metadados.',
        );
      await this.run(
        [...base, '-map', '0:v:0', '-an', '-f', 'null', '-'],
        signal,
        3_000_000,
      );
      await this.files.copySource(source.id);
      return shape.type;
    }
    if (source.kind === 'gif') {
      await this.run(
        [
          ...base,
          '-filter_complex',
          '[0:v]fps=20,split[a][b];[a]palettegen=stats_mode=single:reserve_transparent=1[p];[b][p]paletteuse=new=1:dither=none',
          '-an',
          '-map_metadata',
          '-1',
          '-loop',
          '0',
          '-f',
          'gif',
          resolve(directory, 'result'),
        ],
        signal,
        10_000_000,
      );
      return null;
    }
    const scale =
      "scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h='if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2";
    await this.run(
      [
        ...base,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        `fps=30,${scale}`,
        '-c:v',
        'libx264',
        '-threads',
        '4',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-maxrate',
        '2800k',
        '-bufsize',
        '5600k',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        resolve(directory, 'result'),
      ],
      signal,
      25_000_000,
    );
    return null;
  }
  private validateOutput(
    source: CommunityMediaSource,
    input: MediaShape,
    output: MediaShape,
  ): void {
    if (source.kind === 'photo') return;
    if (Math.abs(output.seconds - input.seconds) > 0.1)
      throw new AccountError(422, 'A preparação alterou a duração.');
    if (
      source.kind === 'video' &&
      (output.audio !== input.audio ||
        Math.max(output.width, output.height) > 1280 ||
        Math.min(output.width, output.height) > 720)
    )
      throw new AccountError(422, 'Resultado de vídeo inválido.');
  }
  private async run(
    args: string[],
    signal: AbortSignal,
    maximumBytes: number,
  ): Promise<void> {
    if (!this.runtime) throw new AccountError(503, 'Processador indisponível.');
    await mediaProcess(this.runtime, {
      binary: 'ffmpeg',
      args: [
        ...args.slice(0, -1),
        '-fs',
        String(maximumBytes + 1),
        args.at(-1)!,
      ],
      signal,
      maximumBytes,
    });
  }
}
