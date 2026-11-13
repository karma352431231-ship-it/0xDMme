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
import { setActiveLanguage, t as translate } from '../src/shared/i18n/index.ts';
import type { SubmittedMedia } from '../src/client/messages/attachment-submissions.ts';
import type { AttachmentContent } from '../src/shared/attachments/index.ts';

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
type ReactionHooks = Partial<
  Pick<
    ConstructorParameters<typeof MessageHistoryUi>[0]['actions'],
    'picker' | 'react' | 'remove' | 'edit'
  >
>;
function fixture(t: TestContext, reactionHooks: ReactionHooks = {}) {
  const create = (tag: string) =>
    Object.assign(new ChatNode(tag), { style: { height: '' }, focus() {} });
  const document = Object.assign(new ChatNode('#document'), {
    createElement: create,
    createElementNS: (_ns: string, tag: string) => create(tag),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  const lifetime = new AbortController();
  t.after(() => lifetime.abort());
  const history = Object.assign(new ChatNode(), { ownerDocument: document }),
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
  const media: SubmittedMedia[] = [];
  const previews: AbortSignal[] = [];
  const receipts: {
    peer: string;
    outgoing: readonly string[];
    read: ReadonlySet<string>;
  }[] = [];
  let retries = 0;
  let lastAction: Promise<void> | undefined;
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
    signal: () => lifetime.signal,
    attachments: {
      clearMedia: () => {
        clears++;
      },
      render: ({ signal }) => {
        if (signal) previews.push(signal);
      },
    },
    media: () =>
      Promise.reject(new Error('No media transport in this fixture')),
    run: (work) => work(),
    composerChanged() {},
    receiptsVerified: (window) => receipts.push(window),
    outgoing: () => outgoing.forPeer(selected?.accountId),
    submittedMedia: () =>
      media.filter((draft) => draft.peer === selected?.accountId),
    submissionMedia: () =>
      Promise.reject(new Error('No media transport in this fixture')),
    retryOutgoing: () => {
      retries++;
      outgoing.retry();
    },
    actions: {
      action: (label, work) => {
        const button = create('button');
        button.textContent = label;
        button.addEventListener('click', () => {
          lastAction = work();
          void lastAction.catch(() => undefined);
        });
        return button as unknown as HTMLButtonElement;
      },
      picker: {} as EmojiPicker,
      choose() {},
      edit: () => Promise.resolve(),
      react: () => Promise.resolve(),
      forward: () => Promise.resolve(),
      remove: () => Promise.resolve([]),
      pin: () => Promise.resolve(),
      ...reactionHooks,
    },
  });
  return {
    ui,
    outgoing,
    media,
    previews,
    lastAction: () => lastAction!,
    receipts,
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
    select: (accountId: string) => {
      selected = { ...selected!, accountId };
    },
  };
}

function photoMessage(): MessageView {
  const content: AttachmentContent = {
    version: 1,
    name: 'test.png',
    type: 'image/png',
    caption: '',
    image: true,
    thumbnail: null,
    file: {
      encryption: '{}',
      ref: {
        id: crypto.randomUUID(),
        hash: 'b'.repeat(64),
        bytes: 57,
        parts: [{ hash: 'b'.repeat(64), bytes: 57 }],
      },
    },
  };
  return {
    ...row(crypto.randomUUID()),
    author: 'author',
    kind: 'attachment',
    text: JSON.stringify(content),
  };
}
function reactionTo(
  photo: MessageView,
  input: {
    id: string;
    emoji: string;
    own: boolean;
    sequence: number;
  },
): MessageView {
  return {
    ...row(input.id, input.own),
    text: input.emoji,
    author: input.own ? 'self' : 'author',
    sequence: input.sequence,
    relation: {
      type: 'reaction',
      id: photo.id,
      hash: photo.hash,
      author: photo.author!,
    },
  };
}
function chooseReaction(bubble: ChatNode): void {
  const action = bubble
    .querySelectorAll('button')
    .find((button) => button.textContent === translate('React…'));
  assert.ok(action);
  action.click();
}

