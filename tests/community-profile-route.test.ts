import assert from 'node:assert/strict';
import { test } from 'node:test';
import { communityProfileAddress } from '../src/client/app/community-profile-route.ts';

await test('profiles opened from the isolated Communities page stay on it, except on phones', () => {
  const cases: [string, string, boolean, string | null][] = [
    ['/users/handle/karma', 'comunidades', false, '/communities?profile=karma'],
    [
      '/users/id/0f3c7a1e-2b4d-4c6e-8f10-123456789abc',
      'comunidades',
      false,
      '/communities?profile=0f3c7a1e-2b4d-4c6e-8f10-123456789abc',
    ],
    ['/users/handle/karma', 'comunidades', true, null],
    ['/users/handle/karma', 'conversas', false, null],
    ['/users/handle/karma', '', false, null],
    ['/communities?view=feed', 'comunidades', false, null],
  ];
  for (const [address, from, phone, expected] of cases)
    assert.equal(
      communityProfileAddress({ address, from, phone }),
      expected,
      `${address} from ${from || 'first load'}`,
    );
});
