import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { deleteMessageCopies } from '../../src/server/database/message-deletion.ts';
import { recordMessageChanges } from '../../src/server/database/message-changes.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import {
  proof,
  target,
  accept,
  message,
  snapshots,
  bindRemoval,
  seedRemovalBatch,
  removalHash as hash,
} from '../fixtures/message-removal-database.ts';
import {
  allocationWriter,
  expectNoAllocations,
  allocationPoolErrors,
} from '../fixtures/content-allocation-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const full = 1_000_000_000_000n;
async function heldLedger(
  c: MessageReceiptFixture,
  work: () => Promise<unknown>,
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
function participants(pair: Pair) {
  return [pair.sender.session.accountId, pair.recipient.session.accountId];
}
async function guarded(
  c: MessageReceiptFixture,
  input: Parameters<typeof bindRemoval>[1],
  work: (client: pg.Client) => Promise<void>,
) {
  await c.writer.query('BEGIN');
  const { grant } = await bindRemoval(c, input);
  try {
    await work(c.writer);
  } finally {
    await c.writer.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
}
async function runtimeCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'a real sender deletion bypasses the held legacy ledger under pressure and keeps exact proof charges, journals and attachment promises',
    async () => {
      const packet = await accept(c, pair),
        before = await globalBytes(c.inspector),
        p = proof(pair.sender);
      const acceptedAttachment = crypto.randomUUID(),
        readyAttachment = crypto.randomUUID();
      await c.inspector.query(
        `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status)
        VALUES($1,$3,$4,$5,'{}',128,640,'accepted'),($2,$3,$4,$5,'{}',128,640,'ready')`,
        [
          acceptedAttachment,
          readyAttachment,
          packet.id,
          packet.sender,
          packet.recipient,
        ],
      );
      const pending = await c.db.storageReservations.snapshot();
      await heldLedger(c, async () => {
        const predecessor = new Database(c.url, 1_000_000_000_000);
        try {
          await assert.rejects(
            predecessor.messages.remove(pair.sender, packet.id, hash, p),
            { code: '55P03' },
          );
        } finally {
          await predecessor.close();
        }
        c.room.bytes = 0n;
        await c.db.messages.remove(pair.sender, packet.id, hash, p);
      });
      const row = await message(c, packet.id),
        charge = Buffer.byteLength(JSON.stringify(p)) + 512;
      assert.equal(row.charge, charge);
      assert.equal(row.sender_charge, charge);
      assert.equal(row.recipient_charge, charge);
      assert.equal(row.available, false);
      assert.ok((await globalBytes(c.inspector)) < before);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.message_attachments WHERE id=$1',
            [acceptedAttachment],
          )
        ).rows,
        [{ status: 'deleting', charge: 640 }],
      );
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.message_attachments WHERE id=$1',
            [readyAttachment],
          )
        ).rows,
        [{ status: 'ready', charge: 640 }],
      );
      assert.deepEqual(await c.db.storageReservations.snapshot(), pending);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'private personal cleanup, including both-removal collection, progresses under the old ledger lock and zero growth room',
    async () => {
      const packet = await accept(c, pair),
        items = [target(packet.id)],
        attachment = crypto.randomUUID();
      await c.inspector.query(
        `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status) VALUES($1,$2,$3,$4,'{}',128,640,'accepted')`,
        [attachment, packet.id, packet.sender, packet.recipient],
      );
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.sender, proof(pair.sender, items));
        assert.equal((await message(c, packet.id)).available, true);
        assert.deepEqual(
          (
            await c.inspector.query(
              'SELECT status,charge FROM hash_talk.message_attachments WHERE id=$1',
              [attachment],
            )
          ).rows,
          [{ status: 'accepted', charge: 640 }],
        );
        await c.db.backups.clean(pair.recipient, proof(pair.recipient, items));
      });
      assert.equal((await message(c, packet.id)).personal_collected, true);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,charge FROM hash_talk.message_attachments WHERE id=$1',
            [attachment],
          )
        ).rows,
        [{ status: 'deleting', charge: 640 }],
      );
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'unchanged retries do not borrow the coordinator or create temporary plan rows',
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
          'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
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
        c.room.bytes = full;
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'a multi-peer selection spanning both sender directions preserves the other owners and stays one transaction',
    async () => {
      const third = await messageUser(c),
        other = { sender: third, recipient: pair.sender };
      await c.inspector.query(
        `INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')`,
        [third.session.accountId, pair.sender.session.accountId],
      );
      const first = await accept(c, pair),
        second = await accept(c, other),
        items = [target(first.id), target(second.id)];
      await heldLedger(c, () =>
        c.db.backups
          .clean(pair.sender, proof(pair.sender, items))
          .then(() => {}),
      );
      assert.equal((await message(c, first.id)).sender_charge, 0);
      assert.equal((await message(c, second.id)).recipient_charge, 0);
      assert.ok((await message(c, first.id)).recipient_charge > 0);
      assert.ok((await message(c, second.id)).sender_charge > 0);
      await assertStorageReconciled(c.inspector, [
        ...participants(pair),
        third.session.accountId,
      ]);
    },
  );
}
async function coexistenceCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'maintenance credits consume the existing SQL reserve once and do not prevent an independent growth grant',
    async () => {
      const other = await messagePair(c),
        packet = await accept(c, pair);
      await c.writer.query('BEGIN');
      const { grant } = await bindRemoval(c, {
        actor: pair.sender,
        participants: participants(pair),
        kind: 'delete',
        items: [target(packet.id)],
        bytes: 64 * 1024 * 1024,
      });
      try {
        await c.inspector.query('BEGIN');
        await c.inspector.query('SELECT pg_current_xact_id()');
        const policy = new VolumeContentCapacity({
          read: () => Promise.resolve(c.room.bytes),
        });
        const available = await policy.allocationHeadroom(c.inspector);
        await c.inspector.query('ROLLBACK');
        c.room.bytes = full - available + 4_000_000n;
        const fresh = await accept(c, other);
        assert.equal((await message(c, fresh.id)).available, true);
      } finally {
        await c.inspector.query('ROLLBACK');
        await c.writer.query('ROLLBACK');
        c.room.bytes = full;
        await c.allocator.finish(grant);
      }
      await assertStorageReconciled(c.inspector, [
        ...participants(pair),
        ...participants(other),
      ]);
    },
  );
  await t.test(
    'the deletion scope charges and completes bounded journal pruning for both owners',
    async () => {
      const packet = await accept(c, pair);
      await c.inspector.query('BEGIN');
      try {
        for (let index = 0; index < 256; index++)
          await recordMessageChanges(c.inspector, participants(pair), [
            packet.id,
          ]);
        await c.inspector.query('COMMIT');
      } finally {
        await c.inspector.query('ROLLBACK');
      }
      await heldLedger(c, () =>
        c.db.messages.remove(pair.sender, packet.id, hash, proof(pair.sender)),
      );
      const rows = (
        await c.inspector.query<{ n: number }>(
          `SELECT count(*)::integer AS n FROM hash_talk.message_changes WHERE account_id=ANY($1::uuid[]) GROUP BY account_id`,
          [participants(pair)],
        )
      ).rows;
      assert.deepEqual(
        rows.map((row) => row.n),
        [256, 256],
      );
      await assertStorageReconciled(c.inspector, participants(pair));
    },
  );
  for (const rootFirst of [true, false])
    await t.test(
      `overlapping original/action selections preserve sequential cleanup atomicity (original first: ${rootFirst})`,
      async () => {
        const root = admissionPacket(pair);
        root.id = crypto.randomUUID();
        const action = {
          ...admissionPacket(pair),
          relation: {
            type: 'edit' as const,
            id: root.id,
            hash,
            author: root.sender,
          },
        };
        const ids = [root.id, action.id].sort();
        root.id = ids[rootFirst ? 0 : 1]!;
        action.id = ids[rootFirst ? 1 : 0]!;
        action.relation.id = root.id;
        await c.db.messages.admit(pair.sender, root, hash);
        await c.db.messages.admit(pair.sender, action, hash);
        await c.db.backups.clean(
          pair.recipient,
          proof(pair.recipient, [target(root.id)]),
        );
        const items = [target(root.id), target(action.id)],
          before = await snapshots(c);
        if (rootFirst) {
          await assert.rejects(
            c.db.backups.clean(pair.sender, proof(pair.sender, items)),
            { status: 409 },
          );
          assert.deepEqual(await snapshots(c), before);
        } else {
          await heldLedger(c, () =>
            c.db.backups.clean(pair.sender, proof(pair.sender, items)),
          );
          assert.equal((await message(c, root.id)).personal_collected, true);
          assert.equal((await message(c, action.id)).personal_collected, true);
        }
        await expectNoAllocations(c.inspector);
      },
    );
}
async function guardCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  const packet = await accept(c, pair),
    selection = {
      actor: pair.sender,
      participants: participants(pair),
      kind: 'clean' as const,
      items: [target(packet.id)],
    };
  const mutations = [
    [
      'new ciphertext',
      `UPDATE hash_talk.message_packets SET body=jsonb_set(body,'{signature}','"changed"') WHERE id=$1`,
    ],
    [
      'packet identity',
      `UPDATE hash_talk.message_packets SET hash=repeat('b',64),sender_charge=0 WHERE id=$1`,
    ],
    ['packet deletion', `DELETE FROM hash_talk.message_packets WHERE id=$1`],
    [
      'unpaid packet growth',
      `UPDATE hash_talk.message_packets SET charge=charge+1 WHERE id=$1`,
    ],
    [
      'reference status update',
      `UPDATE hash_talk.message_references SET status='received' WHERE message_id=$1`,
    ],
    [
      'reference insertion',
      `INSERT INTO hash_talk.message_references(message_id,account_id,device_id) SELECT id,sender,gen_random_uuid() FROM hash_talk.message_packets WHERE id=$1`,
    ],
    [
      'new read mark',
      `INSERT INTO hash_talk.message_reads(message_id,account_id,charge) SELECT id,recipient,256 FROM hash_talk.message_packets WHERE id=$1`,
    ],
    [
      'other writer source',
      `UPDATE hash_talk.message_recovery_keys SET charge=charge+1 WHERE account_id=(SELECT sender FROM hash_talk.message_packets WHERE id=$1)`,
    ],
  ];
  for (const [label, sql] of mutations)
    await t.test(`${label} is refused before any source change`, async () => {
      const before = await snapshots(c);
      await guarded(c, selection, (client) =>
        assert.rejects(client.query(sql!, [packet.id]), { code: 'PCA01' }),
      );
      assert.deepEqual(await snapshots(c), before);
    });
  await t.test(
    'other-owner reference deletion and an unselected packet are outside a personal grant',
    async () => {
      const other = await accept(c, pair),
        before = await snapshots(c);
      await guarded(c, selection, async (client) => {
        await assert.rejects(
          client.query(
            'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
            [packet.id, packet.recipient],
          ),
          { code: 'PCA01' },
        );
      });
      await guarded(c, selection, async (client) => {
        await assert.rejects(
          client.query(
            'UPDATE hash_talk.message_packets SET sender_charge=0 WHERE id=$1',
            [other.id],
          ),
          { code: 'PCA01' },
        );
      });
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'source costs refuse an undersized envelope and binding changes',
    async () => {
      const before = await snapshots(c);
      await guarded(c, { ...selection, bytes: 1 }, (client) =>
        assert.rejects(
          client.query(
            'UPDATE hash_talk.message_packets SET sender_charge=0 WHERE id=$1',
            [packet.id],
          ),
          { code: 'PCA01' },
        ),
      );
      await guarded(c, selection, async (client) => {
        await client.query(
          "SELECT set_config('hash_talk.content_account',$1,true)",
          [packet.recipient],
        );
        await assert.rejects(
          client.query(
            'UPDATE hash_talk.message_packets SET sender_charge=0 WHERE id=$1',
            [packet.id],
          ),
          { code: 'PCA01' },
        );
      });
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'maintenance grants cannot exceed the existing per-owner operating reserve',
    async () => {
      const before = await snapshots(c);
      await c.writer.query('BEGIN');
      try {
        await assert.rejects(
          c.allocator.reserve(c.writer, 64 * 1024 * 1024 + 1, 'message-remove'),
          { status: 503 },
        );
      } finally {
        await c.writer.query('ROLLBACK');
      }
      await expectNoAllocations(c.inspector);
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'ready attachment acceptance and accepted-payload charge changes are not removal effects',
    async () => {
      const ready = crypto.randomUUID(),
        accepted = crypto.randomUUID();
      await c.inspector.query(
        `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status)
      VALUES($1,$3,$4,$5,'{}',128,640,'ready'),($2,$3,$4,$5,'{}',128,640,'accepted')`,
        [ready, accepted, packet.id, packet.sender, packet.recipient],
      );
      const deletion = { ...selection, kind: 'delete' as const },
        before = await snapshots(c);
      await guarded(c, deletion, (client) =>
        assert.rejects(
          client.query(
            "UPDATE hash_talk.message_attachments SET status='accepted' WHERE id=$1",
            [ready],
          ),
          { code: 'PCA01' },
        ),
      );
      await guarded(c, deletion, (client) =>
        assert.rejects(
          client.query(
            "UPDATE hash_talk.message_attachments SET status='deleting',charge=0 WHERE id=$1",
            [accepted],
          ),
          { code: 'PCA01' },
        ),
      );
      assert.deepEqual(await snapshots(c), before);
    },
  );
  await t.test(
    'a superficially valid packet change cannot commit without receipts, references, collection and the change checkpoint',
    async () => {
      const before = await snapshots(c);
      await guarded(c, selection, async (client) => {
        await client.query(
          'UPDATE hash_talk.message_packets SET sender_charge=0 WHERE id=$1',
          [packet.id],
        );
        await assert.rejects(
          client.query('SELECT hash_talk.assert_message_removal_complete()'),
          { code: 'PCA01' },
        );
      });
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function committedDeletion(
  c: MessageReceiptFixture,
  input: { pair: Pair; client: pg.Client; expectedOid: string | undefined },
): Promise<string> {
  const { pair, client, expectedOid } = input,
    packet = await accept(c, pair);
  await client.query('BEGIN');
  const { grant } = await bindRemoval(
    c,
    {
      actor: pair.sender,
      participants: participants(pair),
      kind: 'delete',
      items: [target(packet.id)],
    },
    client,
  );
  try {
    const current = (
      await client.query<{ oid: string }>(
        "SELECT 'pg_temp.hash_talk_removal_plan'::regclass::oid::text AS oid",
      )
    ).rows[0]!.oid;
    if (expectedOid) assert.equal(current, expectedOid);
    await deleteMessageCopies(client, {
      id: packet.id,
      proof: proof(pair.sender),
      sender: packet.sender,
      recipient: packet.recipient,
    });
    await client.query('SELECT hash_talk.assert_message_removal_complete()');
    await client.query('COMMIT');
    assert.equal(
      (await client.query('SELECT * FROM pg_temp.hash_talk_removal_plan'))
        .rowCount,
      0,
    );
    return current;
  } finally {
    await client.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
}
async function failureCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'skipping an actual reference delete fails completeness and rolls every effect back',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_skip_removal() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END;$$;
      CREATE TRIGGER synthetic_skip_removal BEFORE DELETE ON hash_talk.message_references FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_skip_removal()`);
      try {
        await assert.rejects(
          c.db.messages.remove(
            pair.sender,
            packet.id,
            hash,
            proof(pair.sender),
          ),
          { status: 503 },
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_skip_removal ON hash_talk.message_references;DROP FUNCTION hash_talk.synthetic_skip_removal()',
        );
      }
      assert.deepEqual(await snapshots(c), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'journal/checkpoint failure rolls back deletion, personal counters and garbage transitions',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_fail_removal() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic checkpoint refusal';END;$$;
      CREATE TRIGGER synthetic_fail_removal BEFORE INSERT ON hash_talk.message_changes FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_fail_removal()`);
      try {
        await assert.rejects(
          c.db.messages.remove(
            pair.sender,
            packet.id,
            hash,
            proof(pair.sender),
          ),
          /synthetic checkpoint refusal/u,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_fail_removal ON hash_talk.message_changes;DROP FUNCTION hash_talk.synthetic_fail_removal()',
        );
      }
      assert.deepEqual(await snapshots(c), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'an omitted personal receipt prevents collection and rolls the complete cleanup back',
    async () => {
      const packet = await accept(c, pair),
        items = [target(packet.id)];
      await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      const before = await snapshots(c);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_skip_receipt() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END;$$;
      CREATE TRIGGER synthetic_skip_receipt BEFORE INSERT ON hash_talk.personal_removals FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_skip_receipt()`);
      try {
        await assert.rejects(
          c.db.backups.clean(pair.recipient, proof(pair.recipient, items)),
          { status: 503 },
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_skip_receipt ON hash_talk.personal_removals;DROP FUNCTION hash_talk.synthetic_skip_receipt()',
        );
      }
      assert.deepEqual(await snapshots(c), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'missing global accounting refuses deletion and preserves all accepted source rows',
    async () => {
      const packet = await accept(c, pair),
        before = await snapshots(c);
      const ledger = (
        await c.inspector.query<{ used_bytes: string }>(
          'DELETE FROM hash_talk.content_usage_legacy WHERE singleton RETURNING used_bytes::text',
        )
      ).rows[0]!;
      try {
        await assert.rejects(
          c.db.messages.remove(
            pair.sender,
            packet.id,
            hash,
            proof(pair.sender),
          ),
          /Contagem global indisponível/u,
        );
      } finally {
        await c.inspector.query(
          'INSERT INTO hash_talk.content_usage_legacy(singleton,used_bytes) VALUES(true,$1)',
          [ledger.used_bytes],
        );
      }
      assert.deepEqual(await snapshots(c), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'savepoint rollback restores the plan, its cost budget and every owner effect before a complete deletion',
    async () => {
      const packet = await accept(c, pair),
        selection = {
          actor: pair.sender,
          participants: participants(pair),
          kind: 'delete' as const,
          items: [target(packet.id)],
        };
      await guarded(c, selection, async (client) => {
        await client.query('SAVEPOINT attempt');
        await deleteMessageCopies(client, {
          id: packet.id,
          proof: proof(pair.sender),
          sender: packet.sender,
          recipient: packet.recipient,
        });
        await client.query(
          'SELECT hash_talk.assert_message_removal_complete()',
        );
        await client.query('ROLLBACK TO SAVEPOINT attempt');
        assert.equal(
          (
            await client.query<{ n: number }>(
              'SELECT sum(writes)::integer AS n FROM pg_temp.hash_talk_removal_plan',
            )
          ).rows[0]?.n,
          0,
        );
        await deleteMessageCopies(client, {
          id: packet.id,
          proof: proof(pair.sender),
          sender: packet.sender,
          recipient: packet.recipient,
        });
        await client.query(
          'SELECT hash_talk.assert_message_removal_complete()',
        );
      });
      assert.equal((await message(c, packet.id)).available, true);
    },
  );
  await t.test(
    'ordinary app permissions can create and consume a bounded temporary plan, which truncates at commit and is reused',
    async () => {
      const role =
        'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      await c.inspector.query(
        `CREATE ROLE "${role}" NOLOGIN;GRANT USAGE ON SCHEMA hash_talk TO "${role}";GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`,
      );
      const client = allocationWriter(c.url, role);
      await client.connect();
      try {
        let oid: string | undefined;
        for (let iteration = 0; iteration < 2; iteration++)
          oid = await committedDeletion(c, { pair, client, expectedOid: oid });
      } finally {
        await client.end();
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function envelopeCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'large cold ciphertext never becomes a newly written payload or a temporary plan body',
    async () => {
      const packet = admissionPacket(pair);
      packet.content.ciphertext = randomBytes(2_000_000)
        .toString('base64')
        .replace(/=+$/u, '');
      await c.db.messages.admit(pair.sender, packet, hash);
      await c.writer.query('BEGIN');
      const { grant, plannedBytes } = await bindRemoval(c, {
        actor: pair.sender,
        participants: participants(pair),
        kind: 'clean',
        items: [target(packet.id)],
      });
      try {
        assert.ok(plannedBytes < 1_000_000);
        assert.equal(
          (
            await c.writer.query<{ has_body: boolean }>(
              "SELECT bool_or(before_state ? 'body' OR after_state ? 'body') AS has_body FROM pg_temp.hash_talk_removal_plan",
            )
          ).rows[0]?.has_body,
          false,
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [target(packet.id)]),
        );
      });
      assert.equal((await message(c, packet.id)).available, true);
    },
  );
  await t.test(
    'the approved eight-original/64-actions batch with 32 historical actor devices fits the existing SQL reserve',
    async () => {
      const seeded = await seedRemovalBatch(c, {
        pair,
        roots: 8,
        actions: 64,
        devices: 32,
        peerDevices: 32,
      });
      await c.writer.query('BEGIN');
      const { grant, plannedBytes } = await bindRemoval(c, {
        actor: pair.sender,
        participants: participants(pair),
        kind: 'clean',
        items: seeded.items,
      });
      try {
        assert.ok(plannedBytes <= 64 * 1024 * 1024);
        t.diagnostic(
          `Maximum metadata batch planned ${plannedBytes} bytes for ${seeded.ids.length} packets and ${seeded.removedReferences} removed references.`,
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      const before = await globalBytes(c.inspector),
        p = proof(pair.sender, seeded.items),
        receiptCharge = Buffer.byteLength(JSON.stringify(p)) + 512;
      const pruned = await prunedBytes(c, pair.sender.session.accountId);
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.sender, p);
      });
      assert.equal(
        (await globalBytes(c.inspector)) - before,
        BigInt(8 * receiptCharge + 512 - seeded.removedReferences * 256) -
          pruned,
      );
      const remaining = (
        await c.inspector.query<{ n: number }>(
          `SELECT count(*)::integer AS n FROM hash_talk.message_references WHERE message_id=ANY($1::uuid[])`,
          [seeded.ids],
        )
      ).rows[0]!.n;
      assert.equal(remaining, seeded.remainingReferences);
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (body IS NULL OR sender_charge<>0)',
            [seeded.ids],
          )
        ).rowCount,
        0,
      );
      await assertStorageReconciled(c.inspector, participants(pair));
      await maximumCollection(c, { pair, seeded, context: t });
    },
  );
}
async function prunedBytes(
  c: MessageReceiptFixture,
  account: string,
): Promise<bigint> {
  return BigInt(
    (
      await c.inspector.query<{ bytes: string }>(
        `SELECT coalesce(sum(c.charge),0)::text AS bytes FROM hash_talk.message_changes c JOIN hash_talk.message_heads h USING(account_id) WHERE c.account_id=$1 AND c.revision<=h.revision+1-256`,
        [account],
      )
    ).rows[0]!.bytes,
  );
}
async function maximumCollection(
  c: MessageReceiptFixture,
  input: {
    pair: Pair;
    seeded: Awaited<ReturnType<typeof seedRemovalBatch>>;
    context: TestContext;
  },
): Promise<void> {
  const { pair, seeded, context } = input;
  await c.writer.query('BEGIN');
  const { grant, plannedBytes } = await bindRemoval(c, {
    actor: pair.recipient,
    participants: participants(pair),
    kind: 'clean',
    items: seeded.items,
  });
  try {
    assert.ok(plannedBytes <= 64 * 1024 * 1024);
    context.diagnostic(
      `Maximum collection planned ${plannedBytes} bytes for both-removal ciphertext retirement.`,
    );
  } finally {
    await c.writer.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
  const before = await globalBytes(c.inspector),
    p = proof(pair.recipient, seeded.items),
    receiptCharge = Buffer.byteLength(JSON.stringify(p)) + 512;
  const retired = BigInt(
      (
        await c.inspector.query<{ bytes: string }>(
          'SELECT sum(charge-4096)::text AS bytes FROM hash_talk.message_packets WHERE id=ANY($1::uuid[])',
          [seeded.ids],
        )
      ).rows[0]!.bytes,
    ),
    pruned = await prunedBytes(c, pair.recipient.session.accountId);
  await heldLedger(c, async () => {
    c.room.bytes = 0n;
    await c.db.backups.clean(pair.recipient, p);
  });
  assert.equal(
    (await globalBytes(c.inspector)) - before,
    BigInt(8 * receiptCharge + 512) - retired - pruned,
  );
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.message_references WHERE message_id=ANY($1::uuid[])',
        [seeded.ids],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (body IS NOT NULL OR NOT personal_collected OR charge<>4096 OR sender_charge<>0 OR recipient_charge<>0)',
        [seeded.ids],
      )
    ).rowCount,
    0,
  );
  await assertStorageReconciled(c.inspector, participants(pair));
}
async function finalization(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'an acknowledged removal keeps its durable credit on finalization failure until bounded recovery',
    async () => {
      const packet = await accept(c, pair);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_removal_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic removal finalization failure';END;$$;
      CREATE TRIGGER synthetic_removal_finish BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_removal_finish()`);
      try {
        await c.db.messages.remove(
          pair.sender,
          packet.id,
          hash,
          proof(pair.sender),
        );
        assert.equal((await message(c, packet.id)).available, false);
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT * FROM hash_talk.content_allocations WHERE scope='message-remove'",
            )
          ).rowCount,
          1,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_removal_finish ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_removal_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('private removal allocations preserve exact future-history contracts without the singleton ledger', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await runtimeCases(t, c, pair);
  await coexistenceCases(t, c, pair);
  await guardCases(t, c, pair);
  await failureCases(t, c, pair);
  await envelopeCases(t, c, pair);
  await assertStorageReconciled(c.inspector, participants(pair));
  await finalization(t, c, pair);
  await assertStorageReconciled(c.inspector, participants(pair));
  assert.deepEqual(allocationPoolErrors, []);
});
