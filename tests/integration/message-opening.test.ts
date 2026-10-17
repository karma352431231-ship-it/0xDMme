import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import {
  accept,
  message,
  snapshots,
  proof,
  target,
} from '../fixtures/message-removal-database.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const hash = 'a'.repeat(64);
async function missing(c: MessageReceiptFixture, pair: Pair, id: string) {
  await c.inspector.query(
    'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
    [id, pair.recipient.session.accountId],
  );
  await c.inspector.query(
    'UPDATE hash_talk.message_packets SET charge=charge-256 WHERE id=$1',
    [id],
  );
}
async function accountingCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'a missing reference adds exactly 256 global bytes; existing references open under ledger and coordinator contention with no growth room',
    async () => {
      const packet = await accept(c, pair);
      await missing(c, pair, packet.id);
      const snapshot = await c.db.messages.snapshot(pair.recipient),
        before = await globalBytes(c.inspector),
        row = await message(c, packet.id);
      assert.deepEqual(
        await c.db.messages.object(pair.recipient, packet.id, snapshot),
        packet,
      );
      assert.equal(await globalBytes(c.inspector), before + 256n);
      assert.equal((await message(c, packet.id)).charge, row.charge + 256);
      const unchanged = await snapshots(c);
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
        );
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        await c.writer.query(
          'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
        );
        c.room.bytes = 0n;
        assert.deepEqual(
          await c.db.messages.object(pair.recipient, packet.id, snapshot),
          packet,
        );
        assert.deepEqual(
          await c.db.messages.backupWindow(
            pair.recipient,
            [packet.id],
            snapshot,
          ),
          [{ id: packet.id, packet }],
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
        await c.writer.query('ROLLBACK');
      }
      assert.deepEqual(await snapshots(c), unchanged);
    },
  );
  await t.test(
    'an export with a later foreign object rolls back its earlier charged reference',
    async () => {
      const packet = await accept(c, pair),
        other = await messagePair(c),
        foreign = await accept(c, other);
      await missing(c, pair, packet.id);
      const before = await snapshots(c),
        snapshot = await c.db.messages.snapshot(pair.recipient);
      await assert.rejects(
        c.db.messages.backupWindow(
          pair.recipient,
          [packet.id, foreign.id],
          snapshot,
        ),
        { status: 404 },
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'growth still fails physical admission and rolls back the new reference',
    async () => {
      const packet = await accept(c, pair);
      await missing(c, pair, packet.id);
      const before = await snapshots(c),
        snapshot = await c.db.messages.snapshot(pair.recipient);
      c.room.bytes = 0n;
      try {
        await assert.rejects(
          c.db.messages.object(pair.recipient, packet.id, snapshot),
          { status: 503 },
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function authorizationCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'session, directory and signed snapshot failures retain priority over missing objects',
    async () => {
      const snapshot = await c.db.messages.snapshot(pair.recipient),
        id = crypto.randomUUID();
      await assert.rejects(
        c.db.messages.object(
          {
            ...pair.recipient,
            session: { ...pair.recipient.session, csrf: 'invalid' },
          },
          id,
          snapshot,
        ),
        { status: 401 },
      );
      await assert.rejects(
        c.db.messages.object(
          { ...pair.recipient, directory: '0'.repeat(64) },
          id,
          snapshot,
        ),
        { status: 409 },
      );
      await assert.rejects(
        c.db.messages.object(pair.recipient, id, {
          ...snapshot,
          revision: snapshot.revision + 1,
        }),
        { status: 409 },
      );
      await assert.rejects(c.db.messages.object(pair.recipient, id, snapshot), {
        status: 404,
      });
    },
  );
  await t.test(
    'received references preserve access after blocking; pending and revoked references require consent',
    async () => {
      const packet = await accept(c, pair);
      await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
      await c.inspector.query(
        "UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
        [packet.sender, packet.recipient],
      );
      const snapshot = await c.db.messages.snapshot(pair.recipient);
      try {
        assert.deepEqual(
          await c.db.messages.object(pair.recipient, packet.id, snapshot),
          packet,
        );
        for (const status of ['pending', 'revoked']) {
          await c.inspector.query(
            'UPDATE hash_talk.message_references SET status=$2 WHERE message_id=$1 AND account_id=$3',
            [packet.id, status, packet.recipient],
          );
          await assert.rejects(
            c.db.messages.object(pair.recipient, packet.id, snapshot),
            { status: 423 },
          );
          assert.deepEqual(
            await c.db.messages.backupWindow(
              pair.recipient,
              [packet.id],
              snapshot,
            ),
            [{ id: packet.id, unavailable: 423 }],
          );
        }
      } finally {
        await c.inspector.query(
          "UPDATE hash_talk.contact_relations SET state='approved' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          [packet.sender, packet.recipient],
        );
      }
    },
  );
  await t.test(
    'personal removal of an original also prevents opening its related action',
    async () => {
      const packet = await accept(c, pair),
        action = {
          ...admissionPacket(pair),
          relation: {
            type: 'edit' as const,
            id: packet.id,
            hash,
            author: packet.sender,
          },
        };
      await c.db.messages.admit(pair.sender, action, hash);
      await c.db.backups.clean(
        pair.recipient,
        proof(pair.recipient, [target(packet.id)]),
      );
      const snapshot = await c.db.messages.snapshot(pair.recipient);
      await assert.rejects(
        c.db.messages.object(pair.recipient, action.id, snapshot),
        { status: 410 },
      );
      assert.deepEqual(
        await c.db.messages.backupWindow(pair.recipient, [action.id], snapshot),
        [{ id: action.id, unavailable: 410 }],
      );
    },
  );
}
async function concurrencyCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'a multi-peer export locks every counterpart while independent opening progresses and rechecks revocation after waiting',
    async () => {
      const peer = await messageUser(c),
        second = { sender: peer, recipient: pair.recipient };
      await c.inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
        [peer.session.accountId, pair.recipient.session.accountId],
      );
      const first = await accept(c, pair),
        last = await accept(c, second),
        independent = await messagePair(c),
        other = await accept(c, independent);
      const snapshot = await c.db.messages.snapshot(pair.recipient),
        otherSnapshot = await c.db.messages.snapshot(independent.recipient);
      await c.writer.query('BEGIN');
      await c.writer.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [peer.session.accountId],
      );
      const holder = (
        await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const pending = c.db.messages.backupWindow(
          pair.recipient,
          [first.id, last.id],
          snapshot,
        ),
        rejected = assert.rejects(pending, { status: 409 });
      try {
        await waitForBlocked(c.inspector, holder);
        assert.deepEqual(
          await c.db.messages.object(
            independent.recipient,
            other.id,
            otherSnapshot,
          ),
          other,
        );
        await c.writer.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [pair.recipient.session.accountId, '0'.repeat(64)],
        );
        await c.writer.query('COMMIT');
        await rejected;
      } finally {
        await c.writer.query('ROLLBACK');
        await c.inspector.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [pair.recipient.session.accountId, pair.recipient.directory],
        );
        await pending.catch(() => undefined);
      }
      assert.deepEqual(
        await c.db.messages.backupWindow(
          pair.recipient,
          [first.id, last.id],
          snapshot,
        ),
        [
          { id: first.id, packet: first },
          { id: last.id, packet: last },
        ],
      );
    },
  );
  await t.test(
    'export rejects oversized and duplicate windows at the store boundary',
    async () => {
      const snapshot = await c.db.messages.snapshot(pair.recipient);
      for (const ids of [
        [],
        Array.from({ length: 33 }, () => crypto.randomUUID()),
        [pair.sender.session.accountId, pair.sender.session.accountId],
      ])
        await assert.rejects(
          c.db.messages.backupWindow(pair.recipient, ids, snapshot),
          { status: 400 },
        );
    },
  );
}
async function cutoffCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'the ciphertext byte cutoff keeps the last inspected reference and stops before later IDs',
    async () => {
      const packets = [];
      for (let index = 0; index < 3; index++) {
        const base = admissionPacket(pair),
          packet = {
            ...base,
            content: { ...base.content, ciphertext: 'c'.repeat(5_400_000) },
          };
        await c.db.messages.admit(pair.sender, packet, hash);
        await missing(c, pair, packet.id);
        packets.push(packet);
      }
      const before = await globalBytes(c.inspector),
        snapshot = await c.db.messages.snapshot(pair.recipient);
      const rows = await c.db.messages.backupWindow(
        pair.recipient,
        [...packets.map((packet) => packet.id), crypto.randomUUID()],
        snapshot,
      );
      assert.deepEqual(
        rows.map((row) => row.id),
        packets.slice(0, 2).map((packet) => packet.id),
      );
      assert.equal(await globalBytes(c.inspector), before + 3n * 256n);
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2 AND device_id=$3',
            [
              packets[2]!.id,
              pair.recipient.session.accountId,
              pair.recipient.session.deviceId,
            ],
          )
        ).rowCount,
        1,
      );
    },
  );
}
await test('private object opening and export coordinate bounded participant sets and preserve charged references', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await accountingCases(t, c, pair);
  await authorizationCases(t, c, pair);
  await concurrencyCases(t, c, pair);
  await cutoffCase(t, c, pair);
  await assertStorageReconciled(c.inspector, [
    pair.sender.session.accountId,
    pair.recipient.session.accountId,
  ]);
});
