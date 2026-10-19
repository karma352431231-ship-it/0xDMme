import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptyRankingMetrics,
  newlyCreated,
  rankingScore,
  rankingDay,
} from '../src/shared/community-ranking/index.ts';
import {
  exploreCursor,
  exploreFilter,
  explorePage,
} from '../src/shared/community-discovery/index.ts';

const comparison = (before: number, now: number) => ({
  current: { ...emptyRankingMetrics(), participants: now, contributions: now },
  previous: {
    ...emptyRankingMetrics(),
    participants: before,
    contributions: before,
  },
  historyComplete: true,
});
await test('ranking uses only current-window gains and has diminishing volume returns', () => {
  const base = comparison(0, 110);
  assert.equal(rankingScore(base), rankingScore(comparison(10000, 110)));
  assert.ok(
    rankingScore(comparison(0, 20)) < rankingScore(comparison(0, 1100)),
  );
  assert.ok(
    rankingScore(comparison(0, 200)) < 2 * rankingScore(comparison(0, 100)),
  );
});
await test('histórico ausente não fabrica crescimento e seis sinais têm efeito limitado', () => {
  const base = comparison(0, 20);
  base.historyComplete = false;
  assert.equal(
    rankingScore(base),
    rankingScore({
      ...base,
      previous: { ...base.previous, participants: 1000, contributions: 1000 },
    }),
  );
  const score = rankingScore(base);
  for (const patch of [
    { conversations: 5 },
    { returning: 5 },
    { occupied: 12 },
    { authors: 5, originals: 5, authorSquares: 5 },
    { upvotes: 100, upvoteSignal: Math.log1p(100), votedPosts: 1 },
  ])
    assert.ok(
      rankingScore({ ...base, current: { ...base.current, ...patch } }) > score,
    );
  const concentrated = {
    ...base.current,
    authors: 3,
    originals: 30,
    authorSquares: 730,
  };
  assert.ok(
    rankingScore({
      ...base,
      current: { ...concentrated, authorSquares: 300 },
    }) > rankingScore({ ...base, current: concentrated }),
  );
});
await test('recém-criadas usa idade real, sete dias, tamanho e atividade sem excluir acesso', () => {
  const cutoff = Date.now(),
    input = {
      createdAt: cutoff - rankingDay,
      cutoff,
      followers: 500,
      participants: 3,
      archived: false,
    };
  assert.equal(newlyCreated(input), true);
  for (const patch of [
    { createdAt: null },
    { createdAt: cutoff - 7 * rankingDay },
    { createdAt: cutoff + 1 },
    { followers: 501 },
    { participants: 2 },
    { archived: true },
  ])
    assert.equal(newlyCreated({ ...input, ...patch }), false);
});
await test('ranking restringe períodos e vincula cursor à geração e classificação', () => {
  assert.deepEqual(exploreFilter({ order: 'activity', period: 'week' }), {
    order: 'trending',
    period: 'week',
  });
  assert.equal(
    exploreFilter({ order: 'trending', period: 'month' }).period,
    'month',
  );
  assert.throws(() => exploreFilter({ order: 'new', period: 'all' }));
  const data = {
    generation: crypto.randomUUID(),
    rank: 1,
    id: crypto.randomUUID(),
    filter: 'trending/day',
  };
  assert.deepEqual(exploreCursor(JSON.stringify(data), data.filter), data);
  assert.throws(() => exploreCursor(JSON.stringify(data), 'trending/week'));
  assert.throws(() => exploreCursor(JSON.stringify({ ...data, rank: 0.5 })));
  assert.throws(() => explorePage({ items: [], next: null }));
});
