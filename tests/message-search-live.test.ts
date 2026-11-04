import { latestConversationMatches } from '../src/client/messages/search-results.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  messageSearchExcerpt,
  messageSearchMatches,
} from '../src/client/message-search/index.ts';
await test('substring highlights preserve Unicode and excerpts include a match beyond the initial preview', () => {
  assert.deepEqual(
    messageSearchMatches('Teste ＴＥＳＴＥ 👩‍💻 testando', 'tes'),
    [
      { start: 0, end: 3 },
      { start: 6, end: 9 },
      { start: 18, end: 21 },
    ],
  );
  const text = 'earlier text '.repeat(40) + 'Unique match at the end';
  const excerpt = messageSearchExcerpt(text, 'unique');
  assert.ok(excerpt.includes('Unique'));
  assert.equal(excerpt.length <= 160, true);
});

await test('search retains only the most recent matching message per contact across out-of-order pages and older indexes', () => {
  assert.deepEqual(
    latestConversationMatches([
      { id: 'new', peer: 'alice', sequence: 10, sentAt: 100 },
      { id: 'old', peer: 'alice', sequence: 3, sentAt: 30 },
      { id: 'unknown-old', peer: 'bob', sequence: 1 },
      { id: 'unknown-new', peer: 'bob', sequence: 5 },
    ]).map((row) => row.id),
    ['new', 'unknown-new'],
  );
});
