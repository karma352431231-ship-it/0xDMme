import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmDirectory } from '../src/client/communities/dm-directory.ts';
import { conversationPreview } from '../src/client/conversation-preview/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';

class DirectoryNode extends ChatNode {
  override querySelectorAll(selector: string): ChatNode[] {
    if (selector !== '[data-dm-peer-row]')
      return super.querySelectorAll(selector) as ChatNode[];
    return this.children.flatMap((node) => [
      ...('dmPeerRow' in node.dataset ? [node as ChatNode] : []),
      ...(node.querySelectorAll(selector) as ChatNode[]),
    ]);
  }
}
await test('lista pública atualiza a prévia sem abrir chat, reutiliza a linha e recusa resultado após invalidação', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new DirectoryNode(tag),
      createElementNS: (_ns: string, tag: string) => new DirectoryNode(tag),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const peer = { id: crypto.randomUUID(), handle: 'synthetic', avatar: null };
  const relation = {
    peer,
    requester: crypto.randomUUID(),
    state: 'approved' as const,
    revision: 1,
    blocked: false,
    blockRevision: 0,
    canSend: true,
  };
  let text = 'First',
    pending = false;
  const held = deferred<Map<string, ReturnType<typeof conversationPreview>>>();
  const values = () =>
    new Map([
      [
        peer.id,
        conversationPreview({
          id: 'message',
          kind: 'text',
          text,
          displayText: text,
          own: true,
          sentAt: 1760000000000,
          delivery: 'received',
          read: true,
        }),
      ],
    ]);
  const directory = new DmDirectory({
    list: () => Promise.resolve({ items: [relation] }),
    previews: () => (pending ? held.promise : Promise.resolve(values())),
  });
  const host = new DirectoryNode();
  await directory.mount(host as unknown as HTMLElement, () => true);
  const row = host.querySelector('a');
  assert.ok(row);
  assert.equal(row.textContent.includes('First'), true);
  text = 'New';
  await directory.refresh();
  assert.equal(host.querySelector('a'), row);
  assert.equal(row.textContent.includes('New'), true);
  assert.equal(row.querySelectorAll('time').length, 1);
  pending = true;
  const refresh = directory.refresh();
  await new Promise<void>((resolve) => setImmediate(resolve));
  directory.invalidate();
  held.resolve(values());
  await refresh;
  assert.equal(host.querySelector('a'), null);
  directory.clear();
  assert.equal(directory.available, false);
});
