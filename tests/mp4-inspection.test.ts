import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mp4StickerShape,
  prepareMp4Sticker,
} from '../src/shared/mp4-inspection/index.ts';
import { stickerFileFromBytes } from '../src/shared/public-stickers/index.ts';
import { stickerAttachment } from '../src/shared/stickers/index.ts';
import { clip, track } from './fixtures/mp4-clip.ts';

await test('a chat GIF clip becomes a video sticker without its metadata box, same length', () => {
  const raw = clip();
  assert.throws(() => mp4StickerShape(raw), /Invalid video sticker/u);
  const prepared = prepareMp4Sticker(raw);
  assert.equal(prepared.length, raw.length);
  assert.ok(!new TextDecoder().decode(prepared).includes('Lavf'));
  assert.deepEqual(mp4StickerShape(prepared), {
    width: 320,
    height: 240,
    seconds: 2,
  });
  const file = stickerFileFromBytes(raw, 'video/mp4');
  assert.equal(file.type, 'video/mp4');
  assert.deepEqual([file.width, file.height], [320, 240]);
});

await test('sound, other codecs, long or broken clips are refused', () => {
  for (const bad of [
    clip({ tracks: [track('vide', 'avc1'), track('soun', 'mp4a')] }),
    clip({ tracks: [track('vide', 'hvc1')] }),
    clip({ seconds: 11 }),
    clip({ tracks: [track('vide', 'avc1', 2048, 2048)] }),
    clip().subarray(0, 60),
  ])
    assert.throws(() => stickerFileFromBytes(new Uint8Array(bad), 'video/mp4'));
});

await test('a video sticker travels as a video attachment with its reserved name', () => {
  assert.equal(
    stickerAttachment({ name: 'sticker.mp4', type: 'video/mp4', image: false }),
    true,
  );
  for (const content of [
    { name: 'sticker.mp4', type: 'video/mp4', image: true },
    { name: 'clip.mp4', type: 'video/mp4', image: false },
    { name: 'sticker.mp4', type: 'video/quicktime', image: false },
  ])
    assert.equal(stickerAttachment(content), false);
});
