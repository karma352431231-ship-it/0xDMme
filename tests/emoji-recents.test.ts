import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmojiRecents, emojiRecentKey } from '../src/client/emoji/recents.ts';

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
await test('recent emoji survive reopening on this device, deduplicate and keep most-recent order', () => {
  const device = storage();
  const first = new EmojiRecents(device);
  for (const emoji of ['😀', '👍🏽', '🇧🇷', '😀']) first.choose(emoji);
  const reopened = new EmojiRecents(device);
  assert.deepEqual(reopened.values(), ['😀', '🇧🇷', '👍🏽']);
  assert.equal(device.values.size, 1);
  assert.equal(device.values.has(emojiRecentKey), true);
  assert.deepEqual(JSON.parse(device.values.get(emojiRecentKey)!), [
    '😀',
    '🇧🇷',
    '👍🏽',
  ]);
  reopened.choose('❤️');
  first.choose('😂');
  assert.deepEqual(reopened.values(), ['😂', '❤️', '😀', '🇧🇷', '👍🏽']);
});
await test('history remains bounded and unavailable storage retains only in-memory recents', () => {
  const device = storage();
  const history = new EmojiRecents(device);
  for (let i = 0; i < 40; i++)
    history.choose(String.fromCodePoint(0x1f600 + i));
  assert.equal(new EmojiRecents(device).values().length, 32);
  const blocked = new EmojiRecents({
    getItem: () => null,
    setItem: () => {
      throw new Error('Unavailable');
    },
  });
  blocked.choose('😀');
  blocked.choose('👍');
  assert.equal(blocked.persistent, false);
  assert.deepEqual(blocked.values(), ['👍', '😀']);
  assert.deepEqual(new EmojiRecents(null).values(), []);
});
await test('corrupt or excessive local preference cannot populate the recent list', () => {
  for (const raw of [
    'invalid',
    '{}',
    JSON.stringify(['😀', 12]),
    JSON.stringify(Array.from({ length: 33 }, () => '😀')),
    'x'.repeat(8193),
  ]) {
    const device = storage();
    device.values.set(emojiRecentKey, raw);
    assert.deepEqual(new EmojiRecents(device).values(), []);
  }
});
