import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupMessageActions } from '../src/client/groups/message-actions.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
class DialogNode extends ChatNode {
  open = false;
  showModal(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
  }
  focus(): void {}
}
await test('aviso vazio oculta editor, preserva rascunho intacto e descarta apenas a mensagem apagada', (t) => {
  const body = new DialogNode('body'),
    document = new DialogNode('#document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: Object.assign(document, {
      body,
      createElement: (tag: string) => new DialogNode(tag),
    }),
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'document'));
  const view: GroupView = {
    id: crypto.randomUUID(),
    groupId: crypto.randomUUID(),
    sequence: 1,
    epoch: 1,
    hash: 'a'.repeat(64),
    sender: crypto.randomUUID(),
    own: true,
    kind: 'text',
    text: 'Original',
    unavailableMedia: [],
  };
  const ui = new GroupMessageActions({
    run: (work) => work(),
    edit: () => Promise.resolve(),
    remove: () => Promise.resolve(),
  });
  const row = ui.render(
    view,
    new AbortController().signal,
  ) as unknown as DialogNode;
  row
    .querySelector('.message-menu')!
    .children.find((child) => child.textContent === 'Editar')!
    .click();
  const dialog = body.children[0] as DialogNode,
    text = dialog.querySelector('textarea')!;
  text.value = 'Meu rascunho não enviado';
  ui.pause();
  assert.equal(dialog.open, false);
  assert.equal(body.children[0], dialog);
  ui.resume([view]);
  assert.equal(dialog.open, true);
  assert.equal(text.value, 'Meu rascunho não enviado');
  ui.pause();
  ui.resume([]);
  assert.equal(body.children.length, 0);
});
