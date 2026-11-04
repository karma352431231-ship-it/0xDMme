import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageDeletionSelection } from '../src/client/message-selection/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
await test('deletion starts with checkboxes; cancellation has no effect; failed batches keep the unconfirmed selection', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new ChatNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const parent = new ChatNode(),
    history = new ChatNode();
  parent.append(history);
  const first = new ChatNode('article'),
    second = new ChatNode('article');
  history.append(first, second);
  const removed: string[] = [],
    errors: unknown[] = [];
  let pending = Promise.resolve();
  const selection = new MessageDeletionSelection((work) => {
    pending = work().catch((error: unknown) => {
      errors.push(error);
    });
    return pending;
  });
  selection.update(history as unknown as HTMLElement, [
    {
      id: 'first',
      row: first as unknown as HTMLElement,
      remove: () => {
        removed.push('first');
        return Promise.resolve();
      },
    },
    {
      id: 'second',
      row: second as unknown as HTMLElement,
      remove: () => Promise.reject(new Error('Synthetic refusal')),
    },
  ]);
  selection.begin('first');
  assert.deepEqual(removed, []);
  assert.equal(history.querySelectorAll('.message-select').length, 2);
  parent.querySelector('button')!.dispatchEvent(new Event('click'));
  assert.equal(history.querySelectorAll('.message-select').length, 0);
  selection.begin('first');
  const other = second.querySelector('.message-select')!;
  other.checked = true;
  other.dispatchEvent(new Event('change'));
  parent.querySelectorAll('button')[1]!.dispatchEvent(new Event('click'));
  await pending;
  assert.deepEqual(removed, ['first']);
  assert.equal(errors.length, 1);
  assert.equal(second.querySelector('.message-select')!.checked, true);
  assert.equal(first.querySelector('.message-select')!.checked, false);
  selection.clear();
  assert.equal(parent.querySelectorAll('button').length, 0);
});
