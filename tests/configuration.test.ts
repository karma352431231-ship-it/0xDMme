import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPreparationProfile } from '../src/server/configuration/index.ts';

await test('a preparação inicia localmente sem credenciais', () => {
  assert.equal(readPreparationProfile({}), 'development');
  assert.equal(
    readPreparationProfile({ HASH_TALK_PROFILE: 'development' }),
    'development',
  );
});

await test('configuração inválida não anuncia sucesso nem revela valores recebidos', () => {
  for (const profile of ['production', 'test', '', 'private-value']) {
    assert.throws(
      () => readPreparationProfile({ HASH_TALK_PROFILE: profile }),
      { message: 'Esta base aceita somente o perfil development.' },
    );
  }
});
