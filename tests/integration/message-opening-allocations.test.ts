import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import { accept, snapshots } from '../fixtures/message-removal-database.ts';
import {
  allocationWriter,
  expectNoAllocations,
} from '../fixtures/content-allocation-database.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
async function missing(c: MessageReceiptFixture, pair: Pair) {
  const packet = await accept(c, pair);
  await c.inspector.query(
    'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
    [packet.id, packet.recipient],
  );
  await c.inspector.query(
    'UPDATE hash_talk.message_packets SET charge=charge-256 WHERE id=$1',
    [packet.id],
  );
  return packet;
}
async function bind(
  c: MessageReceiptFixture,
  input: { pair: Pair; ids: string[]; bytes?: number },
  client = c.writer,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
  );
  await client.query(
    'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [
      [
        input.pair.sender.session.accountId,
        input.pair.recipient.session.accountId,
      ],
    ],
  );
  const planned = (
    await client.query<{ bytes: string }>(
      'SELECT hash_talk.prepare_message_opening($1,$2,$3::uuid[],$4::uuid[])::text AS bytes',
      [
        input.pair.recipient.session.accountId,
        input.pair.recipient.session.deviceId,
        input.ids,
        [
          input.pair.sender.session.accountId,
          input.pair.recipient.session.accountId,
        ],
      ],
    )
  ).rows[0]!;
  const grant = await c.allocator.reserve(
    client,
    input.bytes ?? Number(planned.bytes),
    'message-open',
  );
  await client.query(
    "SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)",
    [grant.transactionId, input.pair.recipient.session.accountId, input.ids[0]],
  );
  return { grant, bytes: Number(planned.bytes) };
}
async function reference(client: pg.Client, input: { pair: Pair; id: string }) {
  await client.query(
    'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3)',
    [
      input.id,
      input.pair.recipient.session.accountId,
      input.pair.recipient.session.deviceId,
    ],
  );
}
async function complete(client: pg.Client, input: { pair: Pair; id: string }) {
  await reference(client, input);
  await client.query(
    'UPDATE hash_talk.message_packets SET charge=charge+256 WHERE id=$1',
    [input.id],
  );
  await client.query('SELECT hash_talk.assert_message_opening_complete()');
}
async function runtimeCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'real missing-reference opening bypasses the old ledger; the predecessor times out and a retry spends no growth credit',
    async () => {
      const packet = await missing(c, pair),
        snapshot = await c.db.messages.snapshot(pair.recipient),
        before = await globalBytes(c.inspector);
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        const predecessor = new Database(c.url, 1_000_000_000_000);
        try {
          await assert.rejects(
            predecessor.messages.object(pair.recipient, packet.id, snapshot),
            { code: '55P03' },
          );
        } finally {
          await predecessor.close();
        }
        assert.deepEqual(
          await c.db.messages.object(pair.recipient, packet.id, snapshot),
          packet,
        );
        await c.writer.query(
          'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
        );
        c.room.bytes = 0n;
        assert.deepEqual(
          await c.db.messages.object(pair.recipient, packet.id, snapshot),
          packet,
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
        await c.writer.query('ROLLBACK');
      }
      assert.equal(await globalBytes(c.inspector), before + 256n);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'one adopted window creates references across multiple peers and both directions with exact global and personal accounting',
    async () => {
      const peer = await messageUser(c);
      await c.inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
        [peer.session.accountId, pair.recipient.session.accountId],
      );
      const first = await missing(c, pair),
        secondPair = { sender: peer, recipient: pair.recipient },
        second = await missing(c, secondPair),
        reverse = { sender: pair.recipient, recipient: pair.sender },
        third = await accept(c, reverse);
      await c.inspector.query(
        'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
        [third.id, pair.recipient.session.accountId],
      );
      await c.inspector.query(
        'UPDATE hash_talk.message_packets SET charge=charge-256 WHERE id=$1',
        [third.id],
      );
      const before = await globalBytes(c.inspector),
        snapshot = await c.db.messages.snapshot(pair.recipient),
        packets = [first, second, third];
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        assert.deepEqual(
          await c.db.messages.backupWindow(
            pair.recipient,
            packets.map((p) => p.id),
            snapshot,
          ),
          packets.map((packet) => ({ id: packet.id, packet })),
        );
      } finally {
        await c.writer.query('ROLLBACK');
      }
      assert.equal(await globalBytes(c.inspector), before + 768n);
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
        peer.session.accountId,
      ]);
    },
  );
}
async function guarded(
  c: MessageReceiptFixture,
  pair: Pair,
  work: (input: { client: pg.Client; id: string }) => Promise<void>,
  bytes?: number,
) {
  const packet = await missing(c, pair),
    before = await snapshots(c);
  await c.writer.query('BEGIN');
  const { grant } = await bind(c, {
    pair,
    ids: [packet.id],
    ...(bytes === undefined ? {} : { bytes }),
  });
  try {
    await work({ client: c.writer, id: packet.id });
  } finally {
    await c.writer.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
  assert.deepEqual(await snapshots(c), before);
}
async function guardCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  const changes = [
    ['charge', 'charge=charge+512'],
    ['body', `body=jsonb_set(body,'{signature}','"changed"')`],
    ['personal charge', 'sender_charge=sender_charge+1'],
    ['routing', 'sender=recipient,recipient=sender'],
    ['queue state', 'queue_active=false'],
    ['identity', 'id=gen_random_uuid()'],
  ];
  for (const [name, mutation] of changes)
    await t.test(
      `opening refuses unsupported packet ${name} before changing accepted data`,
      async () => {
        await guarded(c, pair, async ({ client, id }) => {
          await reference(client, { pair, id });
          await assert.rejects(
            client.query(
              `UPDATE hash_talk.message_packets SET ${mutation} WHERE id=$1`,
              [id],
            ),
            { code: 'PCA01' },
          );
        });
      },
    );
  for (const status of ['received', 'revoked'])
    await t.test(
      `opening cannot fabricate a ${status} delivery receipt`,
      async () => {
        await guarded(c, pair, async ({ client, id }) => {
          await assert.rejects(
            client.query(
              'INSERT INTO hash_talk.message_references(message_id,account_id,device_id,status) VALUES($1,$2,$3,$4)',
              [
                id,
                pair.recipient.session.accountId,
                pair.recipient.session.deviceId,
                status,
              ],
            ),
            { code: 'PCA01' },
          );
        });
      },
    );
  await t.test(
    'wrong account/device/binding and unadopted source writes are rejected',
    async () => {
      for (const kind of ['account', 'device', 'operation', 'delete'])
        await guarded(c, pair, async ({ client, id }) => {
          if (kind === 'delete')
            await assert.rejects(
              client.query(
                'DELETE FROM hash_talk.message_packets WHERE id=$1',
                [id],
              ),
              { code: 'PCA01' },
            );
          else {
            const setting =
              kind === 'account'
                ? 'hash_talk.content_account'
                : kind === 'device'
                  ? 'hash_talk.content_open_device'
                  : 'hash_talk.content_operation';
            await client.query('SELECT set_config($1,$2,true)', [
              setting,
              crypto.randomUUID(),
            ]);
            await assert.rejects(reference(client, { pair, id }), {
              code: 'PCA01',
            });
          }
        });
    },
  );
  await t.test(
    'an exhausted pre-write envelope refuses the actual reference effect',
    async () => {
      await guarded(
        c,
        pair,
        async ({ client, id }) => {
          await assert.rejects(reference(client, { pair, id }), {
            code: 'PCA01',
          });
        },
        1,
      );
    },
  );
  await t.test(
    'omitting the packet charge, omitting all effects and losing accounting fail completeness',
    async () => {
      for (const missingEffect of ['charge', 'all', 'accounting'])
        await guarded(c, pair, async ({ client, id }) => {
          if (missingEffect !== 'all') await reference(client, { pair, id });
          if (missingEffect === 'accounting') {
            await client.query(
              'UPDATE hash_talk.message_packets SET charge=charge+256 WHERE id=$1',
              [id],
            );
            await client.query('DELETE FROM hash_talk.content_usage_legacy');
            await assert.rejects(
              client.query(
                'SELECT hash_talk.assert_message_opening_complete()',
              ),
              /Global accounting unavailable/u,
            );
          } else
            await assert.rejects(
              client.query(
                'SELECT hash_talk.assert_message_opening_complete()',
              ),
              { code: 'PCA01' },
            );
        });
    },
  );
  await t.test(
    'a savepoint restores reference marks and consumed bytes before a successful complete operation',
    async () => {
      await guarded(c, pair, async ({ client, id }) => {
        await client.query('SAVEPOINT before_reference');
        await reference(client, { pair, id });
        await client.query('ROLLBACK TO SAVEPOINT before_reference');
        await complete(client, { pair, id });
      });
    },
  );
}
async function preparationCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'preparation rejects oversized/duplicate windows, foreign or already referenced packets and unselected effects',
    async () => {
      const packet = await missing(c, pair),
        existing = await accept(c, pair),
        foreignPair = await messagePair(c),
        foreign = await accept(c, foreignPair);
      for (const ids of [
        [],
        Array.from({ length: 33 }, () => crypto.randomUUID()),
        [packet.id, packet.id],
        [existing.id],
        [foreign.id],
      ]) {
        await c.writer.query('BEGIN');
        try {
          await assert.rejects(
            c.writer.query(
              'SELECT hash_talk.prepare_message_opening($1,$2,$3::uuid[],$4::uuid[])',
              [
                pair.recipient.session.accountId,
                pair.recipient.session.deviceId,
                ids,
                [
                  pair.sender.session.accountId,
                  pair.recipient.session.accountId,
                ],
              ],
            ),
            { code: 'PCA01' },
          );
        } finally {
          await c.writer.query('ROLLBACK');
        }
      }
      await guarded(c, pair, async ({ client }) => {
        await assert.rejects(reference(client, { pair, id: packet.id }), {
          code: 'PCA01',
        });
      });
    },
  );
}
async function ordinaryCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'ordinary permissions commit exact charges and reuse a metadata-only temporary plan truncated at COMMIT',
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
          oid = await committedOpening(c, { pair, client, expectedOid: oid });
      } finally {
        await client.end();
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function committedOpening(
  c: MessageReceiptFixture,
  input: { pair: Pair; client: pg.Client; expectedOid: string | undefined },
): Promise<string> {
  const { pair, client, expectedOid } = input;
  const packet = await missing(c, pair),
    before = await globalBytes(c.inspector);
  await client.query('BEGIN');
  const { grant } = await bind(c, { pair, ids: [packet.id] }, client);
  try {
    const oid = (
      await client.query<{ oid: string }>(
        "SELECT 'pg_temp.hash_talk_opening_plan'::regclass::oid::text AS oid",
      )
    ).rows[0]!.oid;
    if (expectedOid) assert.equal(oid, expectedOid);
    assert.equal(
      (
        await client.query<{ body: boolean }>(
          "SELECT bool_or(before_state ? 'body') AS body FROM pg_temp.hash_talk_opening_plan",
        )
      ).rows[0]!.body,
      false,
    );
    await complete(client, { pair, id: packet.id });
    await client.query('COMMIT');
    assert.equal(
      (await client.query('SELECT * FROM pg_temp.hash_talk_opening_plan'))
        .rowCount,
      0,
    );
    assert.equal(await globalBytes(c.inspector), before + 256n);
    return oid;
  } finally {
    await client.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
}
async function envelopeCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'a maximum window plan contains metadata only and does not grant large cold ciphertext as new storage',
    async () => {
      const packet = admissionPacket(pair);
      packet.content.ciphertext = randomBytes(2_000_000)
        .toString('base64')
        .replace(/=+$/u, '');
      await c.db.messages.admit(pair.sender, packet, 'a'.repeat(64));
      await c.inspector.query(
        'DELETE FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2',
        [packet.id, packet.recipient],
      );
      await c.inspector.query(
        'UPDATE hash_talk.message_packets SET charge=charge-256 WHERE id=$1',
        [packet.id],
      );
      const ids = [packet.id];
      for (let index = 1; index < 32; index++)
        ids.push((await missing(c, pair)).id);
      await c.writer.query('BEGIN');
      const { grant, bytes } = await bind(c, { pair, ids });
      try {
        assert.ok(bytes < 2_000_000);
        assert.equal(
          (await c.writer.query('SELECT * FROM pg_temp.hash_talk_opening_plan'))
            .rowCount,
          32,
        );
        for (const id of ids) {
          await reference(c.writer, { pair, id });
          await c.writer.query(
            'UPDATE hash_talk.message_packets SET charge=charge+256 WHERE id=$1',
            [id],
          );
        }
        await c.writer.query(
          'SELECT hash_talk.assert_message_opening_complete()',
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
    },
  );
}
async function finalizationCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'successful opening retains durable credit and fails health if post-COMMIT finalization fails, then bounded recovery releases it',
    async () => {
      const packet = await missing(c, pair),
        snapshot = await c.db.messages.snapshot(pair.recipient);
      await c.inspector.query(
        `CREATE FUNCTION hash_talk.synthetic_open_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic finish failure';END;$$;CREATE TRIGGER synthetic_open_finish BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_open_finish()`,
      );
      try {
        assert.deepEqual(
          await c.db.messages.object(pair.recipient, packet.id, snapshot),
          packet,
        );
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT * FROM hash_talk.content_allocations WHERE scope='message-open'",
            )
          ).rowCount,
          1,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_open_finish ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_open_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('private opening allocations preserve authorization, exact references and complete future-history effects', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await runtimeCases(t, c, pair);
  await guardCases(t, c, pair);
  await preparationCases(t, c, pair);
  await ordinaryCase(t, c, pair);
  await envelopeCase(t, c, pair);
  await finalizationCase(t, c, pair);
  await assertStorageReconciled(c.inspector, [
    pair.sender.session.accountId,
    pair.recipient.session.accountId,
  ]);
});
