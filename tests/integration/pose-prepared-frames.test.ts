import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { classifyPreparedFrames } from '../../src/server/public-moderation/index.ts';
import type { PreparedRgbaDetector } from '../../src/server/public-moderation/index.ts';
import { readMediaRuntime } from '../../src/server/community-media/index.ts';

await test('RGBA original e contextual: todos os frames, alpha, geometria e detalhe anterior à redução', async (t) => {
  const runtime = readMediaRuntime(process.env);
  if (!runtime) {
    t.skip('Configure FFmpeg/ffprobe para fixtures sintéticas.');
    return;
  }
  const root = await mkdtemp(join(tmpdir(), '0xdmme-paired-frames-')),
    run = promisify(execFile);
  t.after(() => rm(root, { recursive: true, force: true }));
  const photo = join(root, 'pixel.png'),
    thin = join(root, 'thin.png'),
    video = join(root, 'frames.mp4');
  await run(runtime.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=white:s=1024x1024,format=rgba',
    '-vf',
    'drawbox=x=777:y=333:w=1:h=1:color=0xfefefe:t=fill',
    '-frames:v',
    '1',
    '-threads',
    '4',
    photo,
  ]);
  await run(runtime.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=white@0.0:s=1024x5,format=rgba',
    '-frames:v',
    '1',
    '-threads',
    '4',
    thin,
  ]);
  await run(runtime.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=64x32:r=12:d=1',
    '-vf',
    "drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='eq(n,7)',drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='eq(n,11)'",
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
  ]);
  const model = {
    hash: 'b'.repeat(64),
    runtime: 'synthetic-native-pair-contract',
  };
  const signal = AbortSignal.timeout(30_000);
  const photoDetector: PreparedRgbaDetector = {
    model,
    classifyPrepared: (frames, shape) => {
      assert.equal(frames.length, 1);
      assert.deepEqual(shape.native, { width: 1024, height: 1024 });
      assert.deepEqual(shape.context, {
        width: 512,
        height: 512,
        left: 0,
        top: 0,
      });
      assert.equal(frames[0]!.native[(333 * 1024 + 777) * 4], 254);
      assert.equal(frames[0]!.native[0], 255);
      assert.ok(frames[0]!.context.every((value) => value === 255));
      return Promise.resolve(['hold']);
    },
  };
  assert.deepEqual(
    await classifyPreparedFrames({
      runtime,
      signal,
      detector: photoDetector,
      input: {
        bytes: await readFile(photo),
        type: 'image/png',
        maximumFrames: 1,
      },
    }),
    { frames: 1, verdict: 'hold' },
  );
  const transparent: PreparedRgbaDetector = {
    model,
    classifyPrepared: (frames, shape) => {
      assert.deepEqual(shape.native, { width: 1024, height: 5 });
      assert.deepEqual(shape.context, {
        width: 512,
        height: 2,
        left: 0,
        top: 255,
      });
      const pixels = frames[0]!.native;
      for (let offset = 3; offset < pixels.length; offset += 4)
        assert.equal(pixels[offset], 0);
      return Promise.resolve(['allow']);
    },
  };
  await classifyPreparedFrames({
    runtime,
    signal,
    detector: transparent,
    input: { bytes: await readFile(thin), type: 'image/png', maximumFrames: 1 },
  });
  let count = 0,
    hold = 0,
    reject = 0,
    largest = 0;
  const temporal: PreparedRgbaDetector = {
    model,
    classifyPrepared: (frames, shape) => {
      largest = Math.max(largest, frames.length);
      assert.deepEqual(shape.native, { width: 64, height: 32 });
      return Promise.resolve(
        frames.map((frame) => {
          count++;
          const offset = (16 * 64 + 32) * 4,
            red = frame.native[offset]!,
            green = frame.native[offset + 1]!,
            blue = frame.native[offset + 2]!;
          if (blue > red && blue > green) {
            hold++;
            return 'hold' as const;
          }
          if (green > red && green > blue) {
            reject++;
            return 'reject' as const;
          }
          return 'allow' as const;
        }),
      );
    },
  };
  const input = {
    bytes: await readFile(video),
    type: 'video/mp4' as const,
    maximumFrames: 12,
  };
  assert.deepEqual(
    await classifyPreparedFrames({
      runtime,
      signal,
      detector: temporal,
      input,
    }),
    { frames: 12, verdict: 'reject' },
  );
  assert.deepEqual(
    { count, hold, reject, largest },
    { count: 12, hold: 1, reject: 1, largest: 2 },
  );
  await assert.rejects(
    classifyPreparedFrames({
      runtime,
      signal,
      input,
      detector: { model, classifyPrepared: () => Promise.resolve([]) },
    }),
    /Análise/u,
  );
  const abort = new AbortController();
  await assert.rejects(
    classifyPreparedFrames({
      runtime,
      signal: abort.signal,
      input,
      detector: {
        model,
        classifyPrepared: () => {
          abort.abort();
          return Promise.resolve(['allow', 'allow']);
        },
      },
    }),
    /Análise/u,
  );
});
