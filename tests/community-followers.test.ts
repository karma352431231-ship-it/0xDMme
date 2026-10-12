import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  communityFollowers,
  communityFollowerTab,
} from '../src/shared/community-followers/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
await test('lista de seguidores limita página e aceita apenas identidades públicas e abas conhecidas', () => {
  const profile = { id: crypto.randomUUID(), handle: 'pessoa', avatar: null },
    page = { items: [profile], total: 1, next: null };
  assert.deepEqual(communityFollowers(page), page);
  for (const invalid of [
    { ...page, total: 0 },
    { ...page, items: [profile, profile], total: 2 },
    { ...page, items: [{ ...profile, wallet: 'privada' }] },
    { ...page, items: Array.from({ length: 25 }, () => profile), total: 25 },
  ])
    assert.throws(() => communityFollowers(invalid), AccountError);
  assert.equal(communityFollowerTab('known'), 'known');
  assert.throws(() => communityFollowerTab('private'), AccountError);
});
