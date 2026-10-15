import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  upvoteNoticePage,
  upvoterPage,
} from '../src/shared/public-upvotes/index.ts';
import {
  groupUpvoteNotices,
  upvoteTitle,
} from '../src/client/activity/upvotes.ts';
import { replyNotificationPage } from '../src/shared/community-posts/index.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
const id = '11111111-1111-4111-a111-111111111111',
  second = '22222222-2222-4222-a222-222222222222';
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
await test('upvote groups preserve every arrival and distinguish post/reply in both languages', () => {
  const items = [
    item,
    { ...item, id: second },
    { ...item, id: second, post: second, kind: 'reply' as const },
  ];
  const groups = groupUpvoteNotices(items);
  assert.deepEqual(
    groups.map((group) => group.length),
    [2, 1],
  );
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const title = upvoteTitle(groups[0]!);
    assert.ok(title.includes('@voter'));
    assert.ok(title.includes('1'));
    assert.notEqual(
      upvoteTitle([item]),
      upvoteTitle([{ ...item, kind: 'reply' }]),
    );
  }
  setActiveLanguage('en');
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
