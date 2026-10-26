import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { vaultQuota } from '../../src/shared/vault/index.ts';
import { enqueuePush } from '../../src/server/database/daily.ts';
import { recordMessageChanges } from '../../src/server/database/message-changes.ts';
import {
  globalBytes,
  globalSourceSnapshot,
} from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import {
  expectNoAllocations,
  allocationPoolErrors,
} from '../fixtures/content-allocation-database.ts';
import { reverseMessageAllocations } from '../fixtures/message-allocation-reversal.ts';
import {
  messageAllocationFixture,
  messagePair,
  admissionPacket,
  bindMessage,
  insertAdmissionPacket,
} from '../fixtures/message-allocation-database.ts';
import type { MessageAllocationFixture } from '../fixtures/message-allocation-database.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const full = 1_000_000_000_000n,
  hash = 'a'.repeat(64);
async function admit(
  c: MessageAllocationFixture,
  pair: Pair,
  packet = admissionPacket(pair),
) {
  assert.deepEqual(await c.db.messages.admit(pair.sender, packet, hash), {
    status: 'accepted',
    hash,
  });
  return packet;
}
async function legacyHeld(
  c: MessageAllocationFixture,
  work: () => Promise<void>,
) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
    c.room.bytes = full;
  }
}
async function sourceState(c: MessageAllocationFixture) {
  return {
    rows: await globalSourceSnapshot(c.inspector, c.sources),
    total: await globalBytes(c.inspector),
    pending: await c.db.storageReservations.snapshot(),
  };
}
async function reconciled(c: MessageAllocationFixture, pairs: Pair[]) {
  await assertStorageReconciled(c.inspector, [
    ...c.fixture.accounts,
    ...pairs.flatMap((p) => [
      p.sender.session.accountId,
      p.recipient.session.accountId,
    ]),
  ]);
  await expectNoAllocations(c.inspector);
}
async function addPush(c: MessageAllocationFixture, pair: Pair) {
  await c.inspector.query(
    `INSERT INTO hash_talk.push_subscriptions(account_id,device_id,endpoint,subscription,charge)
    VALUES($1,$2,$3,'{}',512)`,
    [
      pair.recipient.session.accountId,
      pair.recipient.session.deviceId,
      'https://push.example.invalid/' + crypto.randomUUID(),
    ],
  );
}
async function withFullQuota(
  c: MessageAllocationFixture,
  owner: string,
  work: () => Promise<void>,
) {
  const id = crypto.randomUUID();
  await c.inspector.query(
    `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge)
    VALUES($2,$2,$1,$4,'{}',128,$3)`,
    [owner, id, vaultQuota, c.fixture.first],
  );
  try {
    await work();
  } finally {
    await c.inspector.query(
      'DELETE FROM hash_talk.message_attachments WHERE sender=$1 AND id=$2',
      [owner, id],
    );
  }
}
async function verifyRuntime(
  t: TestContext,
  c: MessageAllocationFixture,
  pair: Pair,
) {
  await addPush(c, pair);
  await t.test(
    'a private packet, references, both journals and push hints commit under an unrelated legacy ledger lock',
    async () => {
      const before = await globalBytes(c.inspector),
        packet = admissionPacket(pair);
      await legacyHeld(c, async () => {
        const legacy = new Database(c.url, 1_000_000_000_000);
        try {
          await assert.rejects(
            legacy.messages.admit(pair.sender, packet, hash),
            { code: '55P03' },
          );
        } finally {
          await legacy.close();
        }
        await admit(c, pair, packet);
      });
      const stored = (
        await c.inspector.query<{ body: MessagePacket; charge: number }>(
          'SELECT body,charge FROM hash_talk.message_packets WHERE id=$1',
          [packet.id],
        )
      ).rows[0];
      assert.ok(stored);
      assert.deepEqual(stored.body, packet);
      assert.equal(
        (await globalBytes(c.inspector)) - before,
        BigInt(stored.charge + 2 * 528),
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_references WHERE message_id=$1',
            [packet.id],
          )
        ).rowCount,
        2,
      );
      const push = (
        await c.inspector.query<{
          pending: boolean;
          generation: string;
          attempts: number;
        }>(
          'SELECT pending,generation,attempts FROM hash_talk.push_subscriptions WHERE account_id=$1',
          [packet.recipient],
        )
      ).rows[0];
      assert.deepEqual(push, { pending: true, generation: '1', attempts: 0 });
      const state = await sourceState(c);
      await admit(c, pair, packet);
      assert.deepEqual(
        await sourceState(c),
        state,
        'Retry must not duplicate any effect.',
      );
      await assert.rejects(
        c.db.messages.admit(pair.sender, packet, 'b'.repeat(64)),
        { status: 409 },
      );
    },
  );
  await t.test(
    'physical admission refuses before any packet, journal or push change',
    async () => {
      const before = await sourceState(c);
      c.room.bytes = 0n;
      try {
        await assert.rejects(
          c.db.messages.admit(pair.sender, admissionPacket(pair), hash),
          { status: 503 },
        );
      } finally {
        c.room.bytes = full;
      }
      assert.deepEqual(await sourceState(c), before);
    },
  );
  for (const role of ['sender', 'recipient'] as const)
    await t.test(
      role + ' quota failure rolls back the entire admission',
      async () => {
        await withFullQuota(c, pair[role].session.accountId, async () => {
          const before = await sourceState(c);
          await assert.rejects(
            c.db.messages.admit(pair.sender, admissionPacket(pair), hash),
            { status: 413 },
          );
          assert.deepEqual(await sourceState(c), before);
        });
      },
    );
  await t.test(
    'current consent, session and directory remain mandatory',
    async () => {
      const packet = admissionPacket(pair),
        before = await sourceState(c);
      await c.inspector.query(
        `UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)`,
        [packet.sender, packet.recipient],
      );
      try {
        await assert.rejects(c.db.messages.admit(pair.sender, packet, hash), {
          status: 404,
        });
      } finally {
        await c.inspector.query(
          `UPDATE hash_talk.contact_relations SET state='approved' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)`,
          [packet.sender, packet.recipient],
        );
      }
      await assert.rejects(
        c.db.messages.admit(
          {
            ...pair.sender,
            session: { ...pair.sender.session, csrf: crypto.randomUUID() },
          },
          packet,
          hash,
        ),
        { status: 401 },
      );
      await assert.rejects(
        c.db.messages.admit(
          { ...pair.sender, directory: 'd'.repeat(64) },
          packet,
          hash,
        ),
        { status: 409 },
      );
      await assert.rejects(
        c.db.messages.admit(
          pair.sender,
          { ...packet, recipientDirectory: 'e'.repeat(64) },
          hash,
        ),
        { status: 409 },
      );
      assert.deepEqual(await sourceState(c), before);
    },
  );
}
async function verifyConcurrency(
  t: TestContext,
  c: MessageAllocationFixture,
  first: Pair,
  second: Pair,
) {
  await t.test(
    'a blocked participant pair cannot block an independent pair',
    async () => {
      await c.reader.query('BEGIN');
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [first.sender.session.accountId],
      );
      let completed = false;
      const waiting = admit(c, first).then((packet) => {
        completed = true;
        return packet;
      });
      try {
        await admit(c, second);
        assert.equal(completed, false);
      } finally {
        await c.reader.query('ROLLBACK');
        await waiting;
      }
    },
  );
  await t.test(
    'opposite sends share ordered participant locks without deadlock or quota drift',
    async () => {
      await Promise.all([
        admit(c, first),
        admit(c, { sender: first.recipient, recipient: first.sender }),
      ]);
      await reconciled(c, [first, second]);
    },
  );
}
async function verifyAttachments(
  t: TestContext,
  c: MessageAllocationFixture,
  pair: Pair,
) {
  const packet = admissionPacket(pair),
    ref = {
      id: crypto.randomUUID(),
      hash: 'f'.repeat(64),
      bytes: 128,
      parts: [{ hash: 'e'.repeat(64), bytes: 128 }],
    };
  packet.kind = 'attachment';
  packet.attachments = [ref];
  await c.inspector.query(
    `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status,received)
    VALUES($1,$2,$3,$4,$5,128,4224,'ready','{0}')`,
    [ref.id, packet.id, packet.sender, packet.recipient, ref],
  );
  await t.test(
    'quota refusal preserves a ready attachment and its physical promise',
    async () => {
      await withFullQuota(c, packet.recipient, async () => {
        const before = await sourceState(c);
        await assert.rejects(c.db.messages.admit(pair.sender, packet, hash), {
          status: 413,
        });
        assert.deepEqual(await sourceState(c), before);
      });
    },
  );
  await t.test(
    'attachment acceptance releases only its existing promise and preserves source charge and personal-removal accounting',
    async () => {
      const before = await c.db.storageReservations.snapshot();
      // A removal that precedes acceptance still excludes the attachment from this owner's quota.
      await c.inspector.query(
        `INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge)
      VALUES($1,'message',$2,repeat('a',64),'{}',0,512)`,
        [packet.recipient, packet.id],
      );
      await legacyHeld(c, async () => {
        await admit(c, pair, packet);
      });
      const after = await c.db.storageReservations.snapshot();
      assert.equal(before.reservedBytes - after.reservedBytes, 4224);
      assert.equal(before.reservations - after.reservations, 1);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge,descriptor FROM hash_talk.message_attachments WHERE id=$1',
            [ref.id],
          )
        ).rows[0],
        { status: 'accepted', charge: 4224, descriptor: ref },
      );
      await reconciled(c, [pair]);
      await c.inspector.query(
        "DELETE FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
        [packet.recipient, packet.id],
      );
      await reconciled(c, [pair]);
    },
  );
}
async function verifyHistory(
  t: TestContext,
  c: MessageAllocationFixture,
  pair: Pair,
) {
  await t.test(
    'a related action preserves a prior personal removal and cannot revive its delivery references',
    async () => {
      const original = await admit(c, pair);
      await c.inspector.query(
        `INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge)
      VALUES($1,'message',$2,repeat('a',64),'{}',0,512)`,
        [original.recipient, original.id],
      );
      const action = {
        ...admissionPacket(pair),
        relation: {
          id: original.id,
          hash,
          author: original.sender,
          type: 'reaction' as const,
        },
      };
      await legacyHeld(c, async () => {
        await admit(c, pair, action);
      });
      assert.equal(
        (
          await c.inspector.query<{ recipient_charge: number }>(
            'SELECT recipient_charge FROM hash_talk.message_packets WHERE id=$1',
            [action.id],
          )
        ).rows[0]?.recipient_charge,
        0,
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
            [action.id, action.recipient],
          )
        ).rowCount,
        0,
      );
      await reconciled(c, [pair]);
    },
  );
  await t.test(
    'journal pruning keeps 256 revisions per participant without deleting accepted messages',
    async () => {
      const accounts = [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ];
      await c.inspector.query(
        'DELETE FROM hash_talk.message_changes WHERE account_id=ANY($1::uuid[])',
        [accounts],
      );
      await c.inspector.query(
        'UPDATE hash_talk.message_heads SET revision=300 WHERE account_id=ANY($1::uuid[])',
        [accounts],
      );
      await c.inspector.query(
        `INSERT INTO hash_talk.message_changes(account_id,revision,ids,charge)
      SELECT a,r,NULL,512 FROM unnest($1::uuid[]) a CROSS JOIN generate_series(45,300) r`,
        [accounts],
      );
      const count = (
        await c.inspector.query<{ n: number }>(
          'SELECT count(*)::integer AS n FROM hash_talk.message_packets',
        )
      ).rows[0]?.n;
      assert.ok(count !== undefined);
      await legacyHeld(c, async () => {
        await admit(c, pair);
      });
      assert.deepEqual(
        (
          await c.inspector.query(
            `SELECT account_id,count(*)::integer AS n,min(revision)::text AS first,max(revision)::text AS last
      FROM hash_talk.message_changes WHERE account_id=ANY($1::uuid[]) GROUP BY account_id ORDER BY account_id`,
            [accounts],
          )
        ).rows,
        accounts.sort().map((account_id) => ({
          account_id,
          n: 256,
          first: '46',
          last: '301',
        })),
      );
      assert.equal(
        (
          await c.inspector.query<{ n: number }>(
            'SELECT count(*)::integer AS n FROM hash_talk.message_packets',
          )
        ).rows[0]?.n,
        count + 1,
      );
    },
  );
}
async function verifyGuards(
  t: TestContext,
  c: MessageAllocationFixture,
  pair: Pair,
) {
  const cases = [
    {
      name: 'another charged source',
      sql: 'INSERT INTO hash_talk.daily_controls(account_id) VALUES($1) ON CONFLICT(account_id) DO UPDATE SET charge=hash_talk.daily_controls.charge+1',
      values: [pair.recipient.session.accountId],
    },
    {
      name: 'an unrelated participant head',
      sql: 'INSERT INTO hash_talk.message_heads(account_id,revision) VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.message_heads.revision+1',
      values: [c.fixture.first],
    },
    {
      name: 'new attachment payload',
      sql: `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES(gen_random_uuid(),gen_random_uuid(),$1,$2,'{}',128,4224)`,
      values: [pair.sender.session.accountId, pair.recipient.session.accountId],
    },
  ];
  for (const item of cases)
    await t.test(
      'a message allocation rejects ' + item.name + ' before source effects',
      async () => {
        const before = await sourceState(c);
        await c.writer.query('BEGIN');
        const grant = await bindMessage(c, { packet: admissionPacket(pair) });
        try {
          await assert.rejects(c.writer.query(item.sql, item.values), {
            code: 'PCA01',
          });
        } finally {
          await c.writer.query('ROLLBACK');
          assert.equal(await c.allocator.finish(grant), true);
        }
        assert.deepEqual(await sourceState(c), before);
      },
    );
  await t.test(
    'an insufficient envelope refuses before inserting the packet',
    async () => {
      const before = await sourceState(c),
        packet = admissionPacket(pair);
      await c.writer.query('BEGIN');
      const grant = await bindMessage(c, { packet, bytes: 1 });
      try {
        await assert.rejects(insertAdmissionPacket(c.writer, packet), {
          code: 'PCA01',
        });
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      assert.deepEqual(await sourceState(c), before);
    },
  );
  await t.test(
    'a mismatched packet and an incomplete checkpoint fail atomically, including savepoint rollback',
    async () => {
      const packet = admissionPacket(pair);
      await c.writer.query('BEGIN');
      const grant = await bindMessage(c, { packet });
      try {
        await c.writer.query('SAVEPOINT mismatch');
        await assert.rejects(
          insertAdmissionPacket(c.writer, {
            ...packet,
            id: crypto.randomUUID(),
          }),
          { code: 'PCA01' },
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT mismatch');
        await insertAdmissionPacket(c.writer, packet);
        await assert.rejects(
          c.writer.query(
            'SELECT hash_talk.assert_message_admission_complete()',
          ),
          { code: 'PCA01' },
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
    },
  );
  await t.test(
    'missing push hints refuse the final checkpoint and savepoint rollback permits the complete effect',
    async () => {
      await addPush(c, pair);
      const packet = admissionPacket(pair),
        before = await sourceState(c);
      await c.writer.query('BEGIN');
      const grant = await bindMessage(c, { packet });
      try {
        await insertAdmissionPacket(c.writer, packet);
        await c.writer.query(
          'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3),($1,$4,$5)',
          [
            packet.id,
            packet.sender,
            pair.sender.session.deviceId,
            packet.recipient,
            pair.recipient.session.deviceId,
          ],
        );
        await recordMessageChanges(
          c.writer,
          [packet.sender, packet.recipient],
          [packet.id],
        );
        await c.writer.query('SAVEPOINT hints');
        await assert.rejects(
          c.writer.query(
            'SELECT hash_talk.assert_message_admission_complete()',
          ),
          { code: 'PCA01' },
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT hints');
        await enqueuePush(c.writer, packet.recipient, packet.sender);
        await c.writer.query(
          'SELECT hash_talk.assert_message_admission_complete()',
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      assert.deepEqual(await sourceState(c), before);
    },
  );
  await t.test(
    'ordinary application permissions suffice for declared packet, references and checkpoints',
    async () => {
      const role =
          'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', ''),
        packet = admissionPacket(pair);
      packet.kind = 'profile';
      await c.inspector
        .query(`CREATE ROLE "${role}" NOLOGIN;GRANT USAGE ON SCHEMA hash_talk TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`);
      try {
        await c.writer.query('BEGIN');
        await c.writer.query(`SET LOCAL ROLE "${role}"`);
        const grant = await bindMessage(c, { packet });
        try {
          await insertAdmissionPacket(c.writer, packet);
          await c.writer.query(
            'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3),($1,$4,$5)',
            [
              packet.id,
              packet.sender,
              pair.sender.session.deviceId,
              packet.recipient,
              pair.recipient.session.deviceId,
            ],
          );
          // Same journal operation as runtime; account locks must precede this in the application.
          await recordMessageChanges(
            c.writer,
            [packet.sender, packet.recipient],
            [packet.id],
          );
          await c.writer.query(
            'SELECT hash_talk.assert_message_admission_complete()',
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
  c: MessageAllocationFixture,
  pair: Pair,
) {
  await t.test(
    'a finalization failure retains its durable credit without reporting a committed message as lost',
    async () => {
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_refuse_message_finish() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic finalization failure';END;$$;
      CREATE TRIGGER synthetic_refuse_message_finish BEFORE DELETE ON hash_talk.content_allocations
      FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_refuse_message_finish()`);
      try {
        const packet = await admit(c, pair);
        assert.equal(
          (
            await c.inspector.query(
              'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
              [packet.id],
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await c.inspector.query(
              "SELECT 1 FROM hash_talk.content_allocations WHERE scope='message-admit'",
            )
          ).rowCount,
          1,
        );
        assert.equal(await c.db.healthy(), false);
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_refuse_message_finish ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_refuse_message_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('scoped private-message capacity preserves every admission effect and independent-pair progress', async (t) => {
  const c = await messageAllocationFixture(t);
  await t.test(
    'populated 079 to 080 migration preserves sources, charges, pending promises, quotas and old checksums',
    async () => {
      assert.deepEqual(c.upgrade.after.rows, c.upgrade.rows);
      assert.equal(c.upgrade.after.total, c.upgrade.total);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT * FROM hash_talk.schema_migrations WHERE version<=82 ORDER BY version',
          )
        ).rows,
        c.upgrade.catalog,
      );
      await assertStorageReconciled(c.inspector, c.fixture.accounts);
    },
  );
  const first = await messagePair(c),
    second = await messagePair(c);
  await verifyRuntime(t, c, first);
  await verifyConcurrency(t, c, first, second);
  await verifyAttachments(t, c, first);
  await verifyHistory(t, c, first);
  await verifyGuards(t, c, second);
  await reconciled(c, [first, second]);
  await t.test(
    '080 reversal precedes 079 and preserves all post-upgrade data and totals',
    async () => {
      const before = await sourceState(c);
      await c.inspector.query('BEGIN');
      try {
        await c.inspector.query(
          'LOCK TABLE hash_talk.message_packets,hash_talk.message_heads,hash_talk.message_references,hash_talk.message_changes,hash_talk.message_attachments,hash_talk.push_subscriptions IN ACCESS EXCLUSIVE MODE',
        );
        await reverseMessageAllocations(c.inspector, c.message);
        assert.deepEqual(await sourceState(c), before);
        assert.deepEqual(
          (
            await c.inspector.query(
              "SELECT pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure) AS definition",
            )
          ).rows[0],
          c.message[0],
        );
      } finally {
        await c.inspector.query('ROLLBACK');
      }
      await c.db.verifyMigrations();
    },
  );
  await verifyFinalization(t, c, second);
  await reconciled(c, [first, second]);
  assert.deepEqual(allocationPoolErrors, []);
});
