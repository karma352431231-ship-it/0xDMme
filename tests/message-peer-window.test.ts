import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPeerWindow } from '../src/client/messages/peer-window.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import type { MessageSyncSnapshot } from '../src/shared/message-sync/index.ts';

const account = crypto.randomUUID(),
  peer = crypto.randomUUID(),
  stranger = crypto.randomUUID();
const snapshot = {
  version: 2,
  account,
  device: crypto.randomUUID(),
  revision: 40,
  anchor: 40,
  invalidation: 0,
  contacts: 1,
  directory: 'b'.repeat(64),
  source: 'full',
} as MessageSyncSnapshot;

function row(sequence: number, change: Partial<MessageItem> = {}): MessageItem {
  return {
    kind: 'text',
    id: crypto.randomUUID(),
    sender: peer,
    recipient: account,
    sequence,
    hash: 'a'.repeat(64),
    deleted: false,
    deletion: null,
    sender_revision: 1,
    recipient_revision: 1,
    queue_active: false,
    status: 'received',
    ...change,
  };
}
function read(items: MessageItem[], before: number | null = null) {
  const deleted: MessageItem[] = [];
  return {
    deleted,
    result: readPeerWindow({
      api: () => Promise.resolve({ items, next: null }),
      snapshot,
      account,
      peer,
      before,
      deleted: (item) => {
        deleted.push(item);
        return Promise.resolve();
      },
    }),
  };
}

await test('the window publishes live profiles first, then the requested roots', async () => {
  const removed = row(1, {
      kind: 'profile',
      sender: account,
      recipient: peer,
      deleted: true,
    }),
    profile = row(2, { kind: 'profile' }),
    roots = [row(3), row(4, { sender: account, recipient: peer })];
  const { deleted, result } = read([removed, profile, ...roots]);
  assert.deepEqual(
    (await result).map((item) => item.id),
    [profile.id, ...roots.map((item) => item.id)],
  );
  assert.deepEqual(
    deleted.map((item) => item.id),
    [removed.id],
    'A removed profile is verified and purged, never published',
  );
});

for (const [name, items, before] of [
  ['another conversation', [row(3, { sender: stranger })], null],
  ['a row beyond the confirmed cut', [row(41)], null],
  [
    'a relation',
    [
      row(3, {
        relation: {
          id: crypto.randomUUID(),
          type: 'edit',
          hash: 'a'.repeat(64),
          author: peer,
        },
      }),
    ],
    null,
  ],
  ['a deleted root', [row(3, { deleted: true })], null],
  ['a root at or after the older-history cursor', [row(9)], 9],
  [
    'two profiles from one participant',
    [row(1, { kind: 'profile' }), row(2, { kind: 'profile' })],
    null,
  ],
  [
    'more than 16 roots',
    Array.from({ length: 17 }, (_, n) => row(n + 1)),
    null,
  ],
  ['rows out of order', [row(5), row(4)], null],
] as [string, MessageItem[], number | null][])
  await test(`the window rejects ${name}`, async () => {
    const { deleted, result } = read(items, before);
    await assert.rejects(result);
    assert.equal(deleted.length, 0);
  });

await test('the window rejects a continuation cursor', async () => {
  await assert.rejects(
    readPeerWindow({
      api: () => Promise.resolve({ items: [row(3)], next: 3 }),
      snapshot,
      account,
      peer,
      before: null,
      deleted: () => Promise.resolve(),
    }),
  );
});
