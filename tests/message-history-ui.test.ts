import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageHistoryUi } from '../src/client/messages/history-ui.ts';
import type { MessageView } from '../src/client/messages/controller.ts';
import type { ConversationPeer } from '../src/client/messages/directory-controller.ts';
import type { EmojiPicker } from '../src/client/emoji/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';

function row(id: string, own = false): MessageView {
  return {
    id,
    peer: 'peer',
    kind: 'text',
    text: 'Synthetic message',
    own,
    state: 'Recebida e preservada',
    hash: 'a'.repeat(64),
    delivery: 'received',
  };
}
function fixture(t: TestContext) {
  const document = new ChatNode('#document');
  const create = (tag: string) => new ChatNode(tag);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: Object.assign(document, {
      createElement: create,
      createElementNS: (_ns: string, tag: string) => create(tag),
    }),
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  const history = new ChatNode(),
    gate = new ChatNode(),
    older = new ChatNode();
  const nodes = new Map([
    ['[data-message-history]', history],
    ['[data-message-gate]', gate],
    ['[data-message-older]', older],
  ]);
  let selected: ConversationPeer | null = {
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Synthetic peer',
  };
  let visible = true,
    clears = 0;
  const ui = new MessageHistoryUi({
    node: <T extends HTMLElement>(selector: string) =>
      (nodes.get(selector) ?? null) as T | null,
    context: () => ({
      selected,
      peers: selected ? [selected] : [],
      session: null,
      calls: false,
    }),
    visible: () => visible,
    signal: () => new AbortController().signal,
    attachments: {
      clearMedia: () => {
        clears++;
      },
      render() {},
    },
    media: () =>
      Promise.reject(new Error('No media transport in this fixture')),
    run: (work) => work(),
    composerChanged() {},
    actions: {
      action: (label) => {
        const button = create('button');
        button.textContent = label;
        return button as unknown as HTMLButtonElement;
      },
      picker: {} as EmojiPicker,
      choose() {},
      react: () => Promise.resolve(),
      forward: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
  });
  return {
    ui,
    history,
    gate,
    older,
    clears: () => clears,
    hide: () => {
      visible = false;
    },
    deselect: () => {
      selected = null;
    },
  };
}
await test('verified window renders; null gate removes old rows and never exposes an intermediate history', (t) => {
  const f = fixture(t);
  f.ui.render([row('incoming')]);
  assert.equal(f.gate.hidden, true);
  assert.equal(f.history.hidden, false);
  assert.match(f.history.textContent, /Synthetic message/u);
  f.ui.render(null);
  assert.equal(f.gate.hidden, false);
  assert.equal(f.history.hidden, true);
  assert.equal(f.history.children.length, 0);
  f.ui.render([row('new')]);
  assert.equal(f.history.children[0]?.dataset['message'], 'new');
});
await test('delete capability is offered only on own live messages; archived and incoming rows keep their menus', (t) => {
  const f = fixture(t);
  f.ui.render([
    row('incoming'),
    row('own', true),
    { ...row('archived', true), archived: true },
  ]);
  const [incoming, own, archived] = f.history.children;
  assert.doesNotMatch(incoming!.textContent, /Apagar para ambos/u);
  assert.match(own!.textContent, /Apagar para ambos/u);
  assert.doesNotMatch(archived!.textContent, /Apagar para ambos/u);
  assert.match(incoming!.textContent, /Responder/u);
});
await test('read receipts patch checks without replacing the message and suppress stale completion after the gate closes', async (t) => {
  const f = fixture(t),
    own = row('own', true);
  f.ui.render([own]);
  const message = f.history.children[0],
    clears = f.clears();
  await f.ui.markRead({
    read: () => Promise.resolve(),
    receipts: () => Promise.resolve(new Set(['own'])),
  });
  assert.equal(f.history.children[0], message);
  assert.equal(f.clears(), clears);
  assert.match(
    message!
      .querySelector('.message-meta')!
      .children[0]!.getAttribute('class')!,
    /green/u,
  );
  const pending = deferred<Set<string>>(),
    started = deferred<void>();
  const reading = f.ui.markRead({
    read: () => Promise.resolve(),
    receipts: () => {
      started.resolve();
      return pending.promise;
    },
  });
  await started.promise;
  f.ui.clear();
  f.ui.render(null);
  f.deselect();
  pending.resolve(new Set(['own']));
  await reading;
  assert.equal(f.history.children.length, 0);
  assert.equal(f.gate.hidden, false);
});
await test('hidden conversation never sends read receipts', async (t) => {
  const f = fixture(t);
  f.ui.render([row('incoming')]);
  f.hide();
  await f.ui.markRead({
    read: () => Promise.reject(new Error('Hidden')),
    receipts: () => Promise.reject(new Error('Hidden')),
  });
});

await test('an unchanged GIF message keeps its DOM when another message arrives; edits replace it', (t) => {
  const f = fixture(t),
    gif = {
      ...row('gif'),
      text: 'Look! https://static.klipy.com/ii/synthetic/demo.gif',
    };
  f.ui.render([gif]);
  const first = f.history.children[0];
  f.ui.render([gif, row('later')]);
  assert.equal(f.history.children[0], first);
  assert.equal(f.history.children.length, 2);
  f.ui.render([{ ...gif, text: 'Changed' }, row('later')]);
  assert.notEqual(f.history.children[0], first);
  assert.match(f.history.children[0]!.textContent, /Changed/u);
  f.ui.render([row('later')]);
  assert.equal(f.history.children.length, 1);
  assert.equal(f.history.children[0]!.dataset['message'], 'later');
});
