import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { PostThread } from '../src/client/communities/post-thread.ts';
import { discussionKey } from '../src/shared/community-discussion/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';

/** Flush the asynchronous click handler after the DOM fixture dispatches it. */
async function click(node: CommunityNode): Promise<void> {
  node.click();
  await new Promise<void>((resolve) => setImmediate(resolve));
}
function post(parent: CommunityPost | null, score: number): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: parent?.community ?? crypto.randomUUID(),
    author: null,
    title: parent ? '' : 'Synthetic discussion',
    text: String(score),
    tags: [],
    createdAt: '2026-10-12T12:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: parent?.id ?? null,
    root: parent ? (parent.root ?? parent.id) : null,
    score,
    replies: 0,
  };
}
function threadDocument(t: TestContext): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new CommunityNode(tag),
      createTextNode: (text: string) => {
        const node = new CommunityNode('#text');
        node.textContent = text;
        return node;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}

await test('one click expands the selected reply subtree across pages in vote order', async (t) => {
  threadDocument(t);
  const root = post(null, 0),
    parent = post(root, 0),
    children = Array.from({ length: 27 }, (_, i) => post(parent, (i * 7) % 27)),
    nestedParent = children.find((child) => child.score === 26)!;
  root.replies = 1;
  parent.replies = children.length;
  nestedParent.replies = 2;
  const descendants = [post(nestedParent, 1), post(nestedParent, 42)];
  const replies = new Map([
    [root.id, [parent]],
    [parent.id, children],
    [nestedParent.id, descendants],
  ]);
  t.mock.method(globalThis, 'fetch', (path: string) => {
    const url = new URL(path, 'http://localhost'),
      id = url.pathname.split('/').at(-2)!,
      order = url.searchParams.get('order')!,
      rows = [...(replies.get(id) ?? [])];
    if (order === 'votes') rows.sort((a, b) => b.score - a.score);
    const offset = url.searchParams.has('after') ? 24 : 0,
      items = rows.slice(offset, offset + 24),
      last = items.at(-1)!;
    const next =
      rows.length > offset + 24
        ? JSON.stringify({
            key: discussionKey(root.community, id, 'votes'),
            anchor: last.createdAt,
            activity: 0,
            score: last.score,
            time: last.createdAt,
            id: last.id,
          })
        : null;
    return Promise.resolve(Response.json({ items, next }));
  });
  const actions = {
    community: root.community,
    signal: new AbortController().signal,
    valid: () => true,
    run: (work: () => Promise<void>) => work(),
    render: (container: HTMLElement, value: CommunityPost) => {
      container.textContent = value.text;
      container.dataset['postText'] = value.text;
    },
    cleanup: () => {},
  };
  const host = new CommunityNode('main'),
    thread = new PostThread(actions);
  await thread.mount(host as unknown as HTMLElement, root);
  const toggle = host
    .querySelectorAll('.post-thread-toggle')
    .find(
      (node) => node.getAttribute('aria-controls') === `thread-${parent.id}`,
    )!;
  await click(toggle);
  const branch = host.querySelectorAll('.post-thread-children')[0]!;
  assert.deepEqual(
    branch.children.map((child) => child.dataset['postText']),
    Array.from({ length: 27 }, (_, i) => String(26 - i)),
  );
  const nested = host.querySelectorAll('.post-thread-children')[1]!;
  assert.deepEqual(
    nested.children.map((child) => child.dataset['postText']),
    ['42', '1'],
  );
  // A counted child may now be unavailable (moderation or the reader's blocks).
  replies.set(parent.id, []);
  await click(toggle);
  await click(toggle);
  assert.equal(branch.querySelectorAll('.post-thread-item').length, 0);
  assert.equal(
    branch.querySelectorAll('.community-thread-empty')[0]!.textContent,
    'No more replies available to display.',
  );
  replies.set(parent.id, children);
  await click(toggle);
  await click(toggle);
  assert.equal(branch.querySelectorAll('.community-thread-empty').length, 0);
  assert.equal(branch.querySelectorAll('.post-thread-item').length, 29);
  thread.dispose();
  const continuation = new CommunityNode('main'),
    subtree = new PostThread(actions);
  await subtree.mount(continuation as unknown as HTMLElement, parent);
  assert.deepEqual(
    continuation
      .querySelectorAll('.community-thread')[0]!
      .children.map((child) => child.dataset['postText']),
    Array.from({ length: 24 }, (_, i) => String(26 - i)),
  );
  subtree.dispose();
});

await test('deep expansion keeps the 120-node budget and continues from the remaining frontier', async (t) => {
  threadDocument(t);
  const root = post(null, 0),
    replies: CommunityPost[] = [];
  let parent = root,
    reads = 0;
  for (let index = 0; index < 150; index++) {
    parent.replies = 1;
    const child = post(parent, index);
    replies.push(child);
    parent = child;
  }
  const host = new CommunityNode('main');
  const tree = new PostThread({
    community: root.community,
    signal: new AbortController().signal,
    valid: () => true,
    run: (work) => work(),
    cleanup: () => {},
    render: (container, value) => {
      container.textContent = value.id;
      container.dataset['postText'] = value.id;
    },
    request: (payload) => {
      reads++;
      return Promise.resolve({
        items: replies.filter((value) => value.parent === payload['post']),
        next: null,
      });
    },
  });
  await tree.mount(host as unknown as HTMLElement, root);
  await click(host.querySelectorAll('.post-thread-toggle')[0]!);
  const rows = host.querySelectorAll('.post-thread-item');
  assert.equal(rows.length, 120);
  assert.equal(reads, 120);
  const continuation = host.querySelectorAll('a').at(-1)!;
  assert.ok(
    (continuation as unknown as HTMLAnchorElement).href.endsWith(
      rows.at(-1)!.dataset['postText']!,
    ),
  );
  assert.ok(host.querySelectorAll('.post-thread-deep').length > 0);
  tree.dispose();
});

