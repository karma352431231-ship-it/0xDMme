import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localGroupEligibility } from '../src/server/groups/index.ts';

await test('saldo sintético só é admitido por habilitação explícita em desenvolvimento e banco exclusivo', () => {
  const local = {
    profile: 'development' as const,
    databaseUrl: 'postgresql://127.0.0.1/hash_talk_test',
  };
  assert.equal(localGroupEligibility(local, false), null);
  assert.equal(localGroupEligibility(local, true)?.mode, 'fixture');
  assert.throws(() =>
    localGroupEligibility({ ...local, profile: 'staging' }, true),
  );
  assert.throws(() =>
    localGroupEligibility(
      { ...local, databaseUrl: 'postgresql://127.0.0.1/hash_talk_stage' },
      true,
    ),
  );
});
