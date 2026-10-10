import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gifMessageUrl, parseGifPage } from '../src/client/gif-search/index.ts';
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

await test('página do KLIPY vira prévia e clipe validados; o resto é descartado', () => {
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

await test('só uma mensagem com exatamente um link de mídia do KLIPY vira GIF', () => {
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

await test('chave do KLIPY é opcional e validada na configuração do servidor', () => {
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
