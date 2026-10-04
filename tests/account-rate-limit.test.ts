import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
await test('leituras limitadas não gastam os seis desafios nem ampliam o orçamento de escritas', () => {
  const limit = new AccountRateLimit();
  try {
    for (let i = 0; i < 240; i++) limit.admit('synthetic', false, true);
    assert.throws(() => limit.admit('synthetic', false, true), { status: 429 });
    for (let i = 0; i < 6; i++) limit.admit('synthetic', true);
    for (let i = 6; i < 60; i++) limit.admit('synthetic', false);
    assert.throws(() => limit.admit('synthetic', false), { status: 429 });
    assert.doesNotThrow(() => limit.admit('another-synthetic', false, true));
    for (let i = 0; i < 6; i++) limit.admit('challenge-synthetic', true);
    assert.throws(() => limit.admit('challenge-synthetic', true), {
      status: 429,
    });
  } finally {
    limit.close();
  }
});
