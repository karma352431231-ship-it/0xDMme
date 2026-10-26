import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postPendingMedia } from '../src/client/communities/presentation.ts';
import { communityDocument } from './fixtures/community-dom.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';

function post(fields: Partial<CommunityPost>): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: '',
    text: '',
    tags: [],
    createdAt: '2026-10-25T02:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 0,
    replies: 0,
    viewer: { vote: 0, shared: false },
    ...fields,
  };
}
await test('the media notice shows only when a post has no text, title or approved media', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const media = [{ id: crypto.randomUUID() }] as unknown as NonNullable<
    CommunityPost['media']
  >;
  const cases: [Partial<CommunityPost>, boolean][] = [
    [{}, true],
    [{ title: 'Title only' }, false],
    [{ text: 'Body only' }, false],
    [{ media }, false],
  ];
  for (const [fields, shown] of cases) {
    const node = document.createElement('article');
    postPendingMedia(node, post(fields));
    assert.equal(node.children.length, shown ? 1 : 0, JSON.stringify(fields));
    if (shown)
      assert.equal(node.children[0]?.textContent, 'Media awaiting approval.');
  }
});
