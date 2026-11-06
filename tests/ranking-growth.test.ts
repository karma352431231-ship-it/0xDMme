import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountRankingScore,
  emptyReceivedEngagement,
  rankingPeriod,
} from '../src/shared/community-ranking/index.ts';
import { accountRankingPage } from '../src/shared/account-ranking/index.ts';

await test('accounts receive gains without age or previous-window bonuses; new followers count a little below commenters', () => {
  const base = emptyReceivedEngagement();
  assert.equal(accountRankingScore(base), 0);
  for (const patch of [
    { commenters: 1 },
    { conversations: 1 },
    { viewSignal: 1 },
    { shareSignal: 1 },
    { upvoteSignal: 1 },
  ])
    assert.ok(accountRankingScore({ ...base, ...patch }) > 0);
  assert.equal(
    accountRankingScore({ ...base, viewSignal: 16 }),
    accountRankingScore({ ...base, viewSignal: 1000000 }),
  );
  assert.ok(
    accountRankingScore({ ...base, shareSignal: 1 }) >
      accountRankingScore({ ...base, viewSignal: 1 }),
  );
  assert.ok(
    accountRankingScore({ ...base, commenters: 200 }) <
      2 * accountRankingScore({ ...base, commenters: 100 }),
  );
  const follower = accountRankingScore({ ...base, newFollowers: 1 });
  assert.ok(follower > 0);
  assert.ok(follower < accountRankingScore({ ...base, commenters: 1 }));
  assert.equal(accountRankingScore({ ...base, newFollowers: 0 }), 0);
});
await test('account ranking admits three bounded windows and rejects identity leaks', () => {
  for (const period of ['day', 'week', 'month'])
    assert.equal(rankingPeriod(period), period);
  assert.throws(() => rankingPeriod('all'));
  const page = {
    generation: crypto.randomUUID(),
    cutoff: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    next: null,
    items: [
      {
        profile: { id: crypto.randomUUID(), handle: 'example', avatar: null },
        description: 'Public bio',
        followers: 4,
        score: 2,
        previousScore: 1,
        views: 10,
        comments: 2,
        upvotes: 3,
        shares: 1,
      },
    ],
  };
  assert.equal(accountRankingPage(page).items[0]!.views, 10);
  // Growth tag inputs are optional and checked when present.
  assert.equal(
    Object.hasOwn(accountRankingPage(page).items[0]!, 'growth'),
    false,
  );
  const tagged = {
    ...page,
    items: [
      {
        ...page.items[0],
        growth: { newFollowers: 2, createdAt: new Date().toISOString() },
      },
    ],
  };
  assert.equal(accountRankingPage(tagged).items[0]!.growth!.newFollowers, 2);
  for (const growth of [
    { newFollowers: -1, createdAt: null },
    { newFollowers: 1, createdAt: 'yesterday' },
    { newFollowers: 1, createdAt: null, wallet: 'private' },
  ])
    assert.throws(() =>
      accountRankingPage({ ...page, items: [{ ...page.items[0], growth }] }),
    );
  assert.throws(() =>
    accountRankingPage({
      ...page,
      items: [{ ...page.items[0], wallet: 'private' }],
    }),
  );
});
