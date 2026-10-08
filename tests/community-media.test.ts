import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  communityMediaSet,
  communityMediaSource,
  communityMediaResult,
  communityMediaPartBytes,
} from '../src/shared/community-media/index.ts';
import type { CommunityMediaSource } from '../src/shared/community-media/index.ts';
import { postContent } from '../src/shared/community-posts/index.ts';
import {
  CommunityMediaFiles,
  validateMediaSource,
  readMediaRuntime,
} from '../src/server/community-media/index.ts';
const source = (
  kind: CommunityMediaSource['kind'],
  bytes = 100,
): CommunityMediaSource => ({
  id: crypto.randomUUID(),
  kind,
  bytes,
  hash: 'a'.repeat(64),
});
await test('mídia pública: conjuntos por post/reply, bytes por arquivo e legenda opcional', () => {
  communityMediaSet(Array.from({ length: 4 }, () => source('photo')));
  communityMediaSet(Array.from({ length: 3 }, () => source('gif')));
  communityMediaSet([source('video')]);
  for (const set of [
    [source('photo'), source('gif')],
    Array.from({ length: 4 }, () => source('gif')),
    [source('video'), source('video')],
  ])
    assert.throws(() => communityMediaSet(set));
  for (const [kind, limit] of [
    ['photo', 3_000_000],
    ['gif', 10_000_000],
    ['video', 100_000_000],
  ] as const) {
    communityMediaSource(source(kind, limit));
    assert.throws(() => communityMediaSource(source(kind, limit + 1)));
  }
  const media = crypto.randomUUID();
  assert.equal(
    postContent({ title: '', text: '', tag: null, media: [media] }).text,
    '',
  );
  assert.throws(() =>
    postContent({ title: 'Título', text: '', tag: null, media: [] }),
  );
  assert.throws(() =>
    postContent({ title: '', text: '', tag: null, media: [media, media] }),
  );
});
await test('validação efetiva recusa duração excedida, animação disfarçada e resultado fora do contrato', () => {
  const shape = {
    codec: 'h264',
    format: 'mov,mp4,m4a,3gp,3g2,mj2',
    width: 1920,
    height: 1080,
    seconds: 60,
    fps: 60,
    frames: 3600,
    audio: true,
  };
  validateMediaSource(source('video'), shape);
  assert.throws(() =>
    validateMediaSource(source('video'), { ...shape, seconds: 60.01 }),
  );
  assert.throws(() =>
    validateMediaSource(source('video'), { ...shape, format: 'hls' }),
  );
  assert.throws(() => validateMediaSource(source('gif'), shape));
  assert.throws(() =>
    validateMediaSource(source('photo'), {
      ...shape,
      codec: 'png',
      seconds: 0,
      audio: false,
      frames: 2,
    }),
  );
  const result = {
    kind: 'video',
    type: 'video/mp4',
    bytes: 25_000_000,
    width: 1280,
    height: 720,
    seconds: 60,
    fps: 30,
    thumbnailBytes: 9000,
    normalized: true,
  };
  communityMediaResult(result);
  assert.throws(() => communityMediaResult({ ...result, bytes: 25_000_001 }));
  assert.throws(() => communityMediaResult({ ...result, fps: 31 }));
  assert.throws(() => readMediaRuntime({ HASH_TALK_MEDIA_FFMPEG: './ffmpeg' }));
});
await test('objetos de mídia: montagem limitada, hash integral, retomada e limpeza só da reserva', async () => {
  const root = await realpath(
      await mkdtemp(join(tmpdir(), '0xdmme-media-unit-')),
    ),
    files = new CommunityMediaFiles(root);
  try {
    await files.initialize();
    const bytes = Buffer.alloc(communityMediaPartBytes + 10, 42);
    const input = {
      ...source('photo', bytes.length),
      hash: createHash('sha256').update(bytes).digest('hex'),
    };
    await files.part(input.id, 0, bytes.subarray(0, communityMediaPartBytes));
    await assert.rejects(files.assemble(input));
    await files.part(input.id, 1, bytes.subarray(communityMediaPartBytes));
    const path = await files.assemble(input);
    assert.deepEqual(await readFile(path), bytes);
    await assert.rejects(files.assemble({ ...input, hash: 'b'.repeat(64) }));
    await files.assemble(input);
    await files.copySource(input.id);
    assert.equal(
      await files.digest(input.id, 'result', bytes.length),
      input.hash,
    );
    await assert.rejects(files.digest(input.id, 'result', bytes.length - 1));
    assert.deepEqual(
      await files.slice(input.id, {
        name: 'result',
        index: 1,
        bytes: bytes.length,
      }),
      bytes.subarray(communityMediaPartBytes),
    );
    await Promise.all([files.prune(input.id), files.prune(input.id)]);
    assert.deepEqual(await files.read(input.id, 'result', bytes.length), bytes);
    await Promise.all([files.discard(input.id), files.discard(input.id)]);
    await files.discard(input.id);
    await assert.rejects(files.read(input.id, 'result', bytes.length));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
