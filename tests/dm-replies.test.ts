import { deferred } from './fixtures/deferred.ts';
import { expectedInterruption } from '../src/client/synchronization-work/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeDailyText } from '../src/shared/daily/index.ts';
import { DmSending } from '../src/client/communities/dm-sending.ts';
import { DmComposition } from '../src/client/communities/dm-composition.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

await test('a handle reply preserves typed text and cancellation', (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new CommunityNode(tag) },
  });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const form = new CommunityNode('form');
  const text = Object.assign(new CommunityNode('textarea'), { focus() {} });
  text.value = 'Existing draft';
  const composition = new DmComposition();
  composition.bind(
    form as unknown as HTMLElement,
    text as unknown as HTMLTextAreaElement,
    () => {},
  );
  const message: Parameters<DmComposition['reply']>[0] = {
    type: 'dm-message',
    id: crypto.randomUUID(),
    hash: 'synthetic',
    self: 'self',
    peer: { id: 'peer', handle: 'peer', avatar: null },
    sequence: 1,
    own: false,
    kind: 'text',
    media: null,
    text: 'Original',
    displayText: 'Original',
  };
  composition.reply(message);
  assert.equal(composition.replying, message);
  assert.equal(text.value, 'Existing draft');
  const next = {
    ...message,
    id: crypto.randomUUID(),
    own: true,
    displayText: 'Other original',
  };
  composition.reply(next);
  assert.equal(composition.replying, next);
  assert.equal(text.value, 'Existing draft');
  composition.cancel();
  assert.equal(composition.replying, null);
  assert.equal(text.value, 'Existing draft');
  composition.reply(message);
  assert.equal(text.value, 'Existing draft');
});

await test('handle reply sends the existing encrypted reply envelope and retries with the same admission ID', async () => {
  const calls: { text: string; id: string }[] = [];
  let fail = true;
  const sender = new DmSending({
    send: (_peer: string, text: string, id: string) => {
      calls.push({ text, id });
      return fail
        ? Promise.reject(new Error('Synthetic send failure'))
        : Promise.resolve();
    },
  } as unknown as ConstructorParameters<typeof DmSending>[0]);
  const original = crypto.randomUUID();
  const input = {
    text: 'A reply',
    media: null,
    pending: false,
    replying: original,
  };
  await assert.rejects(sender.send('peer', input), /Synthetic send failure/u);
  fail = false;
  await sender.send('peer', input);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.id, calls[1]!.id);
  assert.deepEqual(decodeDailyText(calls[1]!.text), {
    text: 'A reply',
    reply: original,
    forwarded: false,
  });
  await sender.send('peer', { ...input, text: 'Next', replying: null });
  assert.equal(calls[2]!.text, 'Next');
  assert.notEqual(calls[2]!.id, calls[1]!.id);
});

await test('a staged media send cannot resume under a new conversation or session generation', async () => {
  const staged = deferred<void>();
  let publications = 0;
  const sending = new DmSending({
    stageMedia: () => staged.promise,
    sendMedia: () => {
      publications++;
      return Promise.resolve();
    },
    send: () => Promise.resolve(),
  });
  const pending = sending.send('original-peer', {
    text: 'Caption',
    pending: false,
    media: {
      media: 'photo',
      selection: {
        name: 'synthetic.png',
        type: 'image/png',
        image: true,
        bytes: new Uint8Array([1]),
        thumbnail: null,
      },
    },
  });
  sending.reset();
  staged.resolve();
  await assert.rejects(pending, expectedInterruption);
  assert.equal(publications, 0);
});
