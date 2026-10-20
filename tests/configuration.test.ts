import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPreparationProfile } from '../src/server/configuration/index.ts';

await test('preparation starts locally without credentials', () => {
  assert.equal(readPreparationProfile({}), 'development');
  assert.equal(
    readPreparationProfile({ HASH_TALK_PROFILE: 'development' }),
    'development',
  );
});

await test('invalid configuration neither announces success nor reveals received values', () => {
  for (const profile of ['production', 'test', '', 'private-value']) {
    assert.throws(
      () => readPreparationProfile({ HASH_TALK_PROFILE: profile }),
      { message: 'This setup only accepts the development profile.' },
    );
  }
});
