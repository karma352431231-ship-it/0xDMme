import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  postBookmark,
  withoutBookmarkState,
} from '../src/client/communities/post-bookmark.ts';
import type { CommunityPost } from '../src/shared/community-posts/index.ts';
class Node {
  readonly children: Node[] = [];
  readonly attributes = new Map<string, string>();
  readonly events = new Map<string, () => void>();
  textContent = '';
  className = '';
  isConnected = true;
  hidden = false;
  append(...nodes: Node[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Node[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  addEventListener(event: string, handler: () => void): void {
    this.events.set(event, handler);
  }
}
await test('bookmark opens with saved state, changes only after confirmation and preserves its indicator on failure', async (t) => {
  const previous = ['document', 'window'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  t.after(() => {
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => new Node(),
      createElementNS: () => new Node(),
      body: new Node(),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { clearTimeout: () => {}, setTimeout: () => 0 },
  });
  const post: CommunityPost = {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Post',
    text: 'Text',
    tags: [],
    revision: 1,
    status: 'visible',
    score: 0,
    replies: 0,
    parent: null,
    root: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
  };
  let saved = true,
    failure = false;
  let finished: () => void = () => {};
  const container = new Node();
  const actions = {
    saved: true,
    valid: () => true,
    run: async (work: () => Promise<void>) => {
      try {
        await work();
      } catch {
        /* Displayed by the owning UI, as in the actual feed. */
      } finally {
        finished();
      }
    },
    controller: {
      request: (operation: string) => {
        if (operation === 'discovery-preference')
          return Promise.resolve({ saved, hidden: false, revision: 1 });
        if (failure) return Promise.reject(new Error('Falha de rede'));
        saved = !saved;
        return Promise.resolve({ saved, hidden: false, revision: 2 });
      },
    },
  };
  postBookmark(container as unknown as HTMLElement, post, actions);
  const button = container.children[0]!;
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  const click = async () => {
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    button.events.get('click')!();
    await done;
  };
  await click();
  assert.equal(saved, false);
  assert.equal(button.attributes.get('aria-pressed'), 'false');
  failure = true;
  await click();
  assert.equal(button.attributes.get('aria-pressed'), 'false');
  assert.equal(saved, false);
});

await test('session change removes the private bookmark without mutating the received post', () => {
  const post: CommunityPost = {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    author: null,
    title: 'Post',
    text: 'Text',
    tags: [],
    revision: 1,
    status: 'visible',
    score: 0,
    replies: 0,
    parent: null,
    root: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    viewer: { vote: 0, shared: false, saved: true },
  };
  const entry = {
    post,
    community: { id: post.community, name: 'Community' },
    viewerSaved: true,
  };
  const clean = withoutBookmarkState(entry);
  assert.equal(Object.hasOwn(clean, 'viewerSaved'), false);
  assert.equal(clean.post.viewer?.saved, undefined);
  assert.equal(clean.post.text, post.text);
  assert.equal(entry.viewerSaved, true);
  assert.equal(entry.post.viewer?.saved, true);
});
