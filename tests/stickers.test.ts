import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  klipyStickerUrl,
  stickerLink,
  stickerReference,
  stickerReferences,
  withoutStickerLinks,
} from '../src/shared/stickers/index.ts';
import { parseStickerPage } from '../src/client/gif-search/index.ts';

const klipyPath = 'ffd4ac143e6335ac68951b787d3c1902/c7/e4/KBZgqwQL.webp';
const publicId = '0b9d2f7e-3c41-4a8e-9f10-2d4c6b8a1e37';

await test('a sticker is one exact link and unknown shapes stay text', () => {
  const ping = stickerLink('ping', 'wow');
  assert.deepEqual(stickerReference(` ${ping} `), {
    source: 'ping',
    id: 'wow',
    link: ping,
  });
  assert.equal(stickerReference(stickerLink('public', publicId))?.id, publicId);
  assert.equal(
    stickerReference(stickerLink('klipy', klipyPath))?.source,
    'klipy',
  );
  for (const text of [
    `${ping} hello`,
    'https://0xdmme.app/#sticker=ping/WOW',
    'https://0xdmme.app/#sticker=other/wow',
    'https://0xdmme.app/#sticker=public/not-a-uuid',
    'https://0xdmme.app/#sticker=klipy/../secret.webp',
    'https://0xdmme.app/#sticker=klipy/a/b.svg',
    'https://evil.example/#sticker=ping/wow',
  ])
    assert.equal(stickerReference(text), null, text);
  assert.throws(() => stickerLink('ping', 'Wow!'));
  assert.equal(
    klipyStickerUrl(klipyPath),
    `https://static.klipy.com/ii/${klipyPath}`,
  );
});

await test('post text draws at most three distinct stickers and keeps the rest of the text', () => {
  const links = ['hi', 'love', 'lol', 'wow'].map((id) =>
    stickerLink('ping', id),
  );
  const text = `Look!\n${links[0]}\n${links[0]}, ${links[1]}\n${links[2]} ${links[3]}`;
  const found = stickerReferences(text);
  assert.deepEqual(
    found.map((sticker) => sticker.id),
    ['hi', 'love', 'lol'],
  );
  assert.equal(
    withoutStickerLinks(text, found),
    `Look!\n\n, \n ${links[3]}`.replace(/\n{3,}/gu, '\n\n').trim(),
  );
  assert.equal(withoutStickerLinks(text, []), text);
});

await test('KLIPY sticker pages keep only stickers hosted on KLIPY', () => {
  const file = (name: string) => ({
    url: `https://static.klipy.com/ii/${name}`,
    width: 90,
    height: 82,
  });
  const page = parseStickerPage({
    data: {
      has_next: true,
      data: [
        {
          id: 1,
          title: 'Good night',
          type: 'sticker',
          file: {
            xs: { webp: file('a/x.webp') },
            md: { webp: file('a/m.webp') },
          },
        },
        { id: 2, type: 'gif', file: { xs: { webp: file('b/x.webp') } } },
        {
          id: 3,
          type: 'sticker',
          file: {
            xs: {
              webp: { url: 'https://cdn.example/x.webp', width: 1, height: 1 },
            },
            md: { webp: file('c/m.webp') },
          },
        },
      ],
    },
  });
  assert.equal(page.next, true);
  assert.deepEqual(
    page.items.map((item) => [item.id, item.path]),
    [['1', 'a/m.webp']],
  );
});
