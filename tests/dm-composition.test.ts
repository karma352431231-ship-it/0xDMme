import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmComposition } from '../src/client/communities/dm-composition.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

class CompositionNode extends CommunityNode {
  focus() {}
}

await test('public DM replies preserve the new-message draft when chosen or canceled', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new CompositionNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const form = new CompositionNode('form'),
    text = new CompositionNode('textarea');
  const composition = new DmComposition();
  composition.bind(
    form as unknown as HTMLElement,
    text as unknown as HTMLTextAreaElement,
    () => {},
  );
  const original: Parameters<DmComposition['reply']>[0] = {
    type: 'dm-message',
    id: 'original',
    hash: 'synthetic',
    self: 'self',
    peer: { id: 'peer', handle: 'synthetic', avatar: null },
    sequence: 1,
    own: true,
    kind: 'text',
    media: null,
    text: 'Original message',
    displayText: 'Original message',
  };
  text.value = 'A new draft';
  composition.reply(original);
  assert.equal(text.value, 'A new draft');
  assert.equal(composition.replying?.id, original.id);
  form.querySelector('button')!.click();
  assert.equal(text.value, 'A new draft');
  assert.equal(composition.replying, null);
  assert.equal(form.querySelector('div')!.hidden, true);
  assert.equal(original.text, 'Original message');
  composition.reply(original);
  assert.equal(composition.unsent(), 'A new draft');
  assert.equal(composition.finish(), '');
  assert.equal(composition.replying, null);
});
