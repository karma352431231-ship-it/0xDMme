import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  archiveStart,
  archiveToken,
  searchPosition,
} from '../src/client/messages/search-cursor.ts';

await test('search pages move from recent history to the first archive page without an empty cursor', () => {
  assert.deepEqual(searchPosition(null), { archived: false, after: null });
  assert.deepEqual(searchPosition('server-page'), {
    archived: false,
    after: 'server-page',
  });
  assert.deepEqual(searchPosition(archiveStart), {
    archived: true,
    after: null,
  });
  const next = archiveToken('[17,"id"]');
  assert.deepEqual(searchPosition(next), {
    archived: true,
    after: '[17,"id"]',
  });
  assert.equal(archiveToken(null), null);
});
