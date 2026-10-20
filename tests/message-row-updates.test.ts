import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExternalTextHistory } from '../src/client/external-media/index.ts';
import { messageRowKeys } from '../src/client/messages/row-keys.ts';
import { dailyViews } from '../src/client/daily-text/index.ts';
import type { MessageView } from '../src/client/messages/controller.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';

class Row {
  parent: Row | null = null;
  children: Row[] = [];
  get firstChild(): Row | null {
    return this.children[0] ?? null;
  }
  get nextSibling(): Row | null {
    return (
      this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null
    );
  }
  contains(row: Row): boolean {
    return this.children.includes(row);
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  insertBefore(row: Row, cursor: Row | null): void {
    row.remove();
    this.children.splice(
      cursor ? this.children.indexOf(cursor) : this.children.length,
      0,
      row,
    );
    row.parent = this;
  }
}
function message(id: string, reply: string | null = null): MessageView {
  return {
    id,
    kind: 'text',
    peer: 'peer',
    own: false,
    author: 'peer',
    text: encodeDailyText({ text: id, reply, forwarded: false }),
    hash: 'a'.repeat(64),
    state: 'Recebida e preservada',
  };
}
await test('editing replaces only the changed row and its reply; deletion retains unrelated DOM and releases removed resources', () => {
  const host = new Row(),
    history = new ExternalTextHistory();
  const signals = new Map<Row, AbortSignal>();
  const render = (messages: MessageView[]) => {
    const views = dailyViews(messages),
      keys = messageRowKeys(views);
    history.render(
      host as unknown as HTMLElement,
      views.map((view) => ({
        id: view.id,
        key: keys.get(view.id)!,
        render: (signal) => {
          const row = new Row();
          signals.set(row, signal);
          return row as unknown as HTMLElement;
        },
      })),
      new AbortController().signal,
    );
  };
  const a = message(crypto.randomUUID()),
    b = message(crypto.randomUUID()),
    reply = message(crypto.randomUUID(), a.id);
  render([a, b, reply]);
  const original = [...host.children];
  render([{ ...a, delivery: 'received' }, b, reply]);
  assert.deepEqual(
    host.children,
    original,
    'Receipt changes preserve every row',
  );
  const edited = {
    ...a,
    text: encodeDailyText({ text: 'edited', reply: null, forwarded: false }),
  };
  render([edited, b, reply]);
  assert.notEqual(host.children[0], original[0]);
  assert.equal(host.children[1], original[1]);
  assert.notEqual(host.children[2], original[2]);
  assert.equal(signals.get(original[0]!)?.aborted, true);
  const beforeRemoval = [...host.children];
  render([b, reply]);
  assert.equal(host.children[0], original[1]);
  assert.equal(signals.get(beforeRemoval[0]!)?.aborted, true);
  assert.notEqual(
    host.children[1],
    beforeRemoval[2],
    'A deleted quote must disappear',
  );
  history.clear();
  assert.equal(signals.get(original[1]!)?.aborted, true);
});
