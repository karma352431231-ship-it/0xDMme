import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actorsPhrase,
  contentCards,
} from '../src/client/activity/content-cards.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { replyNotificationPage } from '../src/shared/community-posts/index.ts';
import { upvoteNoticePage } from '../src/shared/public-upvotes/index.ts';

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

const media = {
  id: '44444444-4444-4444-8444-444444444444',
  review: '55555555-5555-4555-8555-555555555555',
  result: {
    kind: 'photo' as const,
    type: 'image/jpeg',
    bytes: 3000,
    width: 640,
    height: 480,
    seconds: 0,
    fps: 0,
    thumbnailBytes: 900,
    normalized: true,
  },
};

await test('a card keeps the first thumbnail of its content, from upvotes or reply targets', () => {
  const withTarget = replyTo('r1', post, '2026-11-05T12:00:00Z');
  Object.assign(withTarget.target!, { thumbnail: media });
  const [card] = contentCards({
    upvotes: [upvote('u1', 'waterdrip', '2026-11-05T10:00:00Z')],
    replies: [withTarget],
    follows: [],
  });
  assert.deepEqual(card!.thumbnail, media);
  const [plain] = contentCards({
    upvotes: [upvote('u1', 'waterdrip', '2026-11-05T10:00:00Z')],
    replies: [],
    follows: [],
  });
  assert.equal(plain!.thumbnail, undefined);
});

await test('notice thumbnails are optional, checked public media and never on hidden content', () => {
  const notice = (preview: Record<string, unknown>, target?: unknown) => ({
    reply: community,
    post,
    community,
    createdAt: '2026-11-05T12:00:00.000Z',
    read: false,
    kind: 'reply',
    preview,
    ...(target ? { target } : {}),
  });
  const visible = {
    author: 'luna',
    text: 'Look',
    media: true,
    status: 'visible',
  };
  const page = replyNotificationPage({
    items: [
      notice(
        { ...visible, thumbnail: media },
        {
          id: reply,
          kind: 'post',
          text: 'Post',
          status: 'visible',
          thumbnail: media,
        },
      ),
    ],
    next: null,
  });
  assert.deepEqual(page.items[0]!.preview!.thumbnail, media);
  assert.deepEqual(page.items[0]!.target!.thumbnail, media);
  assert.equal(
    Object.hasOwn(
      replyNotificationPage({ items: [notice(visible)], next: null }).items[0]!
        .preview!,
      'thumbnail',
    ),
    false,
  );
  for (const invalid of [
    notice({
      author: null,
      text: '',
      media: false,
      status: 'removed',
      thumbnail: media,
    }),
    notice(visible, {
      id: reply,
      kind: 'post',
      text: '',
      status: 'deleted',
      thumbnail: media,
    }),
    notice({ ...visible, thumbnail: { ...media, id: 'not-an-id' } }),
  ])
    assert.throws(() =>
      replyNotificationPage({ items: [invalid], next: null }),
    );
  const upvoted = upvoteNoticePage({
    items: [
      {
        ...upvote(post, 'waterdrip', '2026-11-05T10:00:00.000Z'),
        actor: { id: reply, handle: 'waterdrip', avatar: null },
        thumbnail: media,
      },
    ],
    next: null,
  });
  assert.deepEqual(upvoted.items[0]!.thumbnail, media);
});
