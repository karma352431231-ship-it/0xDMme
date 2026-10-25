import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appDocumentPath,
  appHref,
  appRoute,
  publicPostHash,
} from '../src/shared/app-routes/index.ts';
import {
  samePanelTarget,
  splitHref,
  splitTarget,
  standalonePanelHref,
} from '../src/client/app/panel-route.ts';

const community = '00000000-0000-4000-8000-000000000001';
const post = '00000000-0000-4000-8000-000000000002';
const compact =
  '/communities/id/AAAAAAAAQACAAAAAAAAAAQ/posts/AAAAAAAAQACAAAAAAAAAAg';

await test('community and post paths preserve their structure and restore complete IDs from compact segments', () => {
  const params = new URLSearchParams({ id: community, post });
  for (const page of ['communities', 'split'] as const) {
    const href = page === 'split' ? '/split' + compact : compact;
    assert.equal(appHref(page, params), href);
    assert.ok(appDocumentPath(href));
    assert.deepEqual([...appRoute(href)!.params], [...params]);
  }
  const notificationTarget = `/communities/id/${community}/posts/${post}`;
  assert.equal(publicPostHash(compact), notificationTarget);
  assert.equal(
    publicPostHash(`#communities?id=${community}&post=${post}`),
    notificationTarget,
  );
});

await test('split layout, filters and narrow-screen navigation preserve the same public target', () => {
  const dm = crypto.randomUUID();
  const target = {
    kind: 'feed' as const,
    params: new URLSearchParams({ id: community, post, tag: community }),
  };
  const href = splitHref({
    layout: 'all',
    target,
    dm: { id: dm, local: false },
  });
  assert.ok(href.startsWith('/split' + compact + '?'));
  const restored = splitTarget(href)!;
  assert.ok(samePanelTarget(restored.target, target));
  assert.equal(restored.dm?.id, dm);
  assert.equal(
    new URL(href, 'https://app.invalid').searchParams.get('tag'),
    community,
  );
  const withoutDm = splitHref({ layout: 'all', target, dm: null });
  assert.equal(
    standalonePanelHref(withoutDm, false, false),
    compact + '?tag=' + community,
  );
});

await test('address names, profile IDs and private fragments are not decoded as compact community IDs', () => {
  const slug = 'AAAAAAAAQACAAAAAAAAAAQ';
  const href = appHref('communities', new URLSearchParams({ slug, post }));
  assert.equal(href, '/communities/' + slug + '/posts/AAAAAAAAQACAAAAAAAAAAg');
  assert.equal(appRoute(href)?.params.get('slug'), slug);
  assert.equal(
    appHref('users', new URLSearchParams({ id: community })),
    '/users/id/' + community,
  );
  for (const invalid of [
    'AAAAAAAAQACAAAAAAAAAAR',
    'AAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAQACAAAAAAAAAAQ==',
    'AAAAAAAAQACAAAAAAAAAA/',
    'A'.repeat(128),
  ])
    assert.equal(
      publicPostHash(
        '/communities/id/' + invalid + '/posts/AAAAAAAAQACAAAAAAAAAAg',
      ),
      null,
    );
});

await test('compact segments retain every identifier bit and never truncate matching UUID prefixes', () => {
  const links = new Set<string>();
  for (let index = 1; index <= 64; index++) {
    const id =
      '00000000-0000-4000-8000-' + index.toString(16).padStart(12, '0');
    const href = appHref('communities', new URLSearchParams({ id, post }));
    assert.match(
      href,
      /^\/communities\/id\/[A-Za-z0-9_-]{22}\/posts\/[A-Za-z0-9_-]{22}$/u,
    );
    assert.equal(appRoute(href)?.params.get('id'), id);
    assert.equal(appRoute(href)?.params.get('post'), post);
    links.add(href);
  }
  assert.equal(links.size, 64);
});
