import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VerifiedWindow } from '../src/client/messages/index-sync.ts';
import type { MessageItem } from '../src/client/messages/history.ts';

const snapshot = { revision: 1, directory: 'a'.repeat(64), contacts: 1 };
const item: MessageItem = {
  kind: 'text',
  id: crypto.randomUUID(),
  sender: crypto.randomUUID(),
  recipient: crypto.randomUUID(),
  sequence: 1,
  hash: 'b'.repeat(64),
  deleted: false,
  deletion: null,
  sender_revision: 1,
  recipient_revision: 1,
  queue_active: true,
  status: 'pending',
};
const view = {
  id: item.id,
  hash: item.hash,
  text: 'fictício',
  state: 'Aceita',
};

await test('janela confirmada reutiliza só o mesmo pacote recebido por este aparelho sob a mesma autoridade', () => {
  const cache = new VerifiedWindow<typeof view>();
  cache.remember(snapshot, [item], [view]);
  const received = { ...item, status: 'received' as const };
  assert.deepEqual(cache.read({ ...snapshot, revision: 2 }, received), view);
  assert.deepEqual(
    cache.read(snapshot, { ...received, queue_active: false }),
    view,
  );
  for (const status of ['pending', 'revoked', null] as const)
    assert.equal(cache.read(snapshot, { ...item, status }), null);
  for (const change of [{ contacts: 2 }, { directory: 'c'.repeat(64) }])
    assert.equal(cache.read({ ...snapshot, ...change }, received), null);
  const changes: Partial<MessageItem>[] = [
    { deleted: true },
    { id: crypto.randomUUID() },
    { hash: 'd'.repeat(64) },
    { sender: item.recipient },
    { recipient: item.sender },
    { kind: 'profile' },
    { sequence: 2 },
    { sender_revision: 2 },
    { recipient_revision: 2 },
    {
      relation: {
        type: 'edit',
        id: item.id,
        hash: item.hash,
        author: item.sender,
      },
    },
  ];
  for (const change of changes)
    assert.equal(cache.read(snapshot, { ...received, ...change }), null);
});

await test('limpeza e substituição descartam a janela anterior; conteúdo suspenso ou local não é reutilizável', () => {
  const cache = new VerifiedWindow<typeof view & { archived?: boolean }>();
  const received = { ...item, status: 'received' as const };
  for (const changed of [
    { ...view, state: 'Suspensa' },
    { ...view, archived: true },
  ]) {
    cache.remember(snapshot, [item], [changed]);
    assert.equal(cache.read(snapshot, received), null);
  }
  cache.remember(snapshot, [item], [view]);
  const result = cache.read(snapshot, received)!;
  result.text = 'não alterar o conteúdo confirmado';
  assert.equal(cache.read(snapshot, received)?.text, view.text);
  cache.clear();
  assert.equal(cache.read(snapshot, received), null);
  cache.remember(snapshot, [item], [view]);
  cache.remember(snapshot, [], []);
  assert.equal(cache.read(snapshot, received), null);
  assert.throws(
    () =>
      cache.remember(
        snapshot,
        Array.from({ length: 67 }, () => item),
        [view],
      ),
    /excedida/,
  );
  assert.equal(cache.read(snapshot, received), null);
});
