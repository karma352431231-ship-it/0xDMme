import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  klipyStickerUrl,
  stickerAttachment,
  stickerLink,
  stickerReference,
  stickerReferences,
  withoutStickerLinks,
} from '../src/shared/stickers/index.ts';
import { parseStickerPage } from '../src/client/gif-search/index.ts';
import { readFile } from 'node:fs/promises';
import {
  StickerLibrary,
  personalStickerLimit,
} from '../src/client/sticker-library/index.ts';
import type { StickerLibrarySync } from '../src/client/sticker-library/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';
import type { VaultChange } from '../src/shared/vault/index.ts';
import { stickerFileFromBytes } from '../src/shared/public-stickers/index.ts';

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

/** An in-memory vault with the same head rules as VaultSync. */
function memoryVault(): StickerLibrarySync & { values: Map<string, string> } {
  const entries: VaultEntry[] = [];
  const values = new Map<string, string>();
  const live = () => {
    const superseded = new Set(entries.flatMap((e) => e.change.parents));
    return entries.filter((e) => !superseded.has(e.commit.id));
  };
  return {
    values,
    complete: true,
    refresh: () => Promise.resolve(),
    heads: (entity: string) =>
      live().filter((entry) => entry.change.entity === entity),
    currentHeads() {
      const heads = new Map<string, VaultEntry[]>();
      for (const entry of live())
        heads.set(entry.change.entity, [
          ...(heads.get(entry.change.entity) ?? []),
          entry,
        ]);
      return heads;
    },
    openMany: (ids: readonly string[]) => {
      assert.ok(ids.length <= 16, 'one vault read opens at most 16 blocks');
      return Promise.resolve(ids.map((id) => values.get(id)!));
    },
    save(input: { change: VaultChange; value: string }) {
      const id = crypto.randomUUID();
      entries.push({
        change: input.change,
        commit: { id, sequence: entries.length + 1 } as VaultEntry['commit'],
      });
      values.set(id, input.value);
      return Promise.resolve();
    },
  };
}

await test('personal stickers are encrypted vault records listed newest first', async () => {
  const png = new Uint8Array(
    await readFile(new URL('../src/client/app/icon-192.png', import.meta.url)),
  );
  const file = stickerFileFromBytes(png, 'image/png');
  const vault = memoryVault(),
    library = new StickerLibrary(vault);
  const first = await library.add(file),
    second = await library.add(file);
  assert.deepEqual(await library.ids(), [second, first]);
  const opened = await library.open([first]);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0]!.file.bytes, png);
  assert.ok(
    [...vault.values.values()].every((value) => !value.includes('removed')),
  );

  // Deleting writes a removal version; the list drops it without opening it.
  await library.remove(first);
  assert.deepEqual(await library.ids(), [second]);
  assert.deepEqual(await library.open([first]), []);
});

await test('the personal library has a limit and a sticker file has a reserved name', async () => {
  const png = new Uint8Array(
    await readFile(new URL('../src/client/app/icon-192.png', import.meta.url)),
  );
  const file = stickerFileFromBytes(png, 'image/png');
  const library = new StickerLibrary(memoryVault());
  for (let index = 0; index < personalStickerLimit; index++)
    await library.add(file);
  await assert.rejects(library.add(file), /Sticker limit reached/u);
  assert.equal(
    stickerAttachment({ name: 'sticker.png', type: 'image/png', image: true }),
    true,
  );
  for (const content of [
    { name: 'photo.png', type: 'image/png', image: true },
    { name: 'sticker.png', type: 'image/gif', image: true },
    { name: 'sticker.png', type: 'image/png', image: false },
  ])
    assert.equal(stickerAttachment(content), false);
});
