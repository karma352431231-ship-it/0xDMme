import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { MessageForwardSelection } from '../src/client/messages/forward-selection.ts';
import { dailyViews } from '../src/client/daily-text/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
class Node extends ChatNode {
  showModal() {}
  close() {
    this.dispatchEvent(new Event('close'));
  }
  focus() {}
}
await test('multi-message forward retries the staged item once, preserves order and cancels on gate closure', async (t) => {
  const body = new Node('body'),
    history = new Node('div');
  body.append(history);
  const create = (tag: string) => new Node(tag);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body, createElement: create },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  const signal = new AbortController();
  const views = dailyViews(
    ['one', 'two'].map((id, i) => ({
      id,
      hash: 'a'.repeat(64),
      kind: 'text',
      peer: 'peer',
      own: true,
      text: id,
      sequence: i,
    })),
  );
  for (const view of views) {
    const row = new Node('article');
    row.dataset['message'] = view.id;
    history.append(row);
  }
  const staged: string[] = [],
    sent: string[] = [],
    errors: unknown[] = [];
  let failed = false;
  const selection = new MessageForwardSelection({
    history: () => history as unknown as HTMLElement,
    views: () => views,
    signal: () => signal.signal,
    directory: {
      contacts: () => [
        { id: 'recipient', title: 'My custom name', seed: 'peer' },
      ],
      profile: () => Promise.resolve(null),
      more: () => false,
      loadMore: () => Promise.resolve(),
    },
    run: async (work) => {
      try {
        await work();
      } catch (error) {
        errors.push(error);
      }
    },
    stage: (view, peer) => {
      staged.push(view.id + ':' + peer);
      return Promise.resolve();
    },
    flush: () => {
      if (!failed) {
        failed = true;
        return Promise.reject(new Error('Interrupted'));
      }
      sent.push('sent');
      return Promise.resolve();
    },
  });
  selection.start(views[0]!);
  const second = history.children[1]!.querySelector('.forward-select')!;
  second.checked = true;
  second.dispatchEvent(new Event('change'));
  assert.match(
    body.querySelector('.forward-selection')!.textContent,
    /2 selected/,
  );
  const forward = () =>
    body.querySelector('.forward-selection')!.children.at(-1)!.click();
  const choose = () => body.querySelector('.forward-contact')!.click();
  forward();
  assert.match(
    body.querySelector('.forward-contact')!.textContent,
    /My custom name/,
  );
  choose();
  await setImmediate();
  assert.equal(errors.length, 1);
  assert.deepEqual(staged, ['one:recipient']);
  forward();
  choose();
  await setImmediate();
  assert.deepEqual(staged, ['one:recipient', 'two:recipient']);
  assert.equal(sent.length, 2);
  assert.equal(body.querySelector('.forward-selection'), null);
  selection.start(views[0]!);
  signal.abort();
  assert.equal(body.querySelector('.forward-selection'), null);
  assert.equal(history.querySelector('.forward-select'), null);
});
