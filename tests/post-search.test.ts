import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  postSearchQuery,
  postSearchWords,
  postSearchMatches,
} from '../src/shared/post-search/index.ts';
import {
  feedFilter,
  discoveryKey,
} from '../src/shared/community-discovery/index.ts';

await test('post searches normalize case and spacing, preserve public language and reject unbounded or hidden controls', () => {
  assert.equal(postSearchQuery('  PeDrA   azul '), 'pedra azul');
  assert.equal(postSearchQuery('石头'), '石头');
  assert.equal(postSearchQuery('Ｐｅｄｒａ'), 'pedra');
  assert.deepEqual(postSearchWords('pedra pedra azul'), ['pedra', 'azul']);
  for (const value of ['x'.repeat(101), 'pedra\u0000', {}, '***'])
    assert.throws(() => postSearchQuery(value));
  assert.equal(postSearchQuery(null), '');
});

await test('emphasis preserves original text and Unicode offsets and selects whole query words without regex interpretation', () => {
  const text =
    '🪨 PEDRA, pedra azul; pedraria. Ｐｅｄｒａ <script>pedra</script>';
  const spans = postSearchMatches(text, 'pedra azul');
  assert.deepEqual(
    spans.map(({ start, end }) => text.slice(start, end)),
    ['PEDRA', 'pedra', 'azul', 'Ｐｅｄｒａ', 'pedra'],
  );
  assert.deepEqual(postSearchMatches('a+b (stone)', 'a+b'), [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ]);
  assert.deepEqual(postSearchMatches(text, ''), []);
});

await test('search is an optional feed filter and different queries cannot share pagination identity', () => {
  const base = {
    scope: 'all',
    order: 'mixed',
    period: 'all',
    community: null,
    tag: null,
  };
  assert.deepEqual(feedFilter({ ...base, search: '' }), base);
  const first = feedFilter({ ...base, search: 'Pedra' });
  assert.equal(first.search, 'pedra');
  assert.notEqual(
    discoveryKey(first),
    discoveryKey(feedFilter({ ...base, search: 'river' })),
  );
});
