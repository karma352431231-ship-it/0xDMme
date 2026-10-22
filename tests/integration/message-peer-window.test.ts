import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import type { MessageSyncSnapshot } from '../../src/shared/message-sync/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  admissionPacket,
  messagePair,
  messageUser,
} from '../fixtures/message-allocation-database.ts';
import type { MessageUser } from '../fixtures/message-allocation-database.ts';
import { proof } from '../fixtures/message-removal-database.ts';
import { MessageIndex } from '../../src/client/messages/index-sync.ts';
import { readPeerWindow } from '../../src/client/messages/peer-window.ts';
const hash = 'a'.repeat(64);

function scan(
  c: MessageReceiptFixture,
  reader: MessageUser,
  window: {
    snapshot: MessageSyncSnapshot;
    peer: string;
    before: number | null;
  },
) {
  return new MessageIndex().read({
    snapshot: window.snapshot,
    account: reader.session.accountId,
    selected: window.peer,
    before: window.before,
    api: (operation, data) => {
      assert.equal(operation, 'page');
      return c.db.messages.page(reader, {
        snapshot: window.snapshot,
        after: Number(data['after']),
      });
    },
    deleted: () => Promise.resolve(),
    pagesPerTurn: 1000,
  });
}
function selected(
  c: MessageReceiptFixture,
  reader: MessageUser,
  window: {
    snapshot: MessageSyncSnapshot;
    peer: string;
    before: number | null;
  },
) {
  return readPeerWindow({
    ...window,
    account: reader.session.accountId,
    api: (operation, data) => {
      assert.equal(operation, 'sync-peer-window');
      return c.db.messages.syncPeerWindow(reader, {
        snapshot: window.snapshot,
        peer: String(data['peer']),
        before: data['before'] as number | null,
      });
    },
    deleted: () => Promise.resolve(),
  });
}

await test('a selected conversation window matches the complete scan at the same cut', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c),
    other = await messageUser(c),
    reader = pair.recipient,
    peer = pair.sender.session.accountId;
  await c.inspector.query(
    "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
    [other.session.accountId, reader.session.accountId],
  );
  const reply = { sender: pair.recipient, recipient: pair.sender },
    roots: MessagePacket[] = [];
  for (let n = 0; n < 30; n++) {
    const from = n % 3 === 2 ? reply : pair,
      packet = admissionPacket(from);
    await c.db.messages.admit(from.sender, packet, hash);
    roots.push(packet);
    // Another conversation interleaves with every message of this one.
    await c.db.messages.admit(
      other,
      admissionPacket({ sender: other, recipient: reader }),
      hash,
    );
  }
  for (const from of [pair, reply])
    await c.db.messages.admit(
      from.sender,
      { ...admissionPacket(from), kind: 'profile' },
      hash,
    );
  const latest = roots.at(-2)!,
    removed = roots.at(-5)!;
  assert.equal(latest.sender, peer);
  assert.equal(removed.sender, peer);
  await c.db.messages.admit(
    pair.sender,
    {
      ...admissionPacket(pair),
      relation: { id: latest.id, hash, author: peer, type: 'edit' },
    },
    hash,
  );
  await c.db.messages.remove(pair.sender, removed.id, hash, {
    ...proof(pair.sender),
    signature: Buffer.alloc(64, 1).toString('base64'),
  });
  const snapshot = await c.db.messages.syncState(reader, null);
  const newest = await selected(c, reader, { snapshot, peer, before: null });
  assert.equal(newest.filter((item) => item.kind === 'profile').length, 2);
  assert.equal(newest.filter((item) => item.kind !== 'profile').length, 16);
  assert.ok(!newest.some((item) => item.id === removed.id));
  assert.ok(newest.every((item) => !item.relation));
  const older = newest[6]!.sequence;
  for (const before of [null, older]) {
    const window = { snapshot, peer, before };
    assert.deepEqual(
      (await selected(c, reader, window)).map((item) => item.id),
      (await scan(c, reader, window)).map((item) => item.id),
      `Window before ${String(before)} matches the complete scan`,
    );
  }
  await c.db.messages.remove(pair.sender, latest.id, hash, {
    ...proof(pair.sender),
    signature: Buffer.alloc(64, 1).toString('base64'),
  });
  await assert.rejects(
    c.db.messages.syncPeerWindow(reader, { snapshot, peer, before: null }),
    { status: 409 },
    'A deletion after the cut rejects the old window',
  );
});