await test('a photo reaction appears before publication and verified changes preserve the preview', async (t) => {
  const publish = deferred<void>();
  const sent: string[] = [];
  const f = fixture(t, {
    picker: { choose: () => Promise.resolve('😂') },
    react: (_view, _emoji, id) => {
      sent.push(id);
      return publish.promise;
    },
  });
  const photo = photoMessage();
  f.ui.render([photo]);
  const bubble = f.history.children[0]! as ChatNode;
  const panel = bubble.querySelector('.message-reactions')!;
  chooseReaction(bubble);
  await Promise.resolve();
  assert.equal(sent.length, 1);
  assert.match(panel.textContent, /😂/u);
  assert.equal(
    panel.querySelector('button')?.getAttribute('aria-pressed'),
    'true',
  );

  const other = reactionTo(photo, {
    id: 'other-reaction',
    emoji: '😂',
    own: false,
    sequence: 2,
  });
  f.ui.render([photo, other]);
  assert.match(panel.textContent, /😂 2/u);
  const accepted = reactionTo(photo, {
    id: sent[0]!,
    emoji: '😂',
    own: true,
    sequence: 3,
  });
  f.ui.render([photo, other, accepted]);
  publish.resolve();
  await f.lastAction();
  assert.equal(f.history.children[0], bubble);
  assert.equal(bubble.querySelector('.message-reactions'), panel);
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0]!.aborted, false);

  const removed = reactionTo(photo, {
    id: 'own-removal',
    emoji: '',
    own: true,
    sequence: 4,
  });
  f.ui.render([photo, other, accepted, removed]);
  assert.equal(
    panel.querySelector('button')?.getAttribute('aria-label'),
    translate('message.reaction {0} {1}', ['😂', 1]),
  );
  assert.equal(
    panel.querySelector('button')?.getAttribute('aria-pressed'),
    'false',
  );
});

await test('a failed photo reaction restores the confirmed chips without replacing its preview', async (t) => {
  const publish = deferred<void>();
  const f = fixture(t, {
    picker: { choose: () => Promise.resolve('😂') },
    react: () => publish.promise,
  });
  const photo = photoMessage();
  f.ui.render([
    photo,
    reactionTo(photo, { id: 'prior', emoji: '👍', own: true, sequence: 2 }),
  ]);
  const bubble = f.history.children[0]! as ChatNode;
  const panel = bubble.querySelector('.message-reactions')!;
  chooseReaction(bubble);
  await Promise.resolve();
  assert.equal(
    panel.querySelector('button')?.getAttribute('aria-label'),
    translate('message.remove-reaction {0} {1}', ['😂', 1]),
  );
  publish.reject(new Error('Send failed'));
  await assert.rejects(f.lastAction(), /Send failed/u);
  assert.equal(
    panel.querySelector('button')?.getAttribute('aria-label'),
    translate('message.remove-reaction {0} {1}', ['👍', 1]),
  );
  assert.equal(f.history.children[0], bubble);
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0]!.aborted, false);
});

