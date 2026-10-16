import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageHistoryUi } from '../src/client/messages/history-ui.ts';
import type { MessageView } from '../src/client/messages/controller.ts';
import type { ConversationPeer } from '../src/client/messages/directory-controller.ts';
import type { EmojiPicker } from '../src/client/emoji/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';
import { deferred } from './fixtures/deferred.ts';
import { OutgoingTexts } from '../src/client/messages/outgoing-text.ts';

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
    older = new ChatNode(),
    peer = new ChatNode();
  const nodes = new Map([
    ['[data-message-history]', history],
    ['[data-message-peer]', peer],
    ['[data-message-gate]', gate],
    ['[data-message-older]', older],
  ]);
  let selected: ConversationPeer | null = {
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: '',
  };
  const outgoing = new OutgoingTexts();
  let retries = 0;
  let visible = true,
    clears = 0;
  const ui = new MessageHistoryUi({
    node: <T extends HTMLElement>(selector: string) =>
      (nodes.get(selector) ?? null) as T | null,
    context: () => ({
      selected,
      title: selected ? 'Saved name' : null,
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
    outgoing: () => outgoing.forPeer(selected?.accountId),
    retryOutgoing: () => {
      retries++;
      outgoing.retry();
    },
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
    outgoing,
    retries: () => retries,
    history,
    gate,
    older,
    peer,
    clears: () => clears,
    show: () => {
      visible = true;
    },
    hide: () => {
      visible = false;
    },
    deselect: () => {
      selected = null;
    },
  };
}
await test('Enter text appears as a normal own bubble before persistence, then confirmation replaces it exactly once', (t) => {
  const f = fixture(t),
    incoming = row('incoming');
  f.ui.render([incoming]);
  const retained = f.history.children[0];
  const draft = {
    id: 'optimistic',
    peer: 'peer',
    text: encodeDailyText({
      text: 'AAAAA <script>literal</script>',
      reply: null,
      forwarded: false,
    }),
    createdAt: 1700000000000,
  };
  f.outgoing.update(draft, 'admitted');
  f.ui.render([incoming]);
  assert.equal(f.history.children[0], retained);
  assert.match(f.history.textContent, /AAAAA/u);
  const bubble = f.history.children[1]!;
  assert.match(bubble.textContent, /AAAAA <script>literal<\/script>/u);
  assert.doesNotMatch(bubble.textContent, /Sending|Saving|Updating history/u);
  assert.equal(bubble.querySelector('script'), null);
  assert.equal(bubble.querySelector('svg'), null);
  f.outgoing.update(draft, 'saved');
  f.outgoing.acknowledge(draft);
  f.ui.render([incoming]);
  assert.match(
    f.history.children[1]!.querySelector('svg')?.getAttribute('class') ?? '',
    /message-checks/u,
  );
  const verified = { ...row('optimistic', true), text: draft.text };
  f.outgoing.observed([incoming, verified]);
  f.ui.render([incoming, verified]);
  assert.equal(
    f.history.children.filter((node) => node.dataset['message'] === draft.id)
      .length,
    1,
  );
  assert.equal(f.history.children[1]!.dataset['outgoingText'], undefined);
  assert.equal(f.history.children[0], retained);
});

await test('a partial send failure marks only unaccepted text with a retry cross, and a closed history gate hides every own draft', (t) => {
  const f = fixture(t);
  for (const id of ['accepted', 'failed']) {
    const draft = { id, peer: 'peer', text: id };
    f.outgoing.update(draft, 'admitted');
    f.outgoing.update(draft, 'saved');
  }
  f.outgoing.acknowledge({ id: 'accepted', peer: 'peer' });
  f.outgoing.failTransfer();
  f.ui.render([]);
  assert.equal(
    f.history.children[0]!.querySelector('.message-send-failed'),
    null,
  );
  const retry = f.history.children[1]!.querySelector('.message-send-failed');
  assert.equal(retry?.textContent, '✕');
  assert.match(
    retry?.getAttribute('aria-label') ?? '',
    /could not be sent.*Retry/u,
  );
  retry?.click();
  assert.equal(f.retries(), 1);
  f.ui.render([]);
  assert.equal(
    f.history.children[1]!.querySelector('.message-send-failed'),
    null,
  );
  f.outgoing.observed(null);
  f.ui.render(null);
  assert.equal(f.history.children.length, 0);
  assert.equal(f.history.hidden, true);
  assert.equal(
    f.outgoing.forPeer('peer').some((value) => value.id === 'accepted'),
    false,
  );
});

await test('a failed local save keeps its own text and a retry cross, without a sent check or a message for another peer', (t) => {
  const f = fixture(t),
    draft = { id: 'unsaved', peer: 'peer', text: 'Keep this draft' };
  f.outgoing.update(draft, 'admitted');
  f.outgoing.update(draft, 'save-failed');
  f.outgoing.update(
    { id: 'elsewhere', peer: 'another', text: 'Different contact' },
    'admitted',
  );
  f.ui.render([]);
  assert.match(f.history.textContent, /Keep this draft/u);
  assert.doesNotMatch(f.history.textContent, /Different contact/u);
  assert.ok(f.history.children[0]!.querySelector('.message-send-failed'));
  assert.equal(f.history.children[0]!.querySelector('svg'), null);
});
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
await test('the header shows the name the conversation list shows, not the wallet address', (t) => {
  const f = fixture(t);
  f.ui.render([row('incoming')]);
  assert.equal(f.peer.textContent, 'Saved name');
});
await test('delete capability is offered only on own live messages; archived and incoming rows keep their menus', (t) => {
  const f = fixture(t);
  f.ui.render([
    row('incoming'),
    row('own', true),
    { ...row('archived', true), archived: true },
  ]);
  const [incoming, own, archived] = f.history.children;
  assert.doesNotMatch(incoming!.textContent, /Delete for both/u);
  assert.match(own!.textContent, /Delete for both/u);
  assert.doesNotMatch(archived!.textContent, /Delete for both/u);
  assert.match(incoming!.textContent, /Reply/u);
});
await test('read receipts patch checks without replacing the message and suppress stale completion after the gate closes', async (t) => {
  const f = fixture(t),
    own = row('own', true);
  f.ui.render([own]);
  const message = f.history.children[0],
    clears = f.clears();
  await f.ui.markRead({
    readConversation: () => Promise.resolve(new Set(['own'])),
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
    readConversation: () => {
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
    readConversation: () => Promise.reject(new Error('Hidden')),
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

await test('atualização em hidden conserva os nós e recursos até voltar; exclusão fecha mesmo em hidden', (t) => {
  const f = fixture(t);
  f.ui.render([row('first')]);
  const original = f.history.children[0],
    clears = f.clears();
  f.hide();
  f.ui.render([row('first'), row('second')]);
  assert.equal(f.history.children.length, 1);
  assert.equal(f.history.children[0], original);
  assert.equal(f.clears(), clears);
  f.show();
  f.ui.resume();
  assert.equal(f.history.children.length, 2);
  f.hide();
  f.ui.render(null);
  assert.equal(f.history.children.length, 0);
  f.show();
  f.ui.resume();
  assert.equal(f.history.children.length, 0);
});

await test('edição, reação e exclusão preservam nós de mensagens não afetadas', (t) => {
  const f = fixture(t),
    original = { ...row('target', true), author: 'author' },
    other = row('other');
  f.ui.render([original, other]);
  const targetNode = f.history.children[0],
    otherNode = f.history.children[1],
    clears = f.clears();
  const edit = {
    ...row('edit', true),
    text: 'Texto editado',
    author: 'author',
    sequence: 3,
    relation: {
      id: original.id,
      hash: original.hash,
      author: 'author',
      type: 'edit' as const,
    },
  };
  f.ui.render([original, other, edit]);
  assert.notEqual(f.history.children[0], targetNode);
  assert.equal(f.history.children[1], otherNode);
  assert.match(f.history.children[0]!.textContent, /Texto editado/);
  f.ui.render([
    original,
    other,
    edit,
    {
      ...edit,
      id: 'reaction',
      text: '👍',
      sequence: 4,
      relation: { ...edit.relation, type: 'reaction' },
    },
  ]);
  assert.equal(f.history.children[1], otherNode);
  f.ui.render(null, 'pending');
  assert.equal(f.history.hidden, true);
  assert.equal(f.history.children[1], otherNode);
  assert.equal(f.clears(), clears);
  f.ui.render([other]);
  assert.equal(f.history.hidden, false);
  assert.equal(f.history.children.length, 1);
  assert.equal(f.history.children[0], otherNode);
});

await test('uma resposta atualiza sua citação se a original mudar, conservando as demais bolhas', (t) => {
  const f = fixture(t),
    original = row(crypto.randomUUID()),
    other = row('other'),
    reply = {
      ...row('reply'),
      text: encodeDailyText({
        text: 'Resposta',
        reply: original.id,
        forwarded: false,
      }),
    };
  f.ui.render([original, reply, other]);
  const replyNode = f.history.children[1],
    otherNode = f.history.children[2];
  f.ui.render([{ ...original, text: 'Nova versão' }, reply, other]);
  assert.notEqual(f.history.children[1], replyNode);
  assert.match(f.history.children[1]!.textContent, /Nova versão/);
  assert.equal(f.history.children[2], otherNode);
});
