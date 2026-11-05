import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actorsPhrase,
  contentCards,
} from '../src/client/activity/content-cards.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';

const post = '11111111-1111-4111-a111-111111111111',
  reply = '22222222-2222-4222-a222-222222222222',
  community = '33333333-3333-4333-a333-333333333333';
const profile = (handle: string) => ({ id: handle, handle, avatar: null });
const upvote = (id: string, handle: string, at: string) => ({
  id,
  actor: profile(handle),
  community,
  post,
  kind: 'post' as const,
  text: 'Bitcoin ETF flows',
  createdAt: at,
  read: false,
});
const replyTo = (id: string, target: string | null, at: string) => ({
  reply: id,
  post,
  community,
  createdAt: at,
  read: false,
  kind: 'reply' as const,
  preview: {
    author: 'luna',
    text: 'Inflows were huge',
    media: false,
    status: 'visible' as const,
  },
  ...(target
    ? {
        target: {
          id: target,
          kind: 'post' as const,
          text: 'Bitcoin ETF flows',
          status: 'visible' as const,
        },
      }
    : {}),
});

await test('upvotes and replies to the same content share one card, newest activity first', () => {
  const cards = contentCards({
    upvotes: [
      upvote('u1', 'waterdrip', '2026-11-05T10:00:00Z'),
      upvote('u2', 'kira', '2026-11-05T09:00:00Z'),
      {
        ...upvote('u3', 'mo', '2026-11-05T11:00:00Z'),
        post: reply,
        kind: 'reply',
      },
    ],
    replies: [
      replyTo('r1', post, '2026-11-05T12:00:00Z'),
      // A followed profile's reply elsewhere is not the reader's content.
      replyTo('r2', null, '2026-11-05T08:00:00Z'),
    ],
    follows: [
      {
        id: 'f1',
        actor: profile('zed'),
        createdAt: '2026-11-05T07:00:00Z',
        read: true,
      },
    ],
  });
  assert.deepEqual(
    cards.map((card) => [card.kind, card.target]),
    [
      ['post', post],
      ['reply', reply],
      ['watched', 'r2'],
      ['profile', ''],
    ],
  );
  const first = cards[0]!;
  // Each arrival keeps its own read receipt inside the shared card.
  assert.deepEqual(
    first.upvotes.map((item) => item.id),
    ['u1', 'u2'],
  );
  assert.deepEqual(
    first.replies.map((item) => item.reply),
    ['r1'],
  );
  assert.equal(first.latest, '2026-11-05T12:00:00Z');
  assert.equal(first.headline, 'Bitcoin ETF flows');
});

await test('a removed target says why instead of showing old text', () => {
  const removed = replyTo('r1', post, '2026-11-05T12:00:00Z');
  removed.target!.status = 'removed' as 'visible';
  removed.target!.text = '';
  const [card] = contentCards({ upvotes: [], replies: [removed], follows: [] });
  assert.match(card!.headline, /moderation/u);
});

await test('actor phrases name up to two handles and count the rest in both languages', () => {
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const one = actorsPhrase(['a'], 'upvoted'),
      two = actorsPhrase(['a', 'b'], 'upvoted'),
      many = actorsPhrase(['a', 'b', 'c', 'd', 'e'], 'followed');
    assert.ok(one.includes('@a') && !one.includes('@b'));
    assert.ok(two.includes('@a') && two.includes('@b'));
    assert.ok(
      many.includes('@b') && many.includes('3') && !many.includes('@c'),
    );
    assert.notEqual(
      actorsPhrase(['a'], 'upvoted'),
      actorsPhrase(['a'], 'followed'),
    );
  }
  setActiveLanguage('en');
});
