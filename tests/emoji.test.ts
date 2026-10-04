import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { frontendEmoji, emojiAsset } from '../src/tools/frontend-emoji.ts';
import { EmojiCatalog, insertEmoji } from '../src/client/emoji/index.ts';
import { validReaction } from '../src/shared/daily/index.ts';

const packed = await frontendEmoji(process.cwd());
const catalog = new EmojiCatalog(packed.catalog);
const defaults = {
  query: '',
  category: 'all',
  tone: 'all',
  offset: 0,
  recent: [],
};

await test('catálogo completo mantém variantes Unicode válidas e arte com proveniência fixada', () => {
  assert.equal(catalog.rows.length, 3963);
  for (const row of catalog.rows) assert.ok(validReaction(row[0]), row[0]);
  for (const emoji of [
    '👍🏽',
    '👩‍💻',
    '👩🏿‍❤️‍👩🏻',
    '🇧🇷',
    '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    '1️⃣',
  ])
    assert.ok(catalog.find(emoji)?.[4], emoji);
  assert.ok(catalog.find('🫪')?.[4]);
  assert.equal(catalog.rows.filter((row) => !row[4]).length, 19);
  assert.ok(packed.content.length <= 2 * 1024 * 1024);
  assert.equal(emojiAsset, 'emoji-d7a2c1166a29ac85.json.gz');
  const data = JSON.parse(gunzipSync(packed.content).toString()) as {
    svg: Record<string, string>;
    licenses: Record<string, string>;
    emojiTest: string;
  };
  assert.equal(Object.keys(data.svg).length, 4009);
  assert.match(
    data.licenses['graphics'] ?? '',
    /Creative Commons Attribution 4.0/u,
  );
  assert.match(data.licenses['unicode'] ?? '', /UNICODE LICENSE V3/u);
  assert.match(data.emojiTest, /Version: 18.0/u);
});
await test('busca em português ignora acentos e filtra categorias sem perder bandeiras/tons mistos', () => {
  assert.ok(
    catalog
      .search({ ...defaults, query: 'coracao' })
      .entries.some((row) => row[0] === '❤️'),
  );
  assert.deepEqual(
    catalog.search({ ...defaults, query: 'coração' }),
    catalog.search({ ...defaults, query: 'coracao' }),
  );
  assert.ok(
    catalog
      .search({ ...defaults, query: 'brasil', category: '8' })
      .entries.some((row) => row[0] === '🇧🇷'),
  );
  assert.ok(
    catalog.search({ ...defaults, query: 'gato', category: '2' }).total > 0,
  );
  assert.equal(
    catalog.search({ ...defaults, query: 'gato', category: '8' }).total,
    0,
  );
  assert.ok(
    catalog
      .search({ ...defaults, query: '👍', tone: '🏽' })
      .entries.some((row) => row[0] === '👍🏽'),
  );
  assert.ok(
    catalog
      .search({ ...defaults, query: '👍', tone: 'none' })
      .entries.every((row) => !/[\u{1F3FB}-\u{1F3FF}]/u.test(row[0])),
  );
  assert.equal(catalog.find('👩🏿‍❤️‍👩🏻')?.[3], 1);
  assert.ok(
    catalog
      .search({ ...defaults, query: 'brasil', tone: '🏽' })
      .entries.some((row) => row[0] === '🇧🇷'),
  );
  assert.equal(
    catalog.search({ ...defaults, query: 'texto que não existe no catálogo' })
      .total,
    0,
  );
});
await test('paginação limita DOM e recentes respeitam ordem/limite da sessão', () => {
  const first = catalog.search(defaults),
    second = catalog.search({ ...defaults, offset: 72 });
  assert.equal(first.entries.length, 72);
  assert.equal(first.total, 3963);
  assert.ok(!first.entries.some((row) => second.entries.includes(row)));
  const recent = ['🇧🇷', '👍🏿', '❤️'];
  assert.deepEqual(
    catalog
      .search({ ...defaults, category: 'recent', recent })
      .entries.map((row) => row[0]),
    recent,
  );
  assert.equal(catalog.search({ ...defaults, category: 'recent' }).total, 0);
  assert.equal(
    catalog.search({ ...defaults, category: 'recent', recent: ['🫩‍🫩'] })
      .entries[0]?.[0],
    '🫩‍🫩',
  );
  assert.equal(
    catalog.search({
      ...defaults,
      category: 'recent',
      recent: catalog.rows.slice(0, 40).map((row) => row[0]),
    }).total,
    32,
  );
});
await test('inserção conserva Unicode, seleção e texto adjacente sem trocar símbolos compostos', () => {
  const text = 'antes 😃 depois';
  const result = insertEmoji(text, 6, 8, '👩🏽‍💻');
  assert.equal(result.text, 'antes 👩🏽‍💻 depois');
  assert.equal(result.caret, 'antes 👩🏽‍💻'.length);
  const atEnd = insertEmoji('❤️', 2, 2, '🇧🇷');
  assert.equal(atEnd.text, '❤️🇧🇷');
  assert.equal(atEnd.caret, 6);
});
