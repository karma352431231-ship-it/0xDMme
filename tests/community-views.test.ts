import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  postObservations,
  postViewsPage,
} from '../src/shared/community-views/index.ts';

await test('visualizações: lotes limitados, marca própria e contagem pública sem identidade', () => {
  const item = {
    community: crypto.randomUUID(),
    post: crypto.randomUUID(),
    token: 'a'.repeat(32),
  };
  assert.deepEqual(postObservations({ items: [item] }), [item]);
  for (const items of [
    [],
    Array.from({ length: 25 }, () => ({ ...item, post: crypto.randomUUID() })),
    [item, item],
  ])
    assert.throws(() => postObservations({ items }));
  for (const token of ['', 'wallet', 'a'.repeat(64)])
    assert.throws(() => postObservations({ items: [{ ...item, token }] }));
  assert.throws(() =>
    postObservations({ items: [{ ...item, account: crypto.randomUUID() }] }),
  );
  assert.deepEqual(postViewsPage({ items: [{ id: item.post, views: 5 }] }), [
    { id: item.post, views: 5 },
  ]);
  assert.throws(() => postViewsPage({ items: [{ id: item.post, views: -1 }] }));
  assert.throws(() =>
    postViewsPage({
      items: [{ id: item.post, views: 5, viewer_hash: 'private' }],
    }),
  );
});
