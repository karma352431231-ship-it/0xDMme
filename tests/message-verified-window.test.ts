import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VerifiedWindow,
  verifiedReceipt,
  verifiedReceiptHash,
  MessagePrefetch,
} from '../src/client/messages/index-sync.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import { assertPacketIdentity } from '../src/client/messages/history.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { messageStateText } from '../src/client/message-state/index.ts';

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

await test('confirmed window reuses only the same packet received by this device under the same authority', () => {
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

await test('cleanup and replacement discard the previous window; suspended or local content cannot be reused', () => {
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
    /exceed/,
  );
  assert.equal(cache.read(snapshot, received), null);
});

await test('Chinese presentation cannot make a suspended message reusable', (context) => {
  context.after(() => setActiveLanguage('en'));
  setActiveLanguage('zh-CN');
  const cache = new VerifiedWindow<typeof view>();
  const suspended = { ...view, state: 'Suspensa' };
  assert.equal(messageStateText(suspended.state), '已暂停');
  assert.equal(suspended.state, 'Suspensa');
  cache.remember(snapshot, [item], [suspended]);
  assert.equal(cache.read(snapshot, { ...item, status: 'received' }), null);
});

await test('encrypted copy from another conversation or after reload requires current packet, authority and receipt', () => {
  const payloadHash = 'e'.repeat(64);
  const sealed = verifiedReceipt(snapshot, item, payloadHash);
  const received = { ...item, status: 'received' as const };
  assert.equal(
    verifiedReceiptHash(sealed, { ...snapshot, revision: 2 }, received),
    payloadHash,
  );
  for (const status of ['pending', 'revoked', null] as const)
    assert.equal(
      verifiedReceiptHash(sealed, snapshot, { ...item, status }),
      null,
    );
  for (const change of [{ contacts: 2 }, { directory: 'c'.repeat(64) }])
    assert.equal(
      verifiedReceiptHash(sealed, { ...snapshot, ...change }, received),
      null,
    );
  for (const change of [
    { deleted: true },
    { id: crypto.randomUUID() },
    { hash: 'd'.repeat(64) },
    { recipient: crypto.randomUUID() },
    { sender_revision: 2 },
    { kind: 'profile' as const },
    { sequence: 2 },
    {
      relation: {
        type: 'edit' as const,
        id: item.id,
        hash: item.hash,
        author: item.sender,
      },
    },
  ])
    assert.equal(
      verifiedReceiptHash(sealed, snapshot, { ...received, ...change }),
      null,
    );
  assert.throws(
    () => verifiedReceiptHash('{}', snapshot, received),
    /[Ii]nvalid/,
  );
});

await test('global preparation resumes an interrupted page and restarts on snapshot change without skipping invalid pages', () => {
  const prefetch = new MessagePrefetch(),
    first = { items: [item], next: 1 };
  assert.equal(prefetch.cursor(snapshot), 0);
  assert.equal(prefetch.cursor(snapshot), 0);
  assert.throws(
    () => prefetch.commit(snapshot, { ...first, next: 2 }),
    /pagination/,
  );
  assert.equal(prefetch.cursor(snapshot), 0);
  prefetch.commit(snapshot, first);
  assert.equal(prefetch.cursor(snapshot), 1);
  prefetch.commit(snapshot, { items: [], next: null });
  assert.equal(prefetch.cursor(snapshot), null);
  assert.equal(prefetch.cursor({ ...snapshot, revision: 2 }), 0);
  assert.throws(() => prefetch.commit(snapshot, first), /changed/);
  prefetch.reset();
  assert.equal(prefetch.cursor(snapshot), 0);
});

await test('index cannot assign another author, recipient, type or revision to the authenticated packet', () => {
  const packet = {
    kind: item.kind,
    sender: item.sender,
    recipient: item.recipient,
    senderRevision: item.sender_revision,
    recipientRevision: item.recipient_revision,
  };
  assert.doesNotThrow(() => assertPacketIdentity(packet, item));
  const changes: Partial<MessageItem>[] = [
    { sender: item.recipient },
    { recipient: item.sender },
    { kind: 'profile' },
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
    assert.throws(
      () => assertPacketIdentity(packet, { ...item, ...change }),
      /differs from (?:the )?(?:group )?index/,
    );
});
