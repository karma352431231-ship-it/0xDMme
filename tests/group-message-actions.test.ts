import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupMessageActions } from '../src/client/groups/message-actions.ts';
import type { GroupMessageActions } from '../src/client/groups/message-actions.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { setActiveLanguage, t as label } from '../src/shared/i18n/index.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';

for (const language of ['en', 'zh-CN'] as const)
  await test(`${language}: incoming and own group bubbles share actions, with mutation and view-once capabilities enforced`, async (t) => {
    setActiveLanguage(language);
    t.after(() => setActiveLanguage('en'));
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: (tag: string) => new ChatNode(tag),
        createElementNS: (_ns: string, tag: string) => new ChatNode(tag),
      },
    });
    t.after(() => Reflect.deleteProperty(globalThis, 'document'));
    const chosen: string[] = [];
    let writable = true;
    const actions: GroupMessageActions = {
      run: (work) => work(),
      choose: (mode) => {
        chosen.push(mode);
      },
      remove: () => Promise.resolve(),
      react: () => Promise.resolve(),
      picker: { choose: () => Promise.resolve(null) },
      peers: () => [],
      writable: () => writable,
      forward: () => {},
      forwardAllowed: () => true,
      canPin: () => false,
      pin: () => Promise.resolve(),
    };
    const view: GroupView = {
      id: crypto.randomUUID(),
      groupId: crypto.randomUUID(),
      sequence: 1,
      epoch: 1,
      hash: 'a'.repeat(64),
      sender: crypto.randomUUID(),
      own: false,
      kind: 'text',
      text: 'Visible text',
      unavailableMedia: [],
    };
    const render = (target: GroupView) => {
      const lifetime = new AbortController(),
        row = new ChatNode('article');
      t.after(() => lifetime.abort());
      return groupMessageActions({
        view: target,
        signal: lifetime.signal,
        row: row as unknown as HTMLElement,
        actions,
      }) as unknown as ChatNode;
    };
    const buttons = (row: ChatNode) =>
      row.querySelector('.message-menu')!.children;
    const received = render(view);
    assert.deepEqual(
      buttons(received).map((b) => b.textContent),
      [label('Reply'), label('Copy text'), label('React…'), label('Forward')],
    );
    buttons(received)
      .find((b) => b.textContent === label('Reply'))!
      .click();
    assert.deepEqual(chosen, ['reply']);
    const own = render({ ...view, own: true });
    assert.ok(buttons(own).some((b) => b.textContent === label('Edit')));
    assert.ok(
      buttons(own).some((b) => b.textContent === label('Delete for everyone')),
    );
    buttons(own)
      .find((b) => b.textContent === label('Edit'))!
      .click();
    await Promise.resolve();
    assert.deepEqual(chosen, ['reply', 'edit']);
    const once = render({
      ...view,
      own: true,
      contentFormat: 'daily',
      text: encodeDailyText({
        text: '',
        reply: null,
        forwarded: false,
        viewOnce: { hash: 'b'.repeat(64), policy: 'mobile' },
      }),
    });
    for (const key of ['Edit', 'Copy text', 'Forward'])
      assert.ok(!buttons(once).some((b) => b.textContent === label(key)));
    writable = false;
    assert.deepEqual(
      buttons(render({ ...view, own: true, localOnly: true })).map(
        (b) => b.textContent,
      ),
      [label('Copy text'), label('Forward')],
    );
  });
