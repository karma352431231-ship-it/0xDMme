import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  upvoteNoticePage,
  upvoterPage,
} from '../src/shared/public-upvotes/index.ts';
import { replyNotificationPage } from '../src/shared/community-posts/index.ts';
const id = '11111111-1111-4111-a111-111111111111';
const actor = { id, handle: 'voter', avatar: null };
const item = {
  id,
  actor,
  community: id,
  post: id,
  kind: 'post' as const,
  text: 'Current content',
  createdAt: new Date().toISOString(),
  read: false,
};
await test('public upvote boundaries reject private fields, foreign photos and oversized pages', () => {
  assert.deepEqual(upvoteNoticePage({ items: [item], next: null }).items, [
    item,
  ]);
  for (const invalid of [
    { ...item, actor: { ...actor, wallet: 'private' } },
    { ...item, text: 'x'.repeat(281) },
    {
      ...item,
      actor: { ...actor, avatar: 'https://remote.invalid/photo.png' },
    },
    { ...item, kind: 'downvote' },
  ])
    assert.throws(() => upvoteNoticePage({ items: [invalid], next: null }));
  assert.throws(() =>
    upvoteNoticePage({
      items: Array.from({ length: 25 }, () => item),
      next: null,
    }),
  );
  assert.throws(() =>
    upvoterPage({ items: [{ ...actor, position: -1 }], next: null }),
  );
});
await test('publication preview exposes only matching visible public author identity', () => {
  const notice = {
    reply: id,
    post: id,
    community: id,
    createdAt: item.createdAt,
    read: false,
    preview: {
      author: 'voter',
      identity: actor,
      text: 'Current reply',
      media: false,
      status: 'visible',
    },
  };
  assert.deepEqual(
    replyNotificationPage({ items: [notice], next: null }).items[0]?.preview
      ?.identity,
    actor,
  );
  for (const preview of [
    { ...notice.preview, status: 'removed', author: null, text: '' },
    { ...notice.preview, identity: { ...actor, handle: 'different' } },
  ])
    assert.throws(() =>
      replyNotificationPage({ items: [{ ...notice, preview }], next: null }),
    );
});
