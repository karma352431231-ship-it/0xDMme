import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { vaultQuota } from '../../src/shared/vault/index.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';
import { assertPersonalQuotaMatches } from '../fixtures/personal-quota-database.ts';
import {
  expectNoAllocations,
  allocationPoolErrors,
} from '../fixtures/content-allocation-database.ts';
import {
  messagePair,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const hash = 'a'.repeat(64),
  full = 1_000_000_000_000n;
async function accepted(c: MessageReceiptFixture, pair: Pair) {
  const packet = admissionPacket(pair);
  await c.db.messages.admit(pair.sender, packet, hash);
  return packet;
}
async function delivered(c: MessageReceiptFixture, pair: Pair) {
  const packet = await accepted(c, pair);
  await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
  return packet;
}
async function heldLegacy(c: MessageReceiptFixture, work: () => Promise<void>) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query(
      "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
    );
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
    c.room.bytes = full;
  }
}
async function readRows(c: MessageReceiptFixture, ids: string[]) {
  return (
    await c.inspector.query<{
      message_id: string;
      share_epoch: number | null;
      charge: number;
    }>(
      'SELECT message_id,share_epoch,charge FROM hash_talk.message_reads WHERE message_id=ANY($1::uuid[]) ORDER BY message_id',
      [ids],
    )
  ).rows;
}
async function privacy(
  c: MessageReceiptFixture,
  pair: Pair,
  readReceipts: boolean,
) {
  const row = (
    await c.inspector.query<{ profile_revision: number }>(
      'SELECT profile_revision FROM hash_talk.accounts WHERE id=$1',
      [pair.recipient.session.accountId],
    )
  ).rows[0];
  assert.ok(row);
  await c.db.daily.configure(pair.recipient, row.profile_revision, {
    online: false,
    lastSeen: false,
    readReceipts,
  });
}
async function reconcile(c: MessageReceiptFixture, pairs: Pair[]) {
  await assertPersonalQuotaMatches(
    c.inspector,
    pairs.flatMap((p) => [
      p.sender.session.accountId,
      p.recipient.session.accountId,
    ]),
  );
  await expectNoAllocations(c.inspector);
}
async function verifyAcks(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'ACKs bypass the unrelated exclusive gate and ledger without changing charges, and retire only finished/revoked references',
    async () => {
      const packet = await accepted(c, pair),
        revoked = crypto.randomUUID();
      await c.inspector.query(
        'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3)',
        [packet.id, packet.sender, revoked],
      );
      const bytes = await globalBytes(c.inspector);
      await heldLegacy(c, async () => {
        // This is the predecessor ACK gate; the actual scoped ACK must coexist.
        await assert.rejects(
          c.db.contacts.withMessageAuthority(pair.recipient, () =>
            Promise.resolve(),
          ),
          { code: '55P03' },
        );
        c.room.bytes = 0n;
        await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
        assert.equal(
          (
            await c.inspector.query<{ queue_active: boolean }>(
              'SELECT queue_active FROM hash_talk.message_packets WHERE id=$1',
              [packet.id],
            )
          ).rows[0]?.queue_active,
          true,
        );
        await c.db.messages.acknowledge(pair.sender, packet.id, hash);
        await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
      });
      assert.equal(
        (
          await c.inspector.query<{ queue_active: boolean }>(
            'SELECT queue_active FROM hash_talk.message_packets WHERE id=$1',
            [packet.id],
          )
        ).rows[0]?.queue_active,
        false,
      );
      assert.equal(
        (
          await c.inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.message_references WHERE message_id=$1 AND device_id=$2',
            [packet.id, revoked],
          )
        ).rows[0]?.status,
        'revoked',
      );
      assert.equal(await globalBytes(c.inspector), bytes);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'invalid authority, foreign packets, wrong hashes and personal removals cannot acknowledge delivery',
    async () => {
      const packet = await accepted(c, pair),
        other = await messagePair(c),
        before = await globalBytes(c.inspector);
      await assert.rejects(
        c.db.messages.acknowledge(
          {
            ...pair.recipient,
            session: { ...pair.recipient.session, csrf: 'invalid' },
          },
          crypto.randomUUID(),
          hash,
        ),
        { status: 401 },
      );
      await assert.rejects(
        c.db.messages.acknowledge(
          { ...pair.recipient, directory: 'f'.repeat(64) },
          packet.id,
          hash,
        ),
        { status: 409 },
      );
      await assert.rejects(
        c.db.messages.acknowledge(other.recipient, packet.id, hash),
        { status: 404 },
      );
      await assert.rejects(
        c.db.messages.acknowledge(pair.recipient, packet.id, 'f'.repeat(64)),
        { status: 409 },
      );
      await c.inspector.query(
        `INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,'message',$2,$3,'{}',0,512)`,
        [packet.recipient, packet.id, hash],
      );
      try {
        await assert.rejects(
          c.db.messages.acknowledge(pair.recipient, packet.id, hash),
          { status: 410 },
        );
      } finally {
        await c.inspector.query(
          "DELETE FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
          [packet.recipient, packet.id],
        );
      }
      assert.equal(
        (
          await c.inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
            [packet.id, packet.recipient],
          )
        ).rows[0]?.status,
        'pending',
      );
      assert.equal(await globalBytes(c.inspector), before);
    },
  );
  await t.test(
    'related ACK checks the preserved original identifier without fetching its encrypted packet',
    async () => {
      const original = await accepted(c, pair),
        action = {
          ...admissionPacket(pair),
          relation: {
            id: original.id,
            hash,
            author: original.sender,
            type: 'reaction' as const,
          },
        };
      await c.db.messages.admit(pair.sender, action, hash);
      await c.inspector.query(
        `INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,'message',$2,$3,'{}',0,512)`,
        [original.recipient, original.id, hash],
      );
      try {
        await assert.rejects(
          c.db.messages.acknowledge(pair.recipient, action.id, hash),
          { status: 410 },
        );
      } finally {
        await c.inspector.query(
          "DELETE FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
          [original.recipient, original.id],
        );
      }
      await c.db.messages.acknowledge(pair.recipient, action.id, hash);
    },
  );
  await t.test(
    'ACK retains its existing post-consent-change semantics while new read marks still require consent',
    async () => {
      const packet = await accepted(c, pair);
      await c.inspector.query(
        "UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
        [packet.sender, packet.recipient],
      );
      try {
        await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
        await assert.rejects(
          c.db.daily.read(pair.recipient, packet.sender, [packet.id]),
          { status: 404 },
        );
      } finally {
        await c.inspector.query(
          "UPDATE hash_talk.contact_relations SET state='approved' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          [packet.sender, packet.recipient],
        );
      }
    },
  );
}
async function verifyConcurrency(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
  other: Pair,
) {
  await t.test(
    'a waiting ACK cannot block an unrelated pair, and opposite ACKs use one account order',
    async () => {
      const packet = await accepted(c, pair);
      await c.reader.query('BEGIN');
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [packet.recipient],
      );
      const holder = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      assert.ok(holder);
      const waiting = c.db.messages.acknowledge(
        pair.recipient,
        packet.id,
        hash,
      );
      void waiting.catch(() => undefined);
      try {
        await waitForBlocked(c.inspector, holder.pid);
        const independent = await delivered(c, other);
        await c.db.daily.read(other.recipient, independent.sender, [
          independent.id,
        ]);
      } finally {
        await c.reader.query('ROLLBACK');
        await waiting;
      }
      const opposite = await accepted(c, pair);
      await Promise.all([
        c.db.messages.acknowledge(pair.sender, opposite.id, hash),
        c.db.messages.acknowledge(pair.recipient, opposite.id, hash),
      ]);
      assert.equal(
        (
          await c.inspector.query<{ queue_active: boolean }>(
            'SELECT queue_active FROM hash_talk.message_packets WHERE id=$1',
            [opposite.id],
          )
        ).rows[0]?.queue_active,
        false,
      );
    },
  );
  await t.test(
    'queued ACKs and reads recheck device authority after the revocation gate commits',
    async () => {
      const packet = await delivered(c, pair);
      await c.reader.query('BEGIN');
      await c.reader.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))",
      );
      const holder = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      assert.ok(holder);
      const ack = c.db.messages.acknowledge(pair.recipient, packet.id, hash),
        read = c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
      const outcomes = Promise.all([
        assert.rejects(ack, { status: 409 }),
        assert.rejects(read, { status: 409 }),
      ]);
      try {
        await waitForBlocked(c.inspector, holder.pid);
        await c.reader.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [packet.recipient, 'e'.repeat(64)],
        );
        await c.reader.query('COMMIT');
        await outcomes;
      } finally {
        await c.reader.query('ROLLBACK');
        await c.inspector.query(
          'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
          [packet.recipient, pair.recipient.directory],
        );
      }
      assert.deepEqual(await readRows(c, [packet.id]), []);
    },
  );
  await t.test(
    'a changed routing row while ACK waits cannot escape the originally locked participant set',
    async () => {
      const packet = await accepted(c, pair);
      await c.reader.query('BEGIN');
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [packet.recipient],
      );
      const holder = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0];
      assert.ok(holder);
      const waiting = assert.rejects(
        c.db.messages.acknowledge(pair.recipient, packet.id, hash),
        { status: 404 },
      );
      try {
        await waitForBlocked(c.inspector, holder.pid);
        await c.reader.query(
          'UPDATE hash_talk.message_packets SET sender=$2 WHERE id=$1',
          [packet.id, other.sender.session.accountId],
        );
        await c.reader.query('COMMIT');
        await waiting;
      } finally {
        await c.reader.query('ROLLBACK');
        await c.inspector.query(
          'UPDATE hash_talk.message_packets SET sender=$2 WHERE id=$1',
          [packet.id, packet.sender],
        );
      }
      assert.equal(
        (
          await c.inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
            [packet.id, packet.recipient],
          )
        ).rows[0]?.status,
        'pending',
      );
    },
  );
}
async function verifyReadRules(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  const packet = await accepted(c, pair);
  await t.test(
    'read marks require device delivery and atomically add exactly 256 bytes under legacy contention',
    async () => {
      await assert.rejects(
        c.db.daily.read(pair.recipient, packet.sender, [packet.id]),
        { status: 409 },
      );
      await c.db.messages.acknowledge(pair.recipient, packet.id, hash);
      const before = await globalBytes(c.inspector);
      await heldLegacy(c, async () => {
        await c.db.daily.read(pair.recipient, packet.sender, [
          packet.id,
          packet.id,
        ]);
      });
      assert.equal((await globalBytes(c.inspector)) - before, 256n);
      assert.deepEqual(await readRows(c, [packet.id]), [
        { message_id: packet.id, share_epoch: null, charge: 256 },
      ]);
      assert.deepEqual(await c.db.daily.receipts(pair.sender, [packet.id]), []);
    },
  );
  await t.test(
    'persisted duplicate/empty read retries reserve nothing and remain usable under pressure',
    async () => {
      const before = await globalBytes(c.inspector);
      c.room.bytes = 0n;
      await c.writer.query('BEGIN');
      await c.writer.query(
        'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
      );
      try {
        await c.db.daily.read(pair.recipient, packet.sender, [
          packet.id,
          packet.id,
        ]);
        await c.db.daily.read(pair.recipient, packet.sender, []);
      } finally {
        await c.writer.query('ROLLBACK');
        c.room.bytes = full;
      }
      assert.equal(await globalBytes(c.inspector), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'sharing epochs reveal only explicitly refreshed reads without charging existing marks twice',
    async () => {
      await privacy(c, pair, true);
      let before = await globalBytes(c.inspector);
      await heldLegacy(c, async () => {
        await c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
      });
      assert.equal(await globalBytes(c.inspector), before);
      assert.deepEqual(await c.db.daily.receipts(pair.sender, [packet.id]), [
        packet.id,
      ]);
      await privacy(c, pair, false);
      assert.deepEqual(await c.db.daily.receipts(pair.sender, [packet.id]), []);
      await c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
      assert.equal((await readRows(c, [packet.id]))[0]?.share_epoch, null);
      await privacy(c, pair, true);
      assert.deepEqual(await c.db.daily.receipts(pair.sender, [packet.id]), []);
      before = await globalBytes(c.inspector);
      await c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
      assert.equal(await globalBytes(c.inspector), before);
      assert.deepEqual(await c.db.daily.receipts(pair.sender, [packet.id]), [
        packet.id,
      ]);
    },
  );
  await t.test(
    'physical and personal-quota refusal leave the entire read batch and allocation ledger unchanged',
    async () => {
      const fresh = await delivered(c, pair);
      const before = await globalBytes(c.inspector);
      c.room.bytes = 0n;
      try {
        await assert.rejects(
          c.db.daily.read(pair.recipient, fresh.sender, [fresh.id]),
          { status: 503 },
        );
      } finally {
        c.room.bytes = full;
      }
      assert.deepEqual(await readRows(c, [fresh.id]), []);
      assert.equal(await globalBytes(c.inspector), before);
      const filler = crypto.randomUUID();
      await c.inspector.query(
        `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES($1,$1,$2,$3,'{}',1,$4)`,
        [filler, fresh.recipient, fresh.sender, vaultQuota],
      );
      const fullBytes = await globalBytes(c.inspector);
      try {
        await assert.rejects(
          c.db.daily.read(pair.recipient, fresh.sender, [fresh.id]),
          { status: 413 },
        );
        assert.equal(await globalBytes(c.inspector), fullBytes);
        assert.deepEqual(await readRows(c, [fresh.id]), []);
      } finally {
        await c.inspector.query(
          'DELETE FROM hash_talk.message_attachments WHERE id=$1',
          [filler],
        );
      }
      await expectNoAllocations(c.inspector);
    },
  );
}
async function bindRead(
  c: MessageReceiptFixture,
  input: { pair: Pair; ids: string[]; bytes?: number },
) {
  const grant = await c.allocator.reserve(
    c.writer,
    input.bytes ?? 65536,
    'message-read',
  );
  await c.writer.query(
    `SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_peer',$3,true),
    set_config('hash_talk.content_device',$4,true),set_config('hash_talk.content_read_ids',$5,true)`,
    [
      grant.transactionId,
      input.pair.recipient.session.accountId,
      input.pair.sender.session.accountId,
      input.pair.recipient.session.deviceId,
      JSON.stringify(input.ids),
    ],
  );
  return grant;
}
async function insertRead(client: pg.Client, pair: Pair, id: string) {
  await client.query(
    'INSERT INTO hash_talk.message_reads(account_id,message_id) VALUES($1,$2)',
    [pair.recipient.session.accountId, id],
  );
}
async function verifyReadGuards(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  const first = await delivered(c, pair),
    second = await delivered(c, pair),
    pending = await accepted(c, pair);
  const scenarios = [
    {
      name: 'another charged source',
      sql: 'INSERT INTO hash_talk.daily_controls(account_id) VALUES($1)',
      values: [first.recipient],
    },
    {
      name: 'another message ID',
      sql: 'INSERT INTO hash_talk.message_reads(account_id,message_id) VALUES($1,$2)',
      values: [first.recipient, second.id],
    },
    {
      name: 'an unreceived packet',
      sql: 'INSERT INTO hash_talk.message_reads(account_id,message_id) VALUES($1,$2)',
      values: [first.recipient, pending.id],
      ids: [pending.id],
    },
    {
      name: 'a changed charge',
      sql: 'INSERT INTO hash_talk.message_reads(account_id,message_id,charge) VALUES($1,$2,257)',
      values: [first.recipient, first.id],
    },
    {
      name: 'an unauthorized share epoch',
      sql: 'INSERT INTO hash_talk.message_reads(account_id,message_id,share_epoch) VALUES($1,$2,100)',
      values: [first.recipient, first.id],
    },
  ];
  for (const scenario of scenarios)
    await t.test(
      'read allocation rejects ' + scenario.name + ' before effects',
      async () => {
        const before = await globalBytes(c.inspector);
        await c.writer.query('BEGIN');
        const grant = await bindRead(c, {
          pair,
          ids: scenario.ids ?? [first.id],
        });
        try {
          await assert.rejects(c.writer.query(scenario.sql, scenario.values), {
            code: 'PCA01',
          });
        } finally {
          await c.writer.query('ROLLBACK');
          await c.allocator.finish(grant);
        }
        assert.equal(await globalBytes(c.inspector), before);
        assert.deepEqual(
          await readRows(c, [first.id, second.id, pending.id]),
          [],
        );
      },
    );
  await t.test(
    'insufficient envelopes, immutable changes, deletion and incomplete batches fail; savepoints can finish the exact batch',
    async () => {
      await c.writer.query('BEGIN');
      let grant = await bindRead(c, { pair, ids: [first.id], bytes: 1 });
      try {
        await assert.rejects(insertRead(c.writer, pair, first.id), {
          code: 'PCA01',
        });
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      await c.writer.query('BEGIN');
      grant = await bindRead(c, { pair, ids: [first.id, second.id] });
      try {
        await insertRead(c.writer, pair, first.id);
        await c.writer.query('SAVEPOINT immutable');
        await assert.rejects(
          c.writer.query(
            'UPDATE hash_talk.message_reads SET message_id=$3 WHERE account_id=$1 AND message_id=$2',
            [first.recipient, first.id, second.id],
          ),
          { code: 'PCA01' },
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT immutable');
        await assert.rejects(
          c.writer.query(
            'DELETE FROM hash_talk.message_reads WHERE account_id=$1 AND message_id=$2',
            [first.recipient, first.id],
          ),
          { code: 'PCA01' },
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT immutable');
        await c.writer.query('SAVEPOINT incomplete');
        await assert.rejects(
          c.writer.query('SELECT hash_talk.assert_message_reads_complete()'),
          { code: 'PCA01' },
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT incomplete');
        await insertRead(c.writer, pair, second.id);
        await c.writer.query(
          'SELECT hash_talk.assert_message_reads_complete()',
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      assert.deepEqual(await readRows(c, [first.id, second.id]), []);
    },
  );
  await t.test(
    'ordinary application role can consume and validate a read envelope',
    async () => {
      const role =
        'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      await c.inspector
        .query(`CREATE ROLE "${role}" NOLOGIN;GRANT USAGE ON SCHEMA hash_talk TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`);
      try {
        await c.writer.query('BEGIN');
        await c.writer.query(`SET LOCAL ROLE "${role}"`);
        const grant = await bindRead(c, { pair, ids: [first.id] });
        try {
          await insertRead(c.writer, pair, first.id);
          await c.writer.query(
            'SELECT hash_talk.assert_message_reads_complete()',
          );
        } finally {
          await c.writer.query('ROLLBACK');
          await c.allocator.finish(grant);
        }
      } finally {
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function verifyFinalization(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'failed post-commit finalization retains its credit without reporting a persisted read as lost',
    async () => {
      const packet = await delivered(c, pair);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_receipt_finish_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic receipt finalization failure';END;$$;
      CREATE TRIGGER synthetic_receipt_finish_failure BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_receipt_finish_failure()`);
      try {
        await c.db.daily.read(pair.recipient, packet.sender, [packet.id]);
        assert.equal((await readRows(c, [packet.id])).length, 1);
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT 1 FROM hash_talk.content_allocations WHERE scope='message-read'",
            )
          ).rowCount,
          1,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_receipt_finish_failure ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_receipt_finish_failure()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('private receipt coordination starts fresh and preserves delivery, privacy and independent-pair progress', async (t) => {
  const c = await messageReceiptFixture(t),
    first = await messagePair(c),
    second = await messagePair(c);
  await verifyAcks(t, c, first);
  await verifyConcurrency(t, c, first, second);
  await verifyReadRules(t, c, first);
  await verifyReadGuards(t, c, second);
  await reconcile(c, [first, second]);
  await verifyFinalization(t, c, second);
  await reconcile(c, [first, second]);
  assert.deepEqual(allocationPoolErrors, []);
});
