import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appRoute,
  appHref,
  canonicalAppHash,
  communityHref,
  publicPostHash,
} from '../src/shared/app-routes/index.ts';
import {
  communitySlug,
  communitySlugBase,
} from '../src/shared/community-address/index.ts';
import { splitTarget } from '../src/client/app/panel-route.ts';

await test('clean paths restore public targets and preserve explicit layout and filters', () => {
  for (const [old, expected] of [
    ['#split?layout=split&view=feed', '/split/feed'],
    ['#split?layout=split&profile=karma', '/split/profile/karma'],
    ['#users?handle=karma', '/users/handle/karma'],
    ['#communities?view=feed', '/communities/feed'],
    ['#communities?slug=minha-comunidade', '/communities/minha-comunidade'],
    ['#settings?section=privacy', '/settings/privacy'],
  ] as const)
    assert.equal(canonicalAppHash(old), expected);
  assert.equal(splitTarget('/split/profile/karma')?.target.kind, 'profile');
  assert.equal(splitTarget('/split/feed?layout=feed')?.layout, 'nochat');
  const route = appRoute(
    '/split/communities/minha-comunidade/posts/public-post?tag=public-tag&layout=feed',
  )!;
  assert.equal(route.params.get('slug'), 'minha-comunidade');
  assert.equal(route.params.get('post'), 'public-post');
  assert.equal(route.params.get('tag'), 'public-tag');
  assert.equal(
    appHref(route.page, route.params),
    '/split/communities/minha-comunidade/posts/public-post?tag=public-tag&layout=feed',
  );
});

await test('public slug normalization is bounded and reserves app destinations', () => {
  assert.equal(communitySlugBase(' Minha Comunidade! '), 'minha-comunidade');
  assert.equal(communitySlugBase('Café'), communitySlugBase('Cafe'));
  assert.equal(communitySlugBase('中文社区'), '中文社区');
  assert.equal(communitySlugBase('Feed'), 'feed-community');
  assert.equal(communitySlugBase('☀️'), 'community');
  assert.equal(communitySlugBase('a'.repeat(100)).length, 60);
  for (const value of [
    'id',
    'feed',
    '../escape',
    'a/b',
    '-name',
    'name-',
    'a'.repeat(97),
  ])
    assert.throws(() => communitySlug(value));
  assert.equal(
    communityHref({ id: 'public-id', slug: 'minha-comunidade' }),
    '/communities/minha-comunidade',
  );
  assert.equal(
    communityHref({ id: 'public-id', slug: null }),
    '/communities/id/public-id',
  );
});

await test('malformed paths and private fragments cannot become public post targets', () => {
  for (const href of [
    '/users/handle/%zz',
    '/users/handle/a%2fb',
    '/communities/%2e%2e',
    '/split/profile/a/extra',
    '//external.example/users',
  ])
    assert.equal(appRoute(href), null, href);
  const id = '00000000-0000-4000-8000-000000000001',
    post = '00000000-0000-4000-8000-000000000002';
  assert.equal(
    publicPostHash(`/communities/id/${id}/posts/${post}`),
    `/communities/id/${id}/posts/${post}`,
  );
  assert.equal(publicPostHash(`/communities/name/posts/${post}`), null);
  for (const href of [
    '#grupo=private',
    '#vincular=private',
    '#contacts?invite=private',
    '#configuracoes?ticket=private',
  ])
    assert.equal(canonicalAppHash(href), null);
});
