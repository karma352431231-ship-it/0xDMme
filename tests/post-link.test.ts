import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postShareUrl } from '../src/client/communities/post-link.ts';
import { appDocumentPath, appRoute } from '../src/shared/app-routes/index.ts';

await test('a copied post or reply link opens that item in its community discussion', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://0xdmme.app' },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const post = { id: crypto.randomUUID(), community: crypto.randomUUID() };
  const url = new URL(postShareUrl(post));
  assert.equal(url.origin, 'https://0xdmme.app');
  // The server only serves the app shell for recognized public paths.
  assert.equal(appDocumentPath(url.pathname), true);
  const route = appRoute(url.pathname);
  assert.equal(route?.page, 'communities');
  assert.equal(route?.params.get('id'), post.community);
  assert.equal(route?.params.get('post'), post.id);
});
