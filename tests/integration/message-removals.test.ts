import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { MessageProof } from '../../src/shared/messages/index.ts';
import type { BackupTarget } from '../../src/shared/backups/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import type { MessageUser } from '../fixtures/message-allocation-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import {
  globalBytes,
  globalSourceSnapshot,
} from '../fixtures/global-usage-database.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const hash = 'a'.repeat(64);
function proof(user: MessageUser, items?: BackupTarget[]): MessageProof {
  return {
    deviceId: user.session.deviceId,
    directory: user.directory,
    signature: 'synthetic',
    payload: items ? { backup: hash, revision: 1, items } : { revision: 1 },
  };
}
async function accept(c: MessageReceiptFixture, pair: Pair) {
  const packet = admissionPacket(pair);
  await c.db.messages.admit(pair.sender, packet, hash);
  return packet;
}
function target(id: string): BackupTarget {
  return { kind: 'message', id, hash };
}
async function sharedGate(c: MessageReceiptFixture, work: () => Promise<void>) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query(
      "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
    );
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
  }
}
async function message(c: MessageReceiptFixture, id: string) {
  return (
    await c.inspector.query<{
      available: boolean;
      personal_collected: boolean;
      charge: number;
      sender_charge: number;
      recipient_charge: number;
      queue_active: boolean;
    }>(
      'SELECT body IS NOT NULL AS available,personal_collected,charge,sender_charge,recipient_charge,queue_active FROM hash_talk.message_packets WHERE id=$1',
      [id],
    )
  ).rows[0]!;
}
async function snapshots(c: MessageReceiptFixture) {
  const sources = (
    await c.inspector.query<{ name: string }>(
      `SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY name`,
    )
  ).rows;
  return {
    sources: await globalSourceSnapshot(c.inspector, sources),
    bytes: await globalBytes(c.inspector),
  };
}
async function deletionCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'sender deletion coexists with unrelated shared admission; both owners, reads, attachments and related actions change atomically',
    async () => {
      const packet = await accept(c, pair),
        related = {
          ...admissionPacket(pair),
          relation: {
            type: 'edit' as const,
            id: packet.id,
            hash,
            author: packet.sender,
          },
        };
      await c.db.messages.admit(pair.sender, related, hash);
      await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
      await c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
      await c.inspector.query(
        `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status) VALUES($1,$2,$3,$4,'{}',128,640,'accepted')`,
        [crypto.randomUUID(), packet.id, packet.sender, packet.recipient],
      );
      await sharedGate(c, async () => {
        await c.db.messages.remove(
          pair.sender,
          packet.id,
          hash,
          proof(pair.sender),
        );
      });
      for (const id of [packet.id, related.id]) {
        const row = await message(c, id);
        assert.equal(row.available, false);
        assert.equal(row.queue_active, false);
        assert.equal(row.sender_charge, row.charge);
        assert.equal(row.recipient_charge, row.charge);
      }
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_references WHERE message_id=ANY($1::uuid[])',
            [[packet.id, related.id]],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_reads WHERE message_id=$1',
            [packet.id],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await c.inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.message_attachments WHERE message_id=$1',
            [packet.id],
          )
        ).rows[0]?.status,
        'deleting',
      );
      const before = await snapshots(c);
      await c.db.messages.remove(
        pair.sender,
        packet.id,
        hash,
        proof(pair.sender),
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'foreign sender, divergent hash and invalid directory leave all source rows and accounting unchanged',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      await assert.rejects(
        c.db.messages.remove(
          pair.recipient,
          packet.id,
          hash,
          proof(pair.recipient),
        ),
        { status: 404 },
      );
      await assert.rejects(
        c.db.messages.remove(
          pair.sender,
          packet.id,
          'b'.repeat(64),
          proof(pair.sender),
        ),
        { status: 409 },
      );
      await assert.rejects(
        c.db.messages.remove(
          { ...pair.sender, directory: '0'.repeat(64) },
          packet.id,
          hash,
          proof(pair.sender),
        ),
        { status: 409 },
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function cleanupCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'personal cleanup spans two different peers; one removal preserves the other owner and two removals collect ciphertext',
    async () => {
      const third = await messageUser(c),
        second = { sender: pair.sender, recipient: third };
      await c.inspector.query(
        `INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')`,
        [pair.sender.session.accountId, third.session.accountId],
      );
      const first = await accept(c, pair),
        other = await accept(c, second),
        items = [target(first.id), target(other.id)];
      await sharedGate(c, async () => {
        await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      });
      for (const id of [first.id, other.id]) {
        const row = await message(c, id);
        assert.equal(row.available, true);
        assert.equal(row.sender_charge, 0);
        assert.ok(row.recipient_charge > 0);
      }
      const before = await snapshots(c);
      await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      assert.deepEqual(await snapshots(c), before);
      await c.db.backups.clean(
        pair.recipient,
        proof(pair.recipient, [target(first.id)]),
      );
      assert.equal((await message(c, first.id)).personal_collected, true);
      assert.equal((await message(c, other.id)).available, true);
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
        third.session.accountId,
      ]);
    },
  );
  await t.test(
    'a missing second selection rolls back the first removal and all counters',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      await assert.rejects(
        c.db.backups.clean(
          pair.recipient,
          proof(pair.recipient, [
            target(packet.id),
            target(crypto.randomUUID()),
          ]),
        ),
        { status: 409 },
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'mixed kinds retain the exclusive authority path and never split a selection',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      await sharedGate(c, async () => {
        await assert.rejects(
          c.db.backups.clean(
            pair.sender,
            proof(pair.sender, [
              target(packet.id),
              { kind: 'vault', id: crypto.randomUUID(), hash },
            ]),
          ),
          { code: '55P03' },
        );
      });
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'receipt pages use read-only admission while payload opening still persists and charges a missing reference',
    async () => {
      const packet = await accept(c, pair);
      await c.inspector.query(
        'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
        [packet.id, packet.sender],
      );
      await c.inspector.query(
        'UPDATE hash_talk.message_packets SET charge=charge-256 WHERE id=$1',
        [packet.id],
      );
      const before = await globalBytes(c.inspector),
        snapshot = await c.db.messages.snapshot(pair.sender);
      await c.db.backups.page(pair.sender, 0);
      assert.equal(await globalBytes(c.inspector), before);
      await c.db.messages.object(pair.sender, packet.id, snapshot);
      assert.equal(await globalBytes(c.inspector), before + 256n);
    },
  );
}
async function retryCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'unchanged cleanup and sender-deletion retries do not wait for the global ledger under pressure',
    async () => {
      const packet = await accept(c, pair),
        items = [target(packet.id)];
      await c.db.backups.clean(pair.recipient, proof(pair.recipient, items));
      await c.db.messages.remove(
        pair.sender,
        packet.id,
        hash,
        proof(pair.sender),
      );
      const before = await snapshots(c);
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.recipient, proof(pair.recipient, items));
        await c.db.messages.remove(
          pair.sender,
          packet.id,
          hash,
          proof(pair.sender),
        );
      } finally {
        await c.writer.query('ROLLBACK');
        c.room.bytes = 1_000_000_000_000n;
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'opposite personal removals serialize on the same ordered owners and collect exactly once',
    async () => {
      const packet = await accept(c, pair),
        items = [target(packet.id)];
      await Promise.all([
        c.db.backups.clean(pair.sender, proof(pair.sender, items)),
        c.db.backups.clean(pair.recipient, proof(pair.recipient, items)),
      ]);
      const row = await message(c, packet.id);
      assert.equal(row.available, false);
      assert.equal(row.charge, 4096);
      assert.equal(row.sender_charge, 0);
      assert.equal(row.recipient_charge, 0);
      assert.equal(
        (
          await c.inspector.query(
            "SELECT 1 FROM hash_talk.personal_removals WHERE kind='message' AND id=$1",
            [packet.id],
          )
        ).rowCount,
        2,
      );
      await assertStorageReconciled(c.inspector, [
        packet.sender,
        packet.recipient,
      ]);
    },
  );
}
async function queuedCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  for (const operation of ['sender deletion', 'personal cleanup'] as const) {
    await t.test(
      `${operation} waits for the counterpart and rechecks revoked authority after waiting`,
      async () => {
        const packet = await accept(c, pair),
          before = await snapshots(c);
        await c.writer.query('BEGIN');
        await c.writer.query(
          'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
          [packet.recipient],
        );
        const holder = (
          await c.writer.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid',
          )
        ).rows[0]!.pid;
        const pending =
          operation === 'sender deletion'
            ? c.db.messages.remove(
                pair.sender,
                packet.id,
                hash,
                proof(pair.sender),
              )
            : c.db.backups.clean(
                pair.sender,
                proof(pair.sender, [target(packet.id)]),
              );
        const rejected = assert.rejects(pending, { status: 409 });
        try {
          await waitForBlocked(c.inspector, holder);
          await c.writer.query(
            'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
            [packet.sender, '0'.repeat(64)],
          );
          await c.writer.query('COMMIT');
          await rejected;
        } finally {
          await c.writer.query('ROLLBACK');
          await c.inspector.query(
            'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
            [packet.sender, pair.sender.directory],
          );
        }
        assert.deepEqual(await snapshots(c), before);
      },
    );
  }
}
await test('private removals coordinate every participant while preserving exact legacy accounting', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await deletionCases(t, c, pair);
  await cleanupCases(t, c, pair);
  await queuedCases(t, c, pair);
  await retryCases(t, c, pair);
  await assertStorageReconciled(c.inspector, [
    pair.sender.session.accountId,
    pair.recipient.session.accountId,
  ]);
});
