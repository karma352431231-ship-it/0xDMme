import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostThread } from '../src/client/communities/post-thread.ts';
import { discussionKey } from '../src/shared/community-discussion/index.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';

/** Minimal DOM surface; assertions exercise the public mount/click/read flow. */
class ThreadElement extends EventTarget {
  children: ThreadElement[] = [];
  className = '';
  textContent = '';
  hidden = false;
  readonly tag: string;
  constructor(tag: string) {
    super();
    this.tag = tag;
  }
  append(...children: ThreadElement[]): void {
    this.children.push(...children);
  }
  replaceChildren(...children: ThreadElement[]): void {
    this.children = children;
  }
  setAttribute(): void {}
  querySelectorAll(selector: string): ThreadElement[] {
    return this.children.flatMap((child) => [
      ...(child.tag === selector || child.className === selector.slice(1)
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  async click(): Promise<void> {
    this.dispatchEvent(new Event('click'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
function post(parent: CommunityPost | null, score: number): CommunityPost {
  return {
    id: crypto.randomUUID(),
    community: parent?.community ?? crypto.randomUUID(),
    author: null,
    title: parent ? '' : 'Discussão sintética',
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
await test('ramos mostram os mais votados nas primeiras respostas, demais páginas e continuação do fio', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new ThreadElement(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
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
    },
    cleanup: () => {},
  };
  const host = new ThreadElement('main'),
    thread = new PostThread(actions);
  await thread.mount(host as unknown as HTMLElement, root);
  await host.querySelectorAll('.post-thread-toggle')[0]!.click();
  const branch = host.querySelectorAll('.post-thread-children')[0]!;
  assert.deepEqual(
    branch.children.map((child) => child.textContent),
    ['26', '25', '24'],
  );
  for (let i = 0; i < 8; i++) {
    const more = host
      .querySelectorAll('button')
      .find((node) => node.textContent.includes('outras respostas'))!;
    await more.click();
  }
  assert.deepEqual(
    branch.children.map((child) => child.textContent),
    Array.from({ length: 27 }, (_, i) => String(26 - i)),
  );
  await host.querySelectorAll('.post-thread-toggle')[1]!.click();
  const nested = host.querySelectorAll('.post-thread-children')[1]!;
  assert.deepEqual(
    nested.children.map((child) => child.textContent),
    ['42', '1'],
  );
  thread.dispose();
  const continuation = new ThreadElement('main'),
    subtree = new PostThread(actions);
  await subtree.mount(continuation as unknown as HTMLElement, parent);
  assert.deepEqual(
    continuation
      .querySelectorAll('.community-thread')[0]!
      .children.map((child) => child.textContent),
    Array.from({ length: 24 }, (_, i) => String(26 - i)),
  );
  subtree.dispose();
});
