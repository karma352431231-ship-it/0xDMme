import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countShareClick } from '../src/client/communities/share-click.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';

const post: CommunityPost = {
  id: crypto.randomUUID(),
  community: crypto.randomUUID(),
  author: null,
  title: 'Synthetic',
  text: 'Synthetic',
  tags: [],
  createdAt: new Date().toISOString(),
  editedAt: null,
  revision: 1,
  status: 'visible',
  parent: null,
  root: null,
  score: 0,
  replies: 0,
};
await test('a share click retries the same anonymous receipt after a lost acknowledgement', async (t) => {
  const bodies: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    (url: string, options: RequestInit) => {
      assert.equal(url, '/api/communities/share-clicks');
      assert.equal(options.credentials, 'omit');
      bodies.push(options.body as string);
      if (bodies.length === 1)
        throw new Error('Synthetic lost acknowledgement');
      return Promise.resolve(Response.json({ accepted: true }));
    },
  );
  assert.equal(await countShareClick(post), true);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  const receipt: unknown = JSON.parse(bodies[0]!);
  assert.deepEqual(Object.keys(receipt as object), ['items']);
});
await test('unavailable share counting stops after two attempts', async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', () => {
    attempts++;
    return Promise.resolve(new Response('', { status: 503 }));
  });
  assert.equal(await countShareClick(post), false);
  assert.equal(attempts, 2);
});
