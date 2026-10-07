import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { classifyPreparedFrames } from '../../src/server/public-moderation/index.ts';
import type { PublicFrameDetector } from '../../src/server/public-moderation/index.ts';
import { readMediaRuntime } from '../../src/server/community-media/index.ts';

await test('análise temporal real: 60 s/720p/30 FPS e três GIFs de 20 s, incluindo ocorrência de um frame no meio e fim', async (t) => {
  const runtime = readMediaRuntime(process.env);
  if (!runtime) {
    t.skip(
      'Configure FFmpeg/ffprobe para decodificar arquivos sintéticos reais.',
    );
    return;
  }
  const root = await mkdtemp(join(tmpdir(), '0xdmme-moderation-frames-')),
    run = promisify(execFile),
    video = join(root, 'video.mp4'),
    gif = join(root, 'animation.gif'),
    photo = join(root, 'photo.png');
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = ['-v', 'error', '-f', 'lavfi', '-threads', '4'];
  await run(
    runtime.ffmpeg,
    [
      ...base,
      '-i',
      'color=c=red:s=1280x720:r=30:d=60',
      '-vf',
      "drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='eq(n,900)',drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='eq(n,1799)'",
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-threads',
      '4',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      video,
    ],
    { timeout: 120_000 },
  );
  await run(
    runtime.ffmpeg,
    [...base, '-i', 'color=c=red:s=64x64:r=20:d=20', '-threads', '4', gif],
    { timeout: 30_000 },
  );
  await run(
    runtime.ffmpeg,
    [
      ...base,
      '-i',
      'color=c=red:s=64x64',
      '-frames:v',
      '1',
      '-threads',
      '4',
      photo,
    ],
    { timeout: 30_000 },
  );
  let seen = 0,
    holds = 0,
    rejects = 0,
    largestBatch = 0;
  const detector: PublicFrameDetector = {
    model: { hash: 'b'.repeat(64), runtime: 'synthetic-temporal-contract' },
    size: 32,
    classify(frames, signal) {
      signal.throwIfAborted();
      largestBatch = Math.max(largestBatch, frames.length);
      return Promise.resolve(
        frames.map((frame) => {
          seen++;
          const offset = (16 * 32 + 16) * 3,
            red = frame[offset]!,
            green = frame[offset + 1]!,
            blue = frame[offset + 2]!;
          if (blue > red && blue > green) {
            rejects++;
            return 'reject' as const;
          }
          if (green > red && green > blue) {
            holds++;
            return 'hold' as const;
          }
          return 'allow' as const;
        }),
      );
    },
  };
  const signal = AbortSignal.timeout(120_000),
    start = performance.now(),
    clip = await classifyPreparedFrames({
      runtime,
      detector,
      signal,
      input: {
        bytes: await readFile(video),
        type: 'video/mp4',
        maximumFrames: 1803,
      },
    });
  assert.deepEqual(clip, { frames: 1800, verdict: 'reject' });
  const animation = await readFile(gif),
    image = await readFile(photo);
  for (let i = 0; i < 3; i++)
    assert.deepEqual(
      await classifyPreparedFrames({
        runtime,
        detector,
        signal,
        input: { bytes: animation, type: 'image/gif', maximumFrames: 400 },
      }),
      { frames: 400, verdict: 'allow' },
    );
  // Four photos and all eight thumbnails are inspected, in addition to the sequences.
  for (let i = 0; i < 12; i++)
    assert.deepEqual(
      await classifyPreparedFrames({
        runtime,
        detector,
        signal,
        input: { bytes: image, type: 'image/png', maximumFrames: 1 },
      }),
      { frames: 1, verdict: 'allow' },
    );
  assert.equal(seen, 3012);
  assert.equal(holds, 1);
  assert.equal(rejects, 1);
  assert.equal(largestBatch, 4);
  t.diagnostic(
    `3012 frames, lotes de até 4, ${(performance.now() - start).toFixed(1)} ms; detector sintético de cores, sem comprovação de precisão sexual.`,
  );
  await t.test(
    'falha, resposta parcial e aborto não concluem a análise',
    async () => {
      const input = {
        bytes: image,
        type: 'image/png' as const,
        maximumFrames: 1,
      };
      await assert.rejects(
        classifyPreparedFrames({
          runtime,
          input,
          signal,
          detector: { ...detector, classify: () => Promise.resolve([]) },
        }),
        /Análise/u,
      );
      const stop = new AbortController();
      await assert.rejects(
        classifyPreparedFrames({
          runtime,
          input,
          signal: stop.signal,
          detector: {
            ...detector,
            classify: () => {
              stop.abort();
              return Promise.resolve(['allow']);
            },
          },
        }),
        /Análise/u,
      );
      await assert.rejects(
        classifyPreparedFrames({
          runtime,
          detector,
          signal,
          input: { ...input, bytes: new Uint8Array([1, 2, 3]) },
        }),
        /Inspeção/u,
      );
    },
  );
});
