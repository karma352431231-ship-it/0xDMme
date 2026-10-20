import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GifSearch,
  gifMessageUrl,
  gifUrls,
  withoutGifLinks,
  parseGifPage,
} from '../src/client/gif-search/index.ts';
import { readWebConfiguration } from '../src/server/web-configuration/index.ts';

const host =
  'https://static.klipy.com/ii/c3a19a0b747a76e98651f2b9a3cca5ff/1b/6b';
function size(name: string, width = 220) {
  return { url: `${host}/${name}`, width, height: width, size: 1000 };
}
function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 5020600604924377,
    title: 'Good Night',
    type: 'gif',
    file: {
      sm: { webp: size('a.webp'), gif: size('a.gif'), mp4: size('a.mp4') },
      md: { mp4: size('b.mp4', 640) },
    },
    ...overrides,
  };
}
await test('rejecting the KLIPY notice blocks even search and third-party previews', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return Promise.resolve(Response.json({}));
  });
  const search = new GifSearch(
    () => Promise.resolve(false),
    () => new AbortController().signal,
  );
  await assert.rejects(
    search.page({ query: 'sintético', page: 1 }),
    /Allow external GIFs/u,
  );
  assert.equal(requests, 0);
});

await test('KLIPY page becomes a validated preview and clip; the rest is discarded', () => {
  const page = parseGifPage({
    result: true,
    data: {
      has_next: true,
      data: [
        item(),
        item({ type: 'clip' }),
        item({
          file: {
            sm: {
              webp: { ...size('x.webp'), url: 'https://evil.example/x.webp' },
            },
            md: { mp4: size('b.mp4', 640) },
          },
        }),
        'lixo',
      ],
    },
  });
  assert.equal(page.next, true);
  assert.deepEqual(page.items, [
    {
      id: '5020600604924377',
      title: 'Good Night',
      preview: `${host}/a.webp`,
      clip: `${host}/b.mp4`,
      width: 220,
      height: 220,
    },
  ]);
  assert.deepEqual(parseGifPage(null), { items: [], next: false });
});

await test('only a message with exactly one KLIPY media link becomes a GIF', () => {
  for (const [text, expected] of [
    [`${host}/b.mp4`, `${host}/b.mp4`],
    [`  ${host}/b.webp  `, `${host}/b.webp`],
    [`olha ${host}/b.mp4`, null],
    [`${host}/b.mp4?x=1`, null],
    ['https://static.klipy.com.evil.example/ii/a/b.mp4', null],
    ['http://static.klipy.com/ii/a/b.mp4', null],
    ['javascript:alert(1)', null],
  ] as const)
    assert.equal(gifMessageUrl(text), expected, text);
});

await test('KLIPY key is optional and validated in server configuration', () => {
  const base = {
    HASH_TALK_PREPARATION_PROFILE: 'local',
    HASH_TALK_DATABASE_URL:
      'postgresql://hash_talk_dev@127.0.0.1:45432/hash_talk_dev',
  };
  assert.equal(readWebConfiguration(base).gifSearchKey, undefined);
  const key = 'A'.repeat(64);
  assert.equal(
    readWebConfiguration({ ...base, HASH_TALK_KLIPY_API_KEY: key })
      .gifSearchKey,
    key,
  );
  assert.throws(
    () => readWebConfiguration({ ...base, HASH_TALK_KLIPY_API_KEY: 'curta/!' }),
    /KLIPY/u,
  );
});

await test('GIFs alongside text deduplicate and remove only displayed links', () => {
  const a = `${host}/a.mp4`,
    b = `${host}/b.gif`,
    c = `${host}/c.webp`,
    d = `${host}/d.gif`;
  const unknown = 'https://example.org/a.gif';
  const text = `Concordo!\n${a}\n${unknown}\n${a} ${b}, ${c} ${d}`;
  assert.deepEqual(gifUrls(text), [a, b, c]);
  assert.equal(withoutGifLinks(`Concordo!\n${a}`, [a]), 'Concordo!');
  const visible = withoutGifLinks(text, gifUrls(text));
  assert.ok(visible.includes(unknown));
  assert.ok(visible.includes(d));
  assert.ok(!visible.includes(a));
  assert.deepEqual(
    gifUrls(`${a}.evil https://static.klipy.com.evil/ii/x/a.gif`),
    [],
  );
  assert.deepEqual(gifUrls(unknown), []);
});
