import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
await test('orçamentos explícitos de leitura não gastam os seis desafios nem ampliam as escritas limitadas', () => {
  const limit = new AccountRateLimit({ reads: 240 });
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

await test('leituras e escritas normais não têm teto por minuto nem esgotam desafios ou entradas de outros usuários', () => {
  const limit = new AccountRateLimit({ requests: null });
  try {
    for (let i = 0; i < 1000; i++) {
      limit.admit('shared-transport', false);
      limit.admit('shared-transport', false, true);
    }
    // Ordinary reads/writes must not fill buckets for protected operations.
    for (let i = 0; i < 300; i++) {
      limit.admit(`transport-${i}`, false);
      limit.admit(`transport-${i}`, false, true);
    }
    for (let i = 0; i < 6; i++) limit.admit('shared-transport', true);
    assert.throws(() => limit.admit('shared-transport', true), { status: 429 });
    assert.doesNotThrow(() => limit.admit('shared-transport', false));
    assert.doesNotThrow(() => limit.admit('shared-transport', false, true));
    assert.doesNotThrow(() => limit.admit('another-user', true));
  } finally {
    limit.close();
  }
});
