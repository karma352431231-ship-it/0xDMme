import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  assertGroupQuota,
  groupCreationRetryAt,
  groupCreationTier,
  groupMediaQuota,
  groupTextQuota,
} from '../src/shared/group-quota/index.ts';

await test('tiers usam unidades inteiras nos limites e conservam o excesso de grupos após queda do saldo', () => {
  for (const decimals of [0, 6, 9, 18]) {
    const unit = 10n ** BigInt(decimals);
    for (const [tokens, limit] of [
      [0n, 0],
      [10_000n, 2],
      [50_000n, 10],
      [100_000n, null],
    ] as const) {
      const exact = groupCreationTier({
        balance: tokens * unit,
        decimals,
        existingGroups: 0,
      });
      assert.equal(exact.limit, limit);
      assert.equal(exact.canCreate, tokens > 0n);
    }
    for (const [tokens, limit] of [
      [10_000n, 0],
      [50_000n, 2],
      [100_000n, 10],
    ] as const)
      assert.equal(
        groupCreationTier({
          balance: tokens * unit - 1n,
          decimals,
          existingGroups: 0,
        }).limit,
        limit,
      );
    assert.deepEqual(
      groupCreationTier({
        balance: 20_000n * unit,
        decimals,
        existingGroups: 10,
      }),
      { limit: 2, available: 0, canCreate: false },
    );
    assert.deepEqual(
      groupCreationTier({
        balance: 100_000n * unit,
        decimals,
        existingGroups: 100,
      }),
      { limit: null, available: null, canCreate: true },
    );
    assert.equal(
      groupCreationTier({
        balance: 10_000n * unit,
        decimals,
        existingGroups: 2,
      }).canCreate,
      false,
    );
  }
});

await test('frequência respeita as duas janelas, inclusive as bordas exatas', () => {
  const now = 4_000_000;
  assert.equal(groupCreationRetryAt({ now: 0, createdAt: [] }), 0);
  assert.equal(
    groupCreationRetryAt({ now, createdAt: [now - 59_999] }),
    now + 1,
  );
  assert.equal(groupCreationRetryAt({ now, createdAt: [now - 60_000] }), now);
  const full = Array.from({ length: 10 }, (_, i) => now - 600_000 + i * 60_000);
  assert.equal(groupCreationRetryAt({ now, createdAt: full }), now + 3_000_000);
  assert.equal(
    groupCreationRetryAt({ now: now + 3_000_000, createdAt: full }),
    now + 3_000_000,
  );
  assert.equal(
    groupCreationRetryAt({ now, createdAt: [now - 3_600_000] }),
    now,
  );
  for (const input of [
    { now: NaN, createdAt: [] },
    { now, createdAt: [now + 1] },
    { now, createdAt: [-1] },
    { now, createdAt: [now - 0.5] },
    { now, createdAt: Array.from({ length: 11 }, () => now) },
  ])
    assert.throws(() => groupCreationRetryAt(input), AccountError);
});

await test('evidência incompleta/inválida nunca concede tier; cotas não deslocam mídia para espaço de texto', () => {
  const valid = { balance: 100_000n, decimals: 0, existingGroups: 0 };
  for (const input of [
    { ...valid, balance: -1n },
    { ...valid, decimals: 256 },
    { ...valid, decimals: -1 },
    { ...valid, decimals: 1.5 },
    { ...valid, decimals: NaN },
    { ...valid, existingGroups: -1 },
    { ...valid, existingGroups: 0.5 },
    { ...valid, existingGroups: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() => groupCreationTier(input), AccountError);
  assert.doesNotThrow(() => assertGroupQuota({ mediaBytes: 0, textBytes: 0 }));
  assert.doesNotThrow(() =>
    assertGroupQuota({
      mediaBytes: groupMediaQuota,
      textBytes: groupTextQuota,
    }),
  );
  for (const input of [
    { mediaBytes: groupMediaQuota + 1, textBytes: 0 },
    { mediaBytes: 0, textBytes: groupTextQuota + 1 },
    { mediaBytes: -1, textBytes: 0 },
    { mediaBytes: 0, textBytes: NaN },
    { mediaBytes: 0.5, textBytes: 0 },
  ])
    assert.throws(() => assertGroupQuota(input), AccountError);
});
