import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  replaceEditedPost,
  editedPost,
} from '../src/client/communities/post-edit-update.ts';
import { PostSnapshot } from '../src/client/communities/post-snapshot.ts';
import { postHeader } from '../src/client/communities/presentation.ts';
import { communityDocument } from './fixtures/community-dom.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../src/shared/community-posts/index.ts';

function post(): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Original title',
    text: 'Original body',
    tags: [],
    createdAt: '2026-10-15T02:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 0,
    replies: 0,
    viewer: { vote: 1, shared: false },
  };
}
function edit(value: CommunityPost): CommunityPost {
  return {
    ...value,
    title: 'Updated title',
    text: 'Updated body',
    revision: 2,
    editedAt: '2026-10-15T02:05:00.000Z',
  };
}
function state(post: CommunityPost): PostState {
  return {
    post,
    own: true,
    manager: false,
    canEdit: true,
    canDelete: true,
    content: { title: post.title, text: post.text, tags: [] },
    removal: null,
    vote: { position: 1, revision: 1 },
  };
}
await test('confirmed root/reply edits replace only their card and show a localized marker without a diff', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    setActiveLanguage('en');
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  for (const language of ['en', 'zh-CN'] as const)
    for (const reply of [false, true]) {
      setActiveLanguage(language);
      const value = post();
      value.author = {
        id: crypto.randomUUID(),
        handle: 'author',
        avatar: null,
      };
      value.authorBadges = [
        { id: null, kind: 'new', label: 'New member' },
        { id: crypto.randomUUID(), kind: 'custom', label: 'Chosen name' },
      ];
      if (reply) {
        value.parent = crypto.randomUUID();
        value.root = value.parent;
      }
      const host = new ChatNode(),
        old = new ChatNode('article'),
        expanded = new ChatNode('section'),
        siblingDraft = new ChatNode('textarea');
      old.className = 'community-post';
      old.dataset['postId'] = value.id;
      old.textContent = value.text;
      siblingDraft.value = 'Unsent sibling reply';
      host.append(old, expanded, siblingDraft);
      const cleaned: HTMLElement[] = [];
      const accepted = state(edit(value));
      const result = replaceEditedPost({
        host: host as unknown as HTMLElement,
        state: accepted,
        cleanup: (node) => cleaned.push(node),
        render: (container, current) => {
          const card = document.createElement('article');
          postHeader(
            card,
            current.post,
            { id: value.community, name: 'Synthetic' },
            'community',
          );
          const body = document.createElement('p');
          body.textContent = current.post.text;
          card.append(body);
          container.append(card);
          return card;
        },
      });
      assert.equal(result, true);
      const badges = host.querySelectorAll('.community-author-badge');
      assert.equal(
        badges[0]!.getAttribute('aria-label'),
        language === 'en' ? 'New member' : '新成员',
      );
      assert.equal(badges[1]!.getAttribute('aria-label'), 'Chosen name');
      assert.equal(badges[1]!.textContent, 'Chosen name');
      const feedCard = document.createElement('article');
      postHeader(feedCard, value, { id: value.community, name: 'Synthetic' });
      assert.equal(
        feedCard.querySelectorAll('.community-author-badge').length,
        0,
        'community badges stay out of the feed',
      );
      assert.equal(host.children[1], expanded);
      assert.equal(host.children[2], siblingDraft);
      assert.equal(siblingDraft.value, 'Unsent sibling reply');
      assert.equal(old.parent, null);
      assert.deepEqual(cleaned, [old]);
      assert.match(host.textContent, language === 'en' ? /Edited/u : /已编辑/u);
      assert.ok(host.textContent.includes('Updated body'));
      assert.ok(!host.textContent.includes('Original body'));
    }
});
await test('accepting an edit updates snapshots without losing viewer state or causing a later identical repaint', () => {
  const value = post(),
    accepted = edit(value),
    root = new PostSnapshot(),
    page = new PostSnapshot();
  const publicResult = { ...accepted };
  delete publicResult.viewer;
  assert.equal(editedPost(value, publicResult).viewer, value.viewer);
  assert.equal(editedPost(accepted, value), accepted);
  root.changed('root', value);
  page.changed('page', { items: [value], next: null });
  root.accept(publicResult);
  page.accept(publicResult);
  assert.equal(root.changed('root', accepted), false);
  assert.equal(page.changed('page', { items: [accepted], next: null }), false);
  root.clear();
  root.accept(publicResult);
  assert.equal(root.changed('root', accepted), true);
});

await test('confirmed preview edits retain their snapshot and removed previews leave it', () => {
  const parent = post(),
    child = { ...post(), parent: parent.id, root: parent.id },
    accepted = edit(child);
  const snapshot = new PostSnapshot();
  snapshot.changed('discussion', {
    items: [parent],
    previews: [child],
    next: null,
  });
  snapshot.accept(accepted);
  assert.equal(
    snapshot.changed('discussion', {
      items: [parent],
      previews: [accepted],
      next: null,
    }),
    false,
  );
  snapshot.accept({
    ...accepted,
    status: 'removed',
    revision: accepted.revision + 1,
  });
  assert.equal(
    snapshot.changed('discussion', {
      items: [parent],
      previews: [],
      next: null,
    }),
    false,
  );
});
