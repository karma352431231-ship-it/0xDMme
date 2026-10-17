import {
  social,
  vault,
  selection,
} from '../fixtures/personal-cleanup-database.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { randomBytes } from 'node:crypto';
import { SocialCleanupAuthority } from '../../src/server/database/social-cleanup-authority.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
} from '../fixtures/message-allocation-database.ts';
import {
  accept,
  proof,
  snapshots,
  message,
} from '../fixtures/message-removal-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

const hash = 'a'.repeat(64);
type Pair = Awaited<ReturnType<typeof messagePair>>;
async function sharedGate(
  c: MessageReceiptFixture,
  work: () => Promise<unknown>,
) {
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
async function cleanupCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'one shared-admission transaction cleans all three kinds and retains both owners and physical file charges',
    async () => {
      const s = await selection(c, pair);
      await sharedGate(c, () =>
        c.db.backups.clean(pair.sender, proof(pair.sender, s.items)),
      );
      assert.equal((await message(c, s.packet.id)).available, true);
      const dm = (
        await c.inspector.query<{
          available: boolean;
          sender_charge: number;
          recipient_charge: number;
        }>(
          'SELECT body IS NOT NULL AS available,sender_charge,recipient_charge FROM hash_talk.social_messages WHERE id=$1',
          [s.dm.id],
        )
      ).rows[0];
      assert.deepEqual(dm, {
        available: true,
        sender_charge: 0,
        recipient_charge: 1024,
      });
      const receipts = (
        await c.inspector.query<{
          kind: string;
          retained_bytes: number;
          charge: number;
        }>(
          'SELECT kind,retained_bytes,charge FROM hash_talk.personal_removals WHERE account_id=$1 AND id=ANY($2::uuid[]) ORDER BY kind',
          [pair.sender.session.accountId, s.items.map((item) => item.id)],
        )
      ).rows;
      assert.equal(receipts.length, 3);
      const charge =
        Buffer.byteLength(JSON.stringify(proof(pair.sender, s.items))) + 512;
      assert.deepEqual(
        receipts.map((row) => [row.kind, row.retained_bytes, row.charge]),
        [
          ['dm-message', 0, charge],
          ['message', 0, charge],
          ['vault', 128, charge + 128],
        ],
      );
      assert.equal(
        (
          await c.inspector.query<{ charge: number }>(
            'SELECT charge FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2',
            [pair.sender.session.accountId, s.block.id],
          )
        ).rows[0]!.charge,
        4096,
      );
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.social_media WHERE id=$1',
            [s.dm.media],
          )
        ).rows,
        [{ status: 'accepted', charge: 640 }],
      );
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ]);
      const before = await snapshots(c);
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        await c.writer.query(
          'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
        );
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.sender, proof(pair.sender, s.items));
      } finally {
        c.room.bytes = 1_000_000_000_000n;
        await c.writer.query('ROLLBACK');
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'a later invalid vault selection rolls back earlier social/private removals and receipts',
    async () => {
      const s = await selection(c, pair),
        before = await snapshots(c),
        invalid = { kind: 'vault' as const, id: crypto.randomUUID(), hash };
      await assert.rejects(
        c.db.backups.clean(
          pair.sender,
          proof(pair.sender, s.items.slice(0, 2).concat(invalid)),
        ),
        { status: 409 },
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'opposite mixed removals serialize on every owner and collect both ciphertexts while retaining media charges',
    async () => {
      const s = await selection(c, pair),
        otherVault = await vault(c, pair.recipient),
        otherItems = s.items.slice(0, 2).concat(otherVault);
      await Promise.all([
        c.db.backups.clean(pair.sender, proof(pair.sender, s.items)),
        c.db.backups.clean(pair.recipient, proof(pair.recipient, otherItems)),
      ]);
      assert.equal((await message(c, s.packet.id)).available, false);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT body IS NULL AS collected,charge FROM hash_talk.social_messages WHERE id=$1',
            [s.dm.id],
          )
        ).rows,
        [{ collected: true, charge: 512 }],
      );
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.social_media WHERE id=$1',
            [s.dm.media],
          )
        ).rows,
        [{ status: 'deleting', charge: 640 }],
      );
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.message_attachments WHERE id=$1',
            [s.attachment],
          )
        ).rows,
        [{ status: 'deleting', charge: 640 }],
      );
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ]);
    },
  );
}
async function authorityCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'foreign social content, divergent hash, stale directory and unconfirmed wallet preserve all data',
    async () => {
      const s = await selection(c, pair),
        other = await messagePair(c),
        foreign = await social(c, other),
        before = await snapshots(c);
      await assert.rejects(
        c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [
            { kind: foreign.kind, id: foreign.id, hash },
            s.block,
          ]),
        ),
        { status: 410 },
      );
      await assert.rejects(
        c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [
            { kind: s.dm.kind, id: s.dm.id, hash: 'b'.repeat(64) },
            s.block,
          ]),
        ),
        { status: 409 },
      );
      await assert.rejects(
        c.db.backups.clean(
          { ...pair.sender, directory: '0'.repeat(64) },
          proof(pair.sender, s.items),
        ),
        { status: 409 },
      );
      await c.inspector.query(
        'UPDATE hash_talk.login_sessions SET wallet_confirmed=false WHERE account_id=$1',
        [pair.sender.session.accountId],
      );
      try {
        await assert.rejects(
          c.db.backups.clean(pair.sender, proof(pair.sender, s.items)),
          { status: 403 },
        );
      } finally {
        await c.inspector.query(
          'UPDATE hash_talk.login_sessions SET wallet_confirmed=true WHERE account_id=$1',
          [pair.sender.session.accountId],
        );
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'social cleanup authority returns metadata only even for large cold ciphertext',
    async () => {
      const dm = await social(
          c,
          pair,
          randomBytes(2_000_000).toString('base64'),
        ),
        authority = new SocialCleanupAuthority(c.db.publicProfiles);
      const client = await c.pool.connect();
      try {
        assert.deepEqual(
          await authority.target(client, pair.sender.session.accountId, dm.id),
          { hash, actor: dm.sender },
        );
      } finally {
        client.release();
      }
      await c.db.backups.clean(
        pair.sender,
        proof(pair.sender, [{ kind: dm.kind, id: dm.id, hash }]),
      );
    },
  );
}
async function queuedCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'a mixed selection includes different private/social peers and rechecks revocation after waiting while an independent pair progresses',
    async () => {
      const peer = await messageUser(c),
        s = await selection(c, pair),
        extra = await social(c, { sender: pair.sender, recipient: peer }),
        items = [...s.items, { kind: extra.kind, id: extra.id, hash }],
        independent = await messagePair(c),
        packet = await accept(c, independent),
        snapshot = await c.db.messages.snapshot(independent.recipient);
      const before = await snapshots(c);
      await c.writer.query('BEGIN');
      await c.writer.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [peer.session.accountId],
      );
      const holder = (
        await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const pending = c.db.backups.clean(
          pair.sender,
          proof(pair.sender, items),
        ),
        rejected = assert.rejects(pending, { status: 409 });
      try {
        await waitForBlocked(c.inspector, holder);
        assert.deepEqual(
          await c.db.messages.object(
            independent.recipient,
            packet.id,
            snapshot,
          ),
          packet,
        );
        await c.writer.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [pair.sender.session.accountId, '0'.repeat(64)],
        );
        await c.writer.query('COMMIT');
        await rejected;
      } finally {
        await c.writer.query('ROLLBACK');
        await c.inspector.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [pair.sender.session.accountId, pair.sender.directory],
        );
        await pending.catch(() => undefined);
      }
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND id=ANY($2::uuid[])',
            [pair.sender.session.accountId, items.map((item) => item.id)],
          )
        ).rowCount,
        0,
      );
      assert.equal((await message(c, s.packet.id)).available, true);
      assert.deepEqual(await snapshots(c), before);
      await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
        peer.session.accountId,
      ]);
    },
  );
}
await test('mixed personal cleanup coordinates all owners without splitting atomic effects', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await cleanupCases(t, c, pair);
  await authorityCases(t, c, pair);
  await queuedCase(t, c, pair);
});
