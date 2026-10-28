import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devicesCurrent } from '../src/client/social-dm/index.ts';
import type { SocialDirectoryPage } from '../src/client/social-dm/authority.ts';

function directory(
  devices: string[] | null,
  active: string[] | null,
): SocialDirectoryPage {
  return {
    profile: 'profile',
    device: null,
    active,
    events: devices
      ? [{ devices: devices.map((id) => ({ id })) } as never]
      : [],
  };
}

await test('a new public profile without published DM devices must publish them', () => {
  assert.equal(devicesCurrent(directory(null, [])), false);
});

await test('DM devices are current only while every listed device is active', () => {
  assert.equal(devicesCurrent(directory(['a', 'b'], ['a', 'b', 'c'])), true);
  assert.equal(devicesCurrent(directory(['a', 'old'], ['a'])), false);
  assert.equal(devicesCurrent(directory(['a'], null)), false);
});
