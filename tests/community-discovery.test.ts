import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  discoveryKey,
  discoveryWindow,
  exploreFilter,
  feedFilter,
  feedPage,
  postPreference,
  rankCursor,
} from '../src/shared/community-discovery/index.ts';
const filter = () => ({
  scope: 'all',
  order: 'recent',
  period: 'all',
  community: null,
  tag: null,
});
await test('descoberta valida filtros explícitos e não aceita campos de identidades privadas', () => {
  assert.deepEqual(feedFilter(filter()), filter());
  for (const patch of [
    { scope: 'person' },
    { order: 'wallet' },
    { period: 'year' },
    { tag: crypto.randomUUID() },
    { accountId: crypto.randomUUID() },
  ])
    assert.throws(() => feedFilter({ ...filter(), ...patch }), AccountError);
  assert.throws(
    () => exploreFilter({ order: 'votes', period: 'week' }),
    AccountError,
  );
});
await test('cursor associa filtros, limites e desempate; placares negativos são válidos', () => {
  const key = discoveryKey(feedFilter(filter())),
    time = new Date().toISOString(),
    cursor = {
      filter: key,
      anchor: time,
      rank: -1,
      time,
      id: crypto.randomUUID(),
    };
  assert.deepEqual(rankCursor(JSON.stringify(cursor), key), cursor);
  for (const value of [JSON.stringify(cursor), '{}', 'x'.repeat(501)])
    assert.throws(
      () =>
        rankCursor(
          value,
          discoveryKey(feedFilter({ ...filter(), order: 'votes' })),
        ),
      AccountError,
    );
  assert.throws(
    () => rankCursor(JSON.stringify({ ...cursor, rank: 1.5 })),
    AccountError,
  );
});
await test('períodos ancorados têm 24h/7d/30d sem depender de fuso ou horário de verão', () => {
  const anchor = '2026-10-06T12:00:00.000Z';
  assert.equal(discoveryWindow('day', anchor), '2026-10-05T12:00:00.000Z');
  assert.equal(discoveryWindow('week', anchor), '2026-09-29T12:00:00.000Z');
  assert.equal(discoveryWindow('month', anchor), '2026-09-06T12:00:00.000Z');
  assert.equal(discoveryWindow('all', anchor), null);
});
await test('respostas e preferências não expõem estado de outras contas nem aceitam vazamento de campos', () => {
  assert.deepEqual(
    postPreference({ saved: true, hidden: false, revision: 1 }),
    { saved: true, hidden: false, revision: 1 },
  );
  assert.throws(
    () =>
      postPreference({
        saved: true,
        hidden: false,
        revision: 1,
        profile: crypto.randomUUID(),
      }),
    AccountError,
  );
  assert.throws(
    () => feedPage({ items: [], next: null, saved: [] }),
    AccountError,
  );
  assert.throws(
    () =>
      feedPage({ items: Array.from({ length: 25 }, () => null), next: null }),
    AccountError,
  );
});
