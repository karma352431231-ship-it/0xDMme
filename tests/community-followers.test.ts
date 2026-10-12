import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  communityFollowers,
  communityFollowerTab,
} from '../src/shared/community-followers/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
import { knownFollowersText } from '../src/client/communities/followers.ts';
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
await test('frase de perfis em comum cita até dois e conta os demais que a pessoa segue', () => {
  const people = ['ana', 'bia', 'caio'].map((handle) => ({
    id: crypto.randomUUID(),
    handle,
    avatar: null,
  }));
  const cases: [number, number, string][] = [
    [1, 1, 'Seguida por @ana'],
    [2, 2, 'Seguida por @ana e @bia'],
    [3, 3, 'Seguida por @ana, @bia e mais 1 que você segue'],
    // The page may hold fewer profiles than the total in common.
    [3, 12, 'Seguida por @ana, @bia e mais 10 que você segue'],
  ];
  for (const [shown, total, text] of cases)
    assert.equal(
      knownFollowersText({ items: people.slice(0, shown), total, next: null }),
      text,
    );
});
