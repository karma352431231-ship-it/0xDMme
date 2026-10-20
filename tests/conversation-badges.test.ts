import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startConversationBadges } from '../src/client/app/conversation-badges.ts';
import { startRightColumn } from '../src/client/app/right-column.ts';
import { ChatNode } from './fixtures/chat-dom.ts';

await test('unread notifications belong to their Private/Public choice and never appear on the right Chat switch', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new ChatNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const privateChoice = new ChatNode('button'),
    publicChoice = new ChatNode('button');
  const shell = Object.assign(new ChatNode(), {
    querySelector: (selector: string) =>
      selector.includes('private') ? privateChoice : publicChoice,
  });
  const badge = startConversationBadges(shell as unknown as HTMLElement);
  const right = startRightColumn({
    shell: shell as unknown as HTMLElement,
    showRanking: () => {},
  });
  badge('private', 3);
  badge('public', 2);
  right.followRanking('users');
  assert.equal(privateChoice.children[0]?.textContent, '3');
  assert.equal(publicChoice.children[0]?.textContent, '2');
  assert.equal(
    privateChoice.children[0]?.getAttribute('aria-label'),
    '3 unread messages',
  );
  assert.equal(shell.children[0]?.textContent, 'ChatCommunitiesUsers');
  badge('private', 0);
  assert.equal(privateChoice.children[0]?.hidden, true);
  assert.equal(publicChoice.children[0]?.hidden, false);
});
