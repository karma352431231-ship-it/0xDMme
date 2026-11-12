import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationSearch } from '../src/client/messages/search.ts';
import type { ConversationEntry } from '../src/client/messages/directory-types.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';

class SearchNode extends ChatNode {
  focus() {}
  open = false;
  readonly selectors = new Map<string, ChatNode>();
  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  override querySelector(selector: string): ChatNode | null {
    return (
      this.selectors.get(selector) ??
      (super.querySelector(selector) as ChatNode | null)
    );
  }
}
function dialogFixture() {
  const dialog = new SearchNode('dialog');
  for (const [selector, tag] of [
    ['[data-search-close]', 'button'],
    ['input', 'input'],
    ['form', 'form'],
    ['#conversation-search-title', 'h2'],
    ['[data-search-chats]', 'div'],
    ['[data-search-notice]', 'p'],
    ['[data-search-messages]', 'ul'],
  ]) {
    const node = new SearchNode(tag);
    dialog.selectors.set(selector!, node);
    dialog.append(node);
  }
  return dialog;
}
await test('public and private search never cross sources, contacts, queries or stale results', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dialog = dialogFixture(),
    body = new ChatNode('body');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      createElement: (tag: string) =>
        tag === 'dialog' ? dialog : new SearchNode(tag),
      createTextNode: (text: string) => {
        const node = new ChatNode('#text');
        node.textContent = text;
        return node;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const calls = { private: [] as string[], public: [] as string[] };
  const delayed = deferred<{
    items: { id: string; peer: string; sequence: number; excerpt: string }[];
    next: null;
  }>();
  const privateEntry: ConversationEntry = {
    id: 'wallet',
    title: 'Private Secret Contact',
    searchText: 'private secret',
    selected: false,
    detail: '',
    kind: 'contact',
    open: () => {},
  };
  const publicEntry: ConversationEntry = {
    id: 'handle',
    title: '@public',
    searchText: 'public secret latest',
    selected: false,
    detail: '',
    kind: 'contact',
    open: () => {},
  };
  const search = new ConversationSearch(
    (query) => {
      calls.private.push(query);
      return delayed.promise;
    },
    () => {},
    (query) => {
      calls.public.push(query);
      return Promise.resolve({
        items: [
          {
            id: 'public-message',
            peer: 'handle',
            sequence: 4,
            excerpt: `public ${query}`,
          },
        ],
        entries: [publicEntry],
        next: null,
      });
    },
  );
  search.update([privateEntry]);
  search.open('public');
  assert.equal(dialog.selectors.get('[data-search-chats]')!.children.length, 0);
  assert.deepEqual(calls, { private: [], public: [] });
  const input = dialog.selectors.get('input')!;
  input.value = 'secret';
  input.dispatchEvent(new Event('input'));
  t.mock.timers.tick(201);
  await new Promise(setImmediate);
  assert.deepEqual(calls, { private: [], public: ['secret'] });
  assert.equal(body.textContent.includes('Private Secret Contact'), false);
  search.open('private');
  assert.equal(input.value, '');
  assert.equal(body.textContent.includes('@public'), false);
  input.value = 'private secret';
  input.dispatchEvent(new Event('input'));
  t.mock.timers.tick(201);
  search.open('public');
  assert.equal(input.value, '');
  input.value = 'latest';
  input.dispatchEvent(new Event('input'));
  t.mock.timers.tick(201);
  delayed.resolve({
    items: [
      {
        id: 'private-message',
        peer: 'wallet',
        sequence: 3,
        excerpt: 'PRIVATE PLAINTEXT',
      },
    ],
    next: null,
  });
  await new Promise(setImmediate);
  t.mock.timers.tick(201);
  await new Promise(setImmediate);
  assert.deepEqual(calls, {
    private: ['private secret'],
    public: ['secret', 'latest'],
  });
  assert.equal(body.textContent.includes('PRIVATE PLAINTEXT'), false);
  assert.equal(body.textContent.includes('Private Secret Contact'), false);
  assert.equal(body.textContent.includes('@public'), true);
  search.close();
});

await test('search opened from a conversation info lists every match there and nothing else', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dialog = dialogFixture(),
    body = new ChatNode('body');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      createElement: (tag: string) =>
        tag === 'dialog' ? dialog : new SearchNode(tag),
      createTextNode: (text: string) => {
        const node = new ChatNode('#text');
        node.textContent = text;
        return node;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const entry = (id: string, title: string): ConversationEntry => ({
    id,
    title,
    searchText: title,
    selected: false,
    detail: '',
    kind: 'contact',
    open: () => {},
  });
  const search = new ConversationSearch(
    () =>
      Promise.resolve({
        items: [
          { id: 'a1', peer: 'alice', sequence: 1, excerpt: 'first match' },
          { id: 'b1', peer: 'bob', sequence: 2, excerpt: 'bob match' },
          { id: 'a2', peer: 'alice', sequence: 3, excerpt: 'second match' },
        ],
        next: null,
      }),
    () => {},
  );
  search.update([entry('alice', 'Alice'), entry('bob', 'Bob')]);
  search.openConversation({ id: 'alice', title: 'Alice' });
  assert.equal(dialog.dataset['conversation'], 'true');
  const input = dialog.selectors.get('input')!;
  input.value = 'match';
  input.dispatchEvent(new Event('input'));
  t.mock.timers.tick(201);
  await new Promise(setImmediate);
  const messages = dialog.selectors.get('[data-search-messages]')!;
  assert.equal(messages.children.length, 2, 'both matches in this chat');
  assert.equal(messages.textContent.includes('bob match'), false);
  assert.equal(
    dialog.selectors.get('[data-search-chats]')!.children.length,
    0,
    'no conversation list in a single conversation',
  );
  search.open('private');
  assert.equal(dialog.dataset['conversation'], undefined);
  assert.equal(input.value, '', 'the general search starts fresh');
  search.close();
});
