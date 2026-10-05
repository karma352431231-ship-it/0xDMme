import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  assertGroupQuota,
  groupCreationRetryAt,
  groupMediaQuota,
  groupTextQuota,
  groupQuota,
  groupContentQuota,
  groupControlMargin,
} from '../src/shared/group-quota/index.ts';
import { vaultQuota } from '../src/shared/vault/index.ts';

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

await test('cotas não deslocam mídia para espaço de texto e recusam o primeiro byte excedente', () => {
  assert.equal(vaultQuota, 1_000_000_000);
  assert.equal(groupQuota, 2_000_000_000);
  assert.equal(groupMediaQuota, 1_500_000_000);
  assert.equal(groupTextQuota, 500_000_000);
  assert.equal(groupControlMargin, 1_000_000);
  assert.equal(groupContentQuota, 499_000_000);
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
