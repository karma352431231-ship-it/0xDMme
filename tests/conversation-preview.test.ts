import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ConversationPreviewLoader,
  conversationPreview,
  paintConversationPreview,
} from '../src/client/conversation-preview/index.ts';
import { messageTime } from '../src/client/message-presentation/index.ts';
import {
  currentLanguage,
  setActiveLanguage,
} from '../src/shared/i18n/index.ts';
import { readDirectoryPreviews } from '../src/client/messages/directory-previews.ts';
import { readDmDirectoryPreviews } from '../src/client/social-dm/directory-previews.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';

await test('última mensagem mostra texto e checks somente quando enviada; AM/PM independe do idioma', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    language = currentLanguage();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new ChatNode(tag),
      createElementNS: (_ns: string, tag: string) => new ChatNode(tag),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
    setActiveLanguage(language);
  });
  const sentAt = new Date(2026, 9, 15, 13, 4).getTime();
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    assert.equal(messageTime(sentAt)?.textContent, '01:04 PM');
    assert.equal(
      messageTime(new Date(2026, 9, 15, 7, 29).getTime())?.textContent,
      '07:29 AM',
    );
  }
  const copy = new ChatNode(),
    detail = new ChatNode('small');
  copy.append(detail);
  const preview = conversationPreview({
    id: crypto.randomUUID(),
    kind: 'text',
    text: 'old',
    displayText: 'Latest\nmessage',
    own: true,
    sentAt,
    delivery: 'received',
    read: true,
  });
  paintConversationPreview(copy as unknown as HTMLElement, preview);
  assert.equal(
    detail.querySelector('svg')?.getAttribute('class'),
    'message-checks green',
  );
  assert.equal(detail.textContent.includes('Latest message'), true);
  paintConversationPreview(copy as unknown as HTMLElement, {
    ...preview,
    own: false,
  });
  assert.equal(detail.querySelector('svg'), null);
  assert.equal(copy.querySelectorAll('time').length, 1);
});

await test('troca de conta invalida prévia pendente; falha fecha as prévias sem simular sucesso', async () => {
  const pending =
    deferred<Map<string, ReturnType<typeof conversationPreview>>>();
  const loader = new ConversationPreviewLoader({
    load: () => pending.promise,
    changed: () => {},
  });
  const read = loader.refresh(['peer']);
  loader.clear();
  pending.resolve(
    new Map([
      [
        'peer',
        conversationPreview({
          id: 'old',
          kind: 'text',
          text: 'old',
          displayText: 'old',
          own: false,
        }),
      ],
    ]),
  );
  await read;
  assert.equal(loader.values.size, 0);
  const failed = new ConversationPreviewLoader({
    load: () => Promise.reject(new Error('permission changed')),
    changed: () => {},
  });
  await failed.refresh(['peer']);
  assert.equal(failed.failed, true);
  assert.equal(failed.values.size, 0);
});

await test('prévia privada usa o original atual e recibos próprios; não envia daily-read', async () => {
  const peer = crypto.randomUUID(),
    self = crypto.randomUUID(),
    id = crypto.randomUUID(),
    hash = 'a'.repeat(64);
  const item = {
    id,
    hash,
    kind: 'text' as const,
    sender: self,
    recipient: peer,
    sequence: 1,
    deleted: false,
    deletion: null,
    sender_revision: 1,
    recipient_revision: 1,
    queue_active: false,
    status: 'received',
  };
  const calls: string[] = [];
  const previews = await readDirectoryPreviews({
    peers: [peer],
    guard: () => {},
    read: () =>
      Promise.resolve([
        {
          id,
          hash,
          kind: 'text',
          peer,
          text: 'Sent from list',
          own: true,
          sequence: 1,
          author: self,
          state: 'Recebida',
          sentAt: 1760000000000,
        },
      ]),
    api: (operation) => {
      calls.push(operation);
      switch (operation) {
        case 'snapshot':
          return Promise.resolve({ revision: 1 });
        case 'preview':
          return Promise.resolve({ items: [item], next: null });
        case 'relations':
          return Promise.resolve({ items: [], next: null });
        case 'delivery':
          return Promise.resolve([
            { id, hash, queue_active: false, recipient_received: true },
          ]);
        case 'daily-receipts':
          return Promise.resolve([id]);
        case 'confirm':
          return Promise.resolve({ status: 'confirmed' });
        default:
          throw new Error(`Unexpected directory operation: ${operation}`);
      }
    },
  });
  assert.equal(previews.get(peer)?.text, 'Sent from list');
  assert.equal(previews.get(peer)?.read, true);
  assert.equal(calls.includes('daily-read'), false);
});

await test('prévia pública escolhe a última enviada ou recebida e consulta checks em um único lote', async () => {
  const peers = [crypto.randomUUID(), crypto.randomUUID()];
  const base = {
    type: 'dm-message' as const,
    self: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    kind: 'text' as const,
    media: null,
  };
  const rows = peers.map((id, index) => ({
    ...base,
    id: crypto.randomUUID(),
    peer: { id, handle: `peer${index}`, avatar: null },
    own: index === 0,
    sequence: index + 1,
    text: `latest${index}`,
    displayText: `latest${index}`,
  }));
  let queries = 0;
  const previews = await readDmDirectoryPreviews({
    peers,
    guard: () => {},
    cached: (peer) =>
      Promise.resolve({ items: rows.filter((row) => row.peer.id === peer) }),
    states: (own) => {
      queries++;
      assert.deepEqual(own, [rows[0]!.id]);
      return Promise.resolve([{ id: rows[0]!.id, received: true, read: true }]);
    },
  });
  assert.equal(queries, 1);
  assert.equal(previews.get(peers[0]!)?.read, true);
  assert.equal(previews.get(peers[1]!)?.text, 'latest1');
  assert.equal(previews.get(peers[1]!)?.delivery, undefined);
});
