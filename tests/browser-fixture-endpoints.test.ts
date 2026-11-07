import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserFixtureEndpoints } from './fixtures/browser-fixture-endpoints.ts';

await test('paired browser fixtures preserve supplied synthetic signers across restart', () => {
  const environment = {
    HASH_TALK_FIXTURE_HOST: '127.0.0.1',
    HASH_TALK_FIXTURE_PORT: '45115',
    HASH_TALK_FIXTURE_PAIR_PORT: '45116',
    HASH_TALK_FIXTURE_SYNTHETIC_SEED: `0x${'11'.repeat(32)}`,
    HASH_TALK_FIXTURE_PAIR_SYNTHETIC_SEED: `0x${'22'.repeat(32)}`,
  };
  const first = browserFixtureEndpoints(environment);
  assert.deepEqual(browserFixtureEndpoints(environment), first);
  assert.equal(first.paired?.host, 'localhost');
  assert.notEqual(first.primary.host, first.paired?.host);
  assert.notEqual(first.primary.seed, first.paired?.seed);
});

await test('browser fixture endpoint validation rejects remote hosts and shared cookie scope', () => {
  for (const value of [
    '0xdmme.app',
    '127.0.0.1.evil.test',
    'localhost.evil.test',
    '0xdmme-flow-xyz.localhost',
  ])
    assert.throws(() =>
      browserFixtureEndpoints({ HASH_TALK_FIXTURE_HOST: value }),
    );
  assert.throws(() =>
    browserFixtureEndpoints({
      HASH_TALK_FIXTURE_PAIR_PORT: '45112',
      HASH_TALK_FIXTURE_PAIR_HOST: '127.0.0.1',
    }),
  );
  assert.throws(() =>
    browserFixtureEndpoints({
      HASH_TALK_FIXTURE_PAIR_PORT: '45111',
    }),
  );
});

await test('browser fixtures reject invalid primary or paired identity before returning configuration', () => {
  assert.throws(() =>
    browserFixtureEndpoints({ HASH_TALK_FIXTURE_SYNTHETIC_SEED: 'invalid' }),
  );
  assert.throws(() =>
    browserFixtureEndpoints({
      HASH_TALK_FIXTURE_PAIR_PORT: '45112',
      HASH_TALK_FIXTURE_PAIR_SYNTHETIC_SEED: 'invalid',
    }),
  );
  for (const value of ['45110', '45120', '45115.5', 'not-a-port'])
    assert.throws(() =>
      browserFixtureEndpoints({ HASH_TALK_FIXTURE_PORT: value }),
    );
});