await test('removing a reaction is immediate and a failed removal restores the same image and chips', async (t) => {
  const pending = deferred<void>();
  const f = fixture(t, { react: () => pending.promise });
  const photo = photoMessage();
  const confirmed = reactionTo(photo, {
    id: 'previous',
    emoji: '👍',
    own: true,
    sequence: 2,
  });
  f.ui.render([photo, confirmed]);
  const bubble = f.history.children[0]!;
  const chips = bubble.querySelector('.message-reactions')!;
  chips.querySelector('button')!.click();
  assert.equal(chips.children.length, 0);
  f.ui.render([photo, confirmed]);
  assert.equal(chips.children.length, 0);
  pending.reject(new Error('Removal failed'));
  await assert.rejects(f.lastAction(), /Removal failed/u);
  assert.equal(
    chips.querySelector('button')!.getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(f.previews.length, 1);
  assert.equal(f.previews[0]!.aborted, false);
  assert.equal(f.history.children[0], bubble);
});

await test('a late failed reaction cannot alter the next conversation and deletion aborts only its own image', async (t) => {
  const pending = deferred<void>();
  const f = fixture(t, {
    picker: { choose: () => Promise.resolve('😂') },
    react: () => pending.promise,
  });
  const first = photoMessage();
  f.ui.render([first]);
  chooseReaction(f.history.children[0]! as ChatNode);
  await Promise.resolve();
  assert.match(
    f.history.children[0]!.querySelector('.message-reactions')!.textContent,
    /😂/u,
  );
  f.ui.render(null);
  const next = { ...photoMessage(), peer: 'next-peer' };
  f.select(next.peer);
  f.ui.render([next]);
  const bubble = f.history.children[0]!;
  const chips = bubble.querySelector('.message-reactions')!;
  pending.reject(new Error('Old reaction failed'));
  await assert.rejects(f.lastAction(), /Old reaction failed/u);
  assert.equal(chips.children.length, 0);
  assert.equal(f.history.children[0], bubble);
  assert.equal(f.previews[0]!.aborted, true);
  assert.equal(f.previews[1]!.aborted, false);
  f.ui.render([]);
  assert.equal(f.previews[1]!.aborted, true);
});
await test('the accepted attachment check keeps the local preview until verified history reconciles it', (t) => {
  const f = fixture(t);
  const draft: SubmittedMedia = {
    id: crypto.randomUUID(),
    peer: 'peer',
    createdAt: 1700000000000,
    viewOnce: false,
    phase: 'sending',
    progress: 0.25,
    content: {
      version: 1,
      name: 'test.bin',
      type: 'application/octet-stream',
      caption: '',
      image: false,
      thumbnail: null,
      file: {
        encryption: '{}',
        ref: {
          id: crypto.randomUUID(),
          hash: 'a'.repeat(64),
          bytes: 1,
          parts: [{ hash: 'a'.repeat(64), bytes: 1 }],
        },
      },
    },
  };
  f.media.push(draft);
  f.ui.render([]);
  const bubble = f.history.querySelectorAll('[data-outgoing-media]')[0]!;
  assert.equal(f.previews.length, 1);
  assert.equal(bubble.querySelector('.message-checks'), null);
  draft.phase = 'accepted';
  f.ui.render([]);
  assert.equal(f.history.querySelectorAll('[data-outgoing-media]')[0], bubble);
  assert.equal(
    bubble.querySelector('svg')?.getAttribute('aria-label'),
    translate('Accepted by the server; recipient receipt is not yet confirmed'),
  );
  assert.equal(f.previews[0]!.aborted, false);
  f.ui.render([row(draft.id, true)]);
  assert.equal(f.history.querySelectorAll('[data-outgoing-media]').length, 0);
  assert.equal(
    f.history
      .querySelectorAll('[data-message]')
      .filter((node) => node.dataset['message'] === draft.id).length,
    1,
  );
  assert.equal(f.previews[0]!.aborted, true);
});
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
  assert.equal(bubble.querySelector('script'), null);
  // One check from the start; the stage is only the icon's accessible label.
  const check = bubble.querySelector('svg')!;
  assert.match(check.getAttribute('class') ?? '', /message-checks/u);
  assert.doesNotMatch(
    bubble.textContent.replace(check.textContent, ''),
    /Sending|Saving|Updating history/u,
  );
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

await test('an optimistic reply quotes the current verified edit rather than the original serialized text', (t) => {
  const f = fixture(t),
    original = { ...row(crypto.randomUUID()), author: 'peer' };
  const edit = {
    ...row(crypto.randomUUID()),
    author: 'peer',
    relation: {
      type: 'edit' as const,
      id: original.id,
      hash: original.hash,
      author: 'peer',
    },
    text: encodeDailyText({
      text: 'Edited original',
      reply: null,
      forwarded: false,
    }),
  };
  const draft = {
    id: crypto.randomUUID(),
    peer: 'peer',
    text: encodeDailyText({
      text: 'My reply',
      reply: original.id,
      forwarded: false,
    }),
  };
  f.outgoing.update(draft, 'admitted');
  f.ui.render([original]);
  f.ui.render([original, edit]);
  const bubble = f.history.children.find(
    (node) => node.dataset['message'] === draft.id,
  )!;
  assert.match(bubble.textContent, /Edited original/u);
  assert.match(bubble.textContent, /My reply/u);
});
await test('verified window renders; null gate removes old rows and never exposes an intermediate history', (t) => {
  const f = fixture(t);
  f.ui.render([row('incoming')]);
  assert.equal(f.gate.hidden, true);
  assert.equal(f.history.hidden, false);
  assert.match(f.history.textContent, /Synthetic message/u);
  f.ui.render(null);
  assert.equal(f.gate.hidden, true);
  assert.equal(f.gate.textContent, '');
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
  assert.equal(f.receipts.length, 1);
  assert.deepEqual(f.receipts[0]?.outgoing, ['own']);
  assert.deepEqual([...f.receipts[0].read], ['own']);
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
  assert.equal(
    f.receipts.length,
    1,
    'stale receipts cannot update the contact preview',
  );
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

await test('hidden updates preserve nodes and resources until return; deletion closes even while hidden', (t) => {
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

await test('editing, reaction and deletion preserve unaffected message nodes', (t) => {
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

await test('reply updates its quotation when the original changes and preserves other bubbles', (t) => {
  const f = fixture(t),
    original = row(crypto.randomUUID()),
    other = row('other'),
    reply = {
      ...row('reply'),
      text: encodeDailyText({
        text: 'Reply',
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

for (const language of ['en', 'zh-CN'] as const)
  await test(`initial history loading is visible once per selection; revalidation stays quiet in ${language}`, (t) => {
    const f = fixture(t);
    setActiveLanguage(language);
    t.after(() => setActiveLanguage('en'));
    f.ui.render(null);
    assert.equal(f.history.hidden, true);
    assert.equal(f.gate.hidden, false);
    assert.equal(
      f.gate.textContent,
      translate(
        'Syncing messages… History opens after updates and deletions are checked.',
      ),
    );
    // A verified empty conversation has finished its first load too.
    f.ui.render([]);
    assert.equal(f.history.hidden, false);
    assert.equal(f.gate.hidden, true);
    for (const next of [
      [row('incoming')],
      [{ ...row('incoming'), text: 'Edited message' }],
      [],
    ]) {
      f.ui.render(null);
      assert.equal(
        f.history.hidden,
        true,
        'Concealment still follows the authority gate',
      );
      assert.equal(
        f.gate.hidden,
        true,
        'Revalidation must not announce another initial load',
      );
      assert.equal(f.gate.textContent, '');
      f.ui.render(next);
      assert.equal(f.history.hidden, false);
      assert.equal(f.gate.hidden, true);
    }
    f.select('another-peer');
    f.ui.render(null);
    assert.equal(
      f.gate.hidden,
      false,
      'A new selection needs its own first load',
    );
    f.ui.render([row('another-message')]);
    f.ui.clear();
    f.ui.render(null);
    assert.equal(
      f.gate.hidden,
      false,
      'Session reset cannot inherit the previous loading state',
    );
    f.deselect();
    f.ui.render(null);
    assert.equal(
      f.gate.hidden,
      true,
      'No conversation means no history loading indicator',
    );
  });
await test('an own message the server accepted shows one gray check instead of the delivery state text', (t) => {
  const f = fixture(t),
    accepted: MessageView = {
      ...row('accepted', true),
      state: 'Aceita · entrega por aparelho pendente',
    };
  delete accepted.delivery;
  f.ui.render([accepted]);
  const meta = f.history.children[0]!.querySelector('.message-meta')!;
  const icon = meta.children[0]!;
  assert.match(icon.getAttribute('class')!, /gray/u);
  // Only the check remains; its accessible label is not visible text.
  assert.equal(meta.textContent, icon.textContent);
});

await test('desktop delete enters the same author-only selection and confirms all selected messages once', async (t) => {
  const batches: string[][] = [];
  const f = fixture(t, {
    remove: (views) => {
      batches.push(views.map((view) => view.id));
      return Promise.resolve(
        views.map(({ id }) => ({ id, status: 'fulfilled', value: undefined })),
      );
    },
  });
  t.after(() => f.ui.clear());
  const parent = new ChatNode();
  parent.append(f.history);
  f.ui.render([row('first', true), row('second', true), row('incoming')]);
  const remove = f.history
    .querySelectorAll('button')
    .find((button) => button.textContent === 'Delete for both')!;
  remove.click();
  await f.lastAction();
  assert.deepEqual(batches, [], 'opening selection must not delete on desktop');
  const choices = f.history.querySelectorAll('.message-select');
  assert.equal(choices.length, 2, 'incoming messages cannot be selected');
  choices[1]!.checked = true;
  choices[1]!.dispatchEvent(new Event('change'));
  parent
    .querySelector('.message-selection-toolbar')!
    .querySelectorAll('button')[1]!
    .click();
  assert.deepEqual(batches, [['first', 'second']]);
});

await test('private Edit targets the latest verified text and preserves its draft through refresh and gate closure', async (t) => {
  const edits: { id: string; text: string; reply: string | null }[] = [];
  const f = fixture(t, {
    edit: (view, text) => {
      edits.push({ id: view.id, text, reply: view.content.reply });
      return Promise.resolve();
    },
  });
  const quoted = crypto.randomUUID();
  const original = {
    ...row(crypto.randomUUID(), true),
    author: 'self',
    text: encodeDailyText({
      text: 'Original text',
      reply: quoted,
      forwarded: false,
    }),
  };
  const edit = {
    ...row(crypto.randomUUID(), true),
    author: 'self',
    sequence: 2,
    text: encodeDailyText({
      text: 'Latest text',
      reply: quoted,
      forwarded: false,
    }),
    relation: {
      type: 'edit' as const,
      id: original.id,
      hash: original.hash,
      author: 'self',
    },
  };
  f.ui.render([original, edit]);
  const bubble = f.history.children.find(
    (node) => node.dataset['message'] === original.id,
  )!;
  bubble
    .querySelectorAll('button')
    .find((button) => button.textContent === translate('Edit'))!
    .click();
  await f.lastAction();
  const input = bubble.querySelector('textarea')!;
  assert.equal(input.value, 'Latest text');
  input.value = 'New edit';
  input.dispatchEvent(new Event('input'));
  f.ui.render([original, edit, row('incoming')]);
  assert.equal(bubble.querySelector('textarea')!.value, 'New edit');
  bubble
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(edits, [
    { id: original.id, text: 'New edit', reply: quoted },
  ]);
  bubble
    .querySelectorAll('button')
    .find((button) => button.textContent === translate('Edit'))!
    .click();
  await f.lastAction();
  f.ui.render(null);
  assert.equal(bubble.querySelector('textarea'), null);
  assert.equal(f.history.querySelector('textarea'), null);
});
