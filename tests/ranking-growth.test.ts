import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountRankingScore,
  emptyReceivedEngagement,
  rankingPeriod,
} from '../src/shared/community-ranking/index.ts';
import { accountRankingPage } from '../src/shared/account-ranking/index.ts';

await test('accounts receive gains without age, followers or previous-window bonuses', () => {
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
        views: 10,
        comments: 2,
        upvotes: 3,
        shares: 1,
        historyComplete: false,
      },
    ],
  };
  assert.equal(accountRankingPage(page).items[0]!.views, 10);
  assert.throws(() =>
    accountRankingPage({
      ...page,
      items: [{ ...page.items[0], wallet: 'private' }],
    }),
  );
});
