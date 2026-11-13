import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageDeletionSelection } from '../src/client/message-selection/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';
import type { MessageRemovalResult } from '../src/client/message-removal-batch/index.ts';

function setup(
  t: TestContext,
  remove: (
    messages: readonly { id: string }[],
  ) => Promise<readonly MessageRemovalResult[]>,
) {
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
    second = new ChatNode('article'),
    incoming = new ChatNode('article');
  history.append(first, second, incoming);
  const errors: unknown[] = [];
  let pending = Promise.resolve();
  const selection = new MessageDeletionSelection<{ id: string }>(
    (work) => {
      pending = work().catch((error: unknown) => {
        errors.push(error);
      });
      return pending;
    },
    { remove },
  );
  t.after(() => selection.clear());
  const rows = [first, second].map((row, i) => ({
    message: { id: String(i) },
    row: row as unknown as HTMLElement,
  }));
  selection.update(history as unknown as HTMLElement, rows);
  return {
    selection,
    parent,
    history,
    first,
    second,
    incoming,
    rows,
    errors,
    pending: () => pending,
  };
}
function activate(history: ChatNode, target: ChatNode, type = 'click'): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  history.dispatchEvent(event);
  return event;
}
await test('selection captures the whole bubble, media, links and menus; cancellation restores normal activation', (t) => {
  const f = setup(t, () => Promise.reject(new Error('Not confirmed')));
  f.selection.begin('0');
  const media = new ChatNode('button');
  f.second.append(media);
  assert.equal(activate(f.history, media).defaultPrevented, true);
  assert.equal(f.second.querySelector('.message-select')!.checked, true);
  activate(f.history, f.first);
  assert.equal(f.first.querySelector('.message-select')!.checked, false);
  const hold = activate(f.history, media, 'contextmenu');
  assert.equal(hold.defaultPrevented, true);
  assert.equal(f.second.querySelector('.message-select')!.checked, true);
  assert.equal(activate(f.history, f.incoming).defaultPrevented, true);
  assert.equal(f.incoming.querySelector('.message-select'), null);
  f.parent.querySelector('button')!.click();
  assert.equal(f.history.querySelectorAll('.message-select').length, 0);
  assert.equal(activate(f.history, media).defaultPrevented, false);
});
await test('one confirmation submits the selection once; failed targets stay checked and repeated confirmation is blocked', async (t) => {
  const reply = deferred<readonly MessageRemovalResult[]>(),
    calls: string[][] = [];
  const f = setup(t, (messages) => {
    calls.push(messages.map((m) => m.id));
    return reply.promise;
  });
  f.selection.begin('0');
  activate(f.history, f.second);
  f.parent.querySelectorAll('button')[1]!.click();
  f.parent.querySelectorAll('button')[1]!.click();
  assert.deepEqual(calls, [['0', '1']]);
  activate(f.history, f.first);
  assert.equal(f.first.querySelector('.message-select')!.checked, true);
  reply.resolve([
    { id: '0', status: 'fulfilled', value: undefined },
    { id: '1', status: 'rejected', reason: new Error('Synthetic refusal') },
  ]);
  await f.pending();
  assert.equal(f.errors.length, 1);
  assert.equal(f.first.querySelector('.message-select')!.checked, false);
  assert.equal(f.second.querySelector('.message-select')!.checked, true);
});
await test('leaving a conversation disposes selection handlers and ignores a late batch completion', async (t) => {
  const reply = deferred<readonly MessageRemovalResult[]>();
  const f = setup(t, () => reply.promise);
  f.selection.begin('0');
  f.parent.querySelectorAll('button')[1]!.click();
  f.selection.clear();
  f.selection.update(f.history as unknown as HTMLElement, f.rows);
  f.selection.begin('1');
  reply.resolve([{ id: '0', status: 'fulfilled', value: undefined }]);
  await f.pending();
  assert.equal(f.second.querySelector('.message-select')!.checked, true);
  f.selection.clear();
  assert.equal(activate(f.history, f.first).defaultPrevented, false);
});