await test('a disposed tree rejects late expansion data', async (t) => {
  threadDocument(t);
  const root = post(null, 0),
    parent = post(root, 0),
    child = post(parent, 0);
  parent.replies = 1;
  let finish: (value: unknown) => void = () => {};
  const pending = new Promise<unknown>((resolve) => {
    finish = resolve;
  });
  const host = new CommunityNode('main');
  const tree = new PostThread({
    community: root.community,
    signal: new AbortController().signal,
    valid: () => true,
    run: (work) => work(),
    cleanup: () => {},
    render: () => {},
    request: (payload) =>
      payload['post'] === root.id
        ? Promise.resolve({ items: [parent], next: null })
        : pending,
  });
  await tree.mount(host as unknown as HTMLElement, root);
  await click(host.querySelectorAll('.post-thread-toggle')[0]!);
  tree.dispose();
  finish({ items: [child], next: null });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(host.querySelectorAll('.post-thread-item').length, 1);
});

await test('only the top child is previewed; siblings and deeper replies wait for an explicit expansion', async (t) => {
  threadDocument(t);
  const root = post(null, 0),
    parent = post(root, 0),
    top = post(parent, 10),
    second = post(parent, 2),
    third = post(parent, 1),
    deep = post(top, 50);
  root.replies = 1;
  parent.replies = 3;
  top.replies = 1;
  const calls: Record<string, unknown>[] = [];
  let highlighted = top;
  const table = new Map([
    [root.id, [parent]],
    [parent.id, [top, second, third]],
    [top.id, [deep]],
  ]);
  const host = new CommunityNode('main');
  const tree = new PostThread({
    community: root.community,
    signal: new AbortController().signal,
    valid: () => true,
    run: (work) => work(),
    cleanup: () => {},
    render: (container, value) => {
      container.textContent = value.id;
      container.dataset['postText'] = value.id;
    },
    request: (payload) => {
      calls.push(payload);
      const items = table.get(String(payload['post'])) ?? [];
      return Promise.resolve({
        items,
        next: null,
        ...(payload['preview'] === 'top' ? { previews: [highlighted] } : {}),
      });
    },
  });
  await tree.mount(host as unknown as HTMLElement, root);
  const ids = () =>
    host
      .querySelectorAll('.post-thread-item')
      .map((node) => node.dataset['postText']);
  assert.deepEqual(ids(), [parent.id, top.id]);
  assert.equal(calls.length, 1);
  const expand = host
    .querySelectorAll('.post-thread-toggle')
    .find((node) => node.textContent === '＋ View 2 more replies')!;
  assert.ok(expand);
  assert.equal(expand.getAttribute('aria-expanded'), 'false');
  await click(expand);
  assert.deepEqual(ids(), [parent.id, top.id, deep.id, second.id, third.id]);
  assert.equal(new Set(ids()).size, ids().length);
  await click(expand);
  assert.deepEqual(ids(), [parent.id, top.id]);
  assert.equal(expand.getAttribute('aria-expanded'), 'false');
  // A child's own control may reveal its descendants without revealing its siblings.
  const deeper = host
    .querySelectorAll('.post-thread-toggle')
    .find((node) => node.textContent === '＋ View 1 reply')!;
  await click(deeper);
  assert.deepEqual(ids(), [parent.id, top.id, deep.id]);
  const removed = { ...top, revision: 2, status: 'removed' as const, text: '' };
  tree.accept(removed);
  assert.deepEqual(ids(), [parent.id]);
  highlighted = second;
  await tree.refresh(root);
  assert.deepEqual(ids(), [parent.id, second.id]);
  tree.dispose();
});

await test('a sole eligible child needs no show-more control, and late preview pages cannot reopen a disposed view', async (t) => {
  threadDocument(t);
  const root = post(null, 0),
    parent = post(root, 0),
    child = post(parent, 1);
  parent.replies = 1;
  let finish: (value: unknown) => void = () => {};
  const pending = new Promise<unknown>((resolve) => {
    finish = resolve;
  });
  const host = new CommunityNode('main');
  const actions = {
    community: root.community,
    signal: new AbortController().signal,
    valid: () => true,
    run: (work: () => Promise<void>) => work(),
    cleanup: () => {},
    render: () => {},
    request: () => pending,
  };
  const tree = new PostThread(actions);
  const mounting = tree.mount(host as unknown as HTMLElement, root);
  tree.dispose();
  finish({ items: [parent], previews: [child], next: null });
  await mounting;
  assert.equal(host.querySelectorAll('.post-thread-item').length, 0);
  const ready = new PostThread({
    ...actions,
    request: () =>
      Promise.resolve({ items: [parent], previews: [child], next: null }),
  });
  await ready.mount(host as unknown as HTMLElement, root);
  assert.equal(host.querySelectorAll('.post-thread-item').length, 2);
  assert.equal(
    host.querySelectorAll('.post-thread-toggle').at(-1)!.hidden,
    true,
  );
  ready.dispose();
});
