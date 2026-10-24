import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIncrementalWindow } from '../src/client/messages/incremental-window.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import type { MessageView } from '../src/client/messages/controller.ts';

const account = crypto.randomUUID(),
  peer = crypto.randomUUID();
const from = { revision: 1, contacts: 1, directory: 'a'.repeat(64) };
const snapshot = { ...from, revision: 2 };
function item(sequence: number): MessageItem {
  return {
    id: crypto.randomUUID(),
    hash: 'b'.repeat(64),
    kind: 'text',
    sender: peer,
    recipient: account,
    sequence,
    sender_revision: 1,
    recipient_revision: 1,
    deleted: false,
    deletion: null,
    queue_active: false,
    status: 'received',
  };
}
function view(row: MessageItem): MessageView {
  return {
    id: row.id,
    hash: row.hash,
    kind: row.kind,
    peer,
    own: false,
    author: peer,
    sequence: row.sequence,
    state: 'received',
    text: 'Synthetic content',
    ...(row.relation ? { relation: row.relation } : {}),
  };
}
function fixture(changes: MessageItem[], views: MessageView[]) {
  const opened: string[] = [],
    removed: string[] = [],
    delivered: string[] = [];
  return {
    opened,
    removed,
    delivered,
    input: {
      candidate: { snapshot: JSON.stringify(from), views },
      snapshot,
      account,
      peer,
      floor: null,
      api: () =>
        Promise.resolve({
          reset: false,
          from,
          snapshot,
          items: changes,
          next: null,
        }),
      remove: (row: MessageItem) => {
        removed.push(row.id);
        return Promise.resolve();
      },
      read: (rows: MessageItem[]) => {
        opened.push(...rows.map((row) => row.id));
        return Promise.resolve(rows.map(view));
      },
      delivery: (rows: MessageView[]) => {
        delivered.push(...rows.map((row) => row.id));
        return Promise.resolve(rows);
      },
    },
  };
}

await test('deleting one root validates its tombstone and removes only that root and its actions', async () => {
  const original = item(1),
    intact = view(item(2)),
    edit = item(3);
  edit.relation = {
    id: original.id,
    hash: original.hash,
    author: peer,
    type: 'edit',
  };
  const f = fixture(
    [{ ...original, deleted: true }],
    [view(original), intact, view(edit)],
  );
  const result = await readIncrementalWindow(f.input);
  assert.deepEqual(f.removed, [original.id]);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.delivered, []);
  assert.deepEqual(result?.views, [intact]);
  assert.equal(result?.views[0], intact);
});

await test('a failed deletion proof prevents reading or returning a new projection', async () => {
  const original = item(1),
    f = fixture([{ ...original, deleted: true }, item(2)], [view(original)]);
  f.input.remove = () => Promise.reject(new Error('Unauthenticated deletion.'));
  await assert.rejects(
    readIncrementalWindow(f.input),
    /Unauthenticated deletion/,
  );
  assert.deepEqual(f.opened, []);
});

await test('new and edited packets open only affected content while preserving existing row objects', async () => {
  const original = item(1),
    intact = view(item(2)),
    added = item(3),
    edit = item(4);
  edit.relation = {
    id: original.id,
    hash: original.hash,
    author: peer,
    type: 'edit',
  };
  const originalView = view(original),
    f = fixture([added, edit], [originalView, intact]);
  const result = await readIncrementalWindow(f.input);
  assert.deepEqual(f.opened, [added.id, edit.id]);
  assert.deepEqual(f.delivered, [added.id, edit.id]);
  assert.equal(result?.views[0], originalView);
  assert.equal(result?.views[1], intact);
});

await test('unrelated changes do not read packets and a reset requires the full verification path', async () => {
  const intact = view(item(1)),
    other = { ...item(2), sender: crypto.randomUUID() };
  const f = fixture([other], [intact]);
  assert.deepEqual((await readIncrementalWindow(f.input))?.views, [intact]);
  assert.deepEqual(f.opened, []);
  const reset = await readIncrementalWindow({
    ...f.input,
    api: () => Promise.resolve({ reset: true }),
  });
  assert.equal(reset, null);
});

await test('a burst reads only the newest bounded window and never silently truncates its actions', async () => {
  const rows = Array.from({ length: 30 }, (_, index) => item(index + 1));
  const f = fixture(rows, []);
  const result = await readIncrementalWindow(f.input);
  assert.deepEqual(
    f.opened,
    rows.slice(-16).map((row) => row.id),
  );
  assert.equal(result?.views.length, 16);
  const root = item(1);
  const actions = Array.from({ length: 49 }, (_, index) => ({
    ...item(index + 2),
    relation: {
      id: root.id,
      hash: root.hash,
      author: peer,
      type: 'edit' as const,
    },
  }));
  const overflow = fixture(actions, [view(root)]);
  assert.equal(await readIncrementalWindow(overflow.input), null);
  assert.deepEqual(overflow.opened, []);
});
