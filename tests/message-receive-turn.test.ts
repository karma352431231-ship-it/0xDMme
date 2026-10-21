import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageReceiveTurn } from '../src/client/messages/receive-turn.ts';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import { MessageStorageError } from '../src/client/message-storage/index.ts';
import type { Api, MessageItem } from '../src/client/messages/history.ts';
const snapshot = { revision: 1 };
function rows(count: number): MessageItem[] {
  return Array.from({ length: count }, (_, n) => ({
    id: crypto.randomUUID(),
    sender: crypto.randomUUID(),
    recipient: crypto.randomUUID(),
    sequence: n + 1,
    kind: 'text',
    hash: 'a'.repeat(64),
    deleted: false,
    deletion: null,
    status: 'pending',
    queue_active: true,
    sender_revision: 1,
    recipient_revision: 1,
  }));
}
await test('50 peers share two bounded transport windows and acknowledge only supplied verified receipts', async () => {
  const items = rows(50),
    requests: { op: string; count: number }[] = [];
  const api: Api = (op, data) => {
    const ids = data['ids'] as string[] | undefined,
      receipts = data['items'] as unknown[] | undefined;
    requests.push({ op, count: ids?.length ?? receipts?.length ?? 0 });
    if (op === 'backup-window')
      return Promise.resolve({
        rows: ids!.map((id) => ({ id, packet: { id } })),
        recovery: [],
      });
    return Promise.resolve(null);
  };
  const turn = new MessageReceiveTurn({
    api,
    guard: () => {},
    cache: () => Promise.resolve(null),
    open: () => Promise.reject(new Error('Unused SDK')),
  });
  for (let offset = 0; offset < items.length;) {
    const count = await turn.prepare(snapshot, items.slice(offset));
    for (const item of items.slice(offset, offset + count)) {
      await turn.api('backup-window', { snapshot, ids: [item.id] });
      await turn.api('backup-ack', {
        snapshot,
        items: [{ id: item.id, hash: item.hash }],
      });
    }
    offset += count;
  }
  assert.equal(requests.filter((row) => row.op === 'backup-ack').length, 1);
  await turn.flush();
  turn.close();
  assert.deepEqual(requests, [
    { op: 'backup-window', count: 32 },
    { op: 'backup-ack', count: 32 },
    { op: 'backup-window', count: 18 },
    { op: 'backup-ack', count: 18 },
  ]);
});
await test('server byte cutoff leaves the unread suffix for another bounded window', async () => {
  const items = rows(12);
  let requests = 0;
  const turn = new MessageReceiveTurn({
    guard: () => {},
    cache: (_snapshot, item) =>
      Promise.resolve(item.id === items[0]!.id ? { id: item.id } : null),
    open: () => Promise.reject(new Error('Unused')),
    api: (_op, data) => {
      requests++;
      return Promise.resolve({
        rows: (data['ids'] as string[])
          .slice(0, 3)
          .map((id) => ({ id, packet: { id } })),
        recovery: [],
      });
    },
  });
  assert.equal(await turn.prepare(snapshot, items), 4);
  assert.equal(requests, 1);
  await assert.rejects(
    async () =>
      turn.api('backup-window', {
        snapshot: { revision: 2 },
        ids: [items[1]!.id],
      }),
    /another cut/,
  );
  await assert.rejects(
    async () => turn.api('backup-window', { snapshot, ids: [items[5]!.id] }),
    /outside/,
  );
  turn.close();
});
await test('one real SDK is leased per turn; cancellation cannot flush queued receipts', async () => {
  let opened = 0,
    closed = 0,
    cancelled = false,
    acks = 0;
  const turn = new MessageReceiveTurn({
    guard: () => {
      if (cancelled) throw new Error('Cancelled');
    },
    cache: () => Promise.resolve(null),
    api: (op) => {
      if (op === 'backup-ack') acks++;
      return Promise.resolve(null);
    },
    open: async () => {
      opened++;
      const machine = await MessageCrypto.create({
        accountId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        store: null,
        transport: () => Promise.reject(new Error('Unused')),
      });
      const close = machine.close.bind(machine);
      machine.close = () => {
        closed++;
        close();
      };
      return machine;
    },
  });
  assert.equal(await turn.sdk(), await turn.sdk());
  await turn.api('backup-ack', {
    snapshot: null,
    items: [{ id: crypto.randomUUID(), hash: 'a'.repeat(64) }],
  });
  cancelled = true;
  await assert.rejects(turn.flush(), /Cancelled/);
  turn.close();
  assert.equal(opened, 1);
  assert.equal(closed, 1);
  assert.equal(acks, 0);
});
await test('device storage failure stops a receive window before fetching more ciphertext', async () => {
  let requests = 0;
  const turn = new MessageReceiveTurn({
    guard: () => {},
    cache: () => Promise.reject(new MessageStorageError('Full')),
    open: () => Promise.reject(new Error('Unused')),
    api: () => {
      requests++;
      return Promise.resolve(null);
    },
  });
  await assert.rejects(turn.prepare(snapshot, rows(1)), MessageStorageError);
  assert.equal(requests, 0);
  turn.close();
});

await test('a corrupt cached peer is isolated without fetching its ciphertext again', async () => {
  const items = rows(2),
    requested: string[] = [];
  const turn = new MessageReceiveTurn({
    guard: () => {},
    open: () => Promise.reject(new Error('Unused')),
    cache: (_snapshot, item) => {
      if (item.id === items[0]!.id) throw new Error('Invalid verified cache');
      return Promise.resolve(null);
    },
    api: (_op, data) => {
      requested.push(...(data['ids'] as string[]));
      return Promise.resolve({
        rows: requested.map((id) => ({ id, packet: { id } })),
        recovery: [],
      });
    },
  });
  assert.equal(await turn.prepare(snapshot, items), 2);
  assert.deepEqual(requested, [items[1]!.id]);
  assert.throws(() => turn.cachedView(items[0]!.id), /Invalid verified cache/);
  turn.close();
});
