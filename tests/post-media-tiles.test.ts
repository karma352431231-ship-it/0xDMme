import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  postMediaCount,
  withoutTileLinks,
} from '../src/client/communities/post-media-tiles.ts';

const gif = (name = 'gJsfMIu23Ssd3tvEr') =>
  `https://static.klipy.com/ii/d7aec6f6f171607374b2065c836f92f4/4f/98/${name}.mp4`;
const sticker = 'https://0xdmme.app/#sticker=ping/hi';
const photo = (kind: 'photo' | 'video') =>
  ({
    id: crypto.randomUUID(),
    review: crypto.randomUUID(),
    result: { kind },
  }) as never;

await test('a reply counts pictures, up to three GIFs and stickers as grid squares', () => {
  assert.deepEqual(postMediaCount({ text: 'hi', media: [] }), {
    count: 0,
    video: false,
  });
  assert.deepEqual(
    postMediaCount({
      text: `look\n${gif('a1')}\n${gif('b2')}\n${gif('c3')}\n${gif('d4')}\n${sticker}`,
      media: [photo('photo'), photo('photo')],
    }),
    { count: 6, video: false },
  );
  assert.equal(
    postMediaCount({ text: sticker, media: [photo('video')] }).video,
    true,
  );
});

await test('the words of a gridded reply drop only its GIF and sticker links', () => {
  assert.equal(
    withoutTileLinks(`hello https://example.com\n${gif()}\n${sticker}`).trim(),
    'hello https://example.com',
  );
});
