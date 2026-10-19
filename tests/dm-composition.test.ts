import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmComposition } from '../src/client/communities/dm-composition.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

class CompositionNode extends CommunityNode {
  focus() {}
}

await test('canceling public DM editing empties the composer without changing the original or unrelated drafts', (t) => {
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
  let inputs = 0,
    changed = 0;
  text.addEventListener('input', () => {
    inputs++;
  });
  composition.bind(
    form as unknown as HTMLElement,
    text as unknown as HTMLTextAreaElement,
    () => {
      changed++;
    },
  );
  const original: Parameters<DmComposition['choose']>[0] = {
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
  composition.choose(original);
  assert.equal(text.value, original.displayText);
  text.value = 'Unsaved change';
  form.querySelector('button')!.click();
  assert.equal(text.value, '');
  assert.equal(composition.target, null);
  assert.equal(form.querySelector('div')!.hidden, true);
  assert.equal(original.text, 'Original message');
  assert.equal(inputs, 2);
  assert.equal(changed, 1);
  text.value = 'A new draft';
  composition.cancel();
  assert.equal(text.value, 'A new draft');
});
