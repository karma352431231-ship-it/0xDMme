import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  discussionCursor,
  discussionKey,
  discussionOrder,
  discussionPage,
} from '../src/shared/community-discussion/index.ts';
await test('cursores de discussão isolam pai/comunidade/ordem e recusam dados privados ou ilimitados', () => {
  const community = crypto.randomUUID(),
    parent = crypto.randomUUID(),
    time = new Date().toISOString();
  const key = discussionKey(community, parent, 'discussed');
  const cursor = {
    key,
    anchor: time,
    activity: 15,
    score: -1,
    time,
    id: crypto.randomUUID(),
  };
  assert.deepEqual(discussionCursor(JSON.stringify(cursor), key), cursor);
  for (const other of [
    discussionKey(community, parent, 'votes'),
    discussionKey(community, crypto.randomUUID(), 'discussed'),
    discussionKey(crypto.randomUUID(), parent, 'discussed'),
  ])
    assert.throws(
      () => discussionCursor(JSON.stringify(cursor), other),
      AccountError,
    );
  for (const patch of [
    { activity: -1 },
    { activity: 1.5 },
    { score: Infinity },
    { wallet: 'private' },
    { anchor: 'invalid' },
  ])
    assert.throws(
      () => discussionCursor(JSON.stringify({ ...cursor, ...patch }), key),
      AccountError,
    );
  assert.throws(() => discussionCursor('x'.repeat(701)), AccountError);
  assert.throws(() => discussionOrder('engagement-with-wallet'), AccountError);
  assert.throws(
    () =>
      discussionPage({
        items: Array.from({ length: 25 }, () => null),
        next: null,
      }),
    AccountError,
  );
  assert.throws(
    () => discussionPage({ items: [], next: null, profiles: [] }),
    AccountError,
  );
});
