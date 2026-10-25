import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
import {
  discussionCursor,
  discussionKey,
  discussionOrder,
  discussionPage,
  discussionPreview,
} from '../src/shared/community-discussion/index.ts';
await test('discussion cursors isolate parent, community and order and reject private or unbounded data', () => {
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

await test('preview projection is opt-in, bounded and binds one visible child to each returned parent', () => {
  const root = crypto.randomUUID();
  const parent: CommunityPost = {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: '',
    text: 'Synthetic comment',
    tags: [],
    createdAt: '2026-10-24T12:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: root,
    root,
    score: 0,
    replies: 2,
  };
  const child: CommunityPost = {
    ...parent,
    id: crypto.randomUUID(),
    parent: parent.id,
    replies: 0,
  };
  assert.equal(discussionPreview(undefined), undefined);
  assert.equal(discussionPreview('top'), 'top');
  for (const value of ['all', true, null, 1])
    assert.throws(() => discussionPreview(value), AccountError);
  assert.equal(
    Object.hasOwn(discussionPage({ items: [parent], next: null }), 'previews'),
    false,
  );
  assert.deepEqual(
    discussionPage({ items: [parent], previews: [child], next: null }).previews,
    [child],
  );
  for (const previews of [
    [child, child],
    [{ ...child, parent: crypto.randomUUID() }],
    [{ ...child, community: crypto.randomUUID() }],
    [{ ...child, root: crypto.randomUUID() }],
    [{ ...child, status: 'removed' }],
    Array.from({ length: 25 }, () => child),
  ])
    assert.throws(
      () => discussionPage({ items: [parent], previews, next: null }),
      AccountError,
    );
});
