import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import type { TestContext } from 'node:test';
import { Database } from '../../src/server/database/index.ts';
import { partLimit } from '../../src/shared/attachments/index.ts';
import type { AttachmentRef } from '../../src/shared/attachments/index.ts';
import { vaultQuota } from '../../src/shared/vault/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import {
  globalBytes,
  globalSourceSnapshot,
} from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { expectNoAllocations } from '../fixtures/content-allocation-database.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const full = 1_000_000_000_000n;
function ref(bytes = 128): AttachmentRef {
  return {
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    bytes,
    parts: Array.from({ length: Math.ceil(bytes / partLimit) }, (_, i) => ({
      hash: 'b'.repeat(64),
      bytes: Math.min(partLimit, bytes - i * partLimit),
    })),
  };
}
function input(pair: Pair, refs = [ref()]) {
  return {
    message: crypto.randomUUID(),
    peer: pair.recipient.session.accountId,
    accountId: pair.sender.session.accountId,
    refs,
  };
}
type Input = ReturnType<typeof input>;
async function state(c: MessageReceiptFixture) {
  return {
    rows: (
      await c.inspector.query<Record<string, unknown>>(
        'SELECT * FROM hash_talk.message_attachments ORDER BY id',
      )
    ).rows,
    bytes: await globalBytes(c.inspector),
    pending: await c.db.storageReservations.snapshot(),
  };
}
async function held(
  c: MessageReceiptFixture,
  sql: string,
  work: () => Promise<void>,
) {
  await c.reader.query('BEGIN');
  try {
    await c.reader.query(sql);
    await work();
  } finally {
    await c.reader.query('ROLLBACK');
    c.room.bytes = full;
  }
}
async function bound(
  c: MessageReceiptFixture,
  i: Input,
  work: () => Promise<void>,
  options: { bytes?: number; role?: string } = {},
) {
  await c.writer.query('BEGIN');
  let grant;
  try {
    if (options.role) await c.writer.query(`SET LOCAL ROLE "${options.role}"`);
    const plan = await c.writer.query<{ bytes: string }>(
      'SELECT hash_talk.prepare_attachment_reservation($1,$2,$3,$4::jsonb)::text AS bytes',
      [i.accountId, i.peer, i.message, JSON.stringify(i.refs)],
    );
    grant = await c.allocator.reserve(
      c.writer,
      options.bytes ?? Number(plan.rows[0]!.bytes),
      'attachment-reserve',
    );
    await c.writer.query(
      "SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)",
      [grant.transactionId, i.accountId, i.message],
    );
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
    if (grant) await c.allocator.finish(grant);
  }
}
async function insertPlanned(
  c: MessageReceiptFixture,
  id: string,
  patch: object = {},
) {
  await c.writer.query(
    `INSERT INTO hash_talk.message_attachments SELECT (jsonb_populate_record(NULL::hash_talk.message_attachments,
      (current_setting('hash_talk.content_attachment_plan')::jsonb->$1->'after')||$2::jsonb)).*`,
    [id, JSON.stringify(patch)],
  );
}
async function complete(c: MessageReceiptFixture) {
  await c.writer.query(
    'SELECT hash_talk.assert_attachment_reservation_complete()',
  );
}
async function runtime(t: TestContext, c: MessageReceiptFixture, pair: Pair) {
  await t.test(
    'private growth succeeds under an unrelated legacy-ledger lock; numeric predecessor still waits',
    async () => {
      const i = input(pair),
        before = await state(c);
      await held(
        c,
        'SELECT * FROM hash_talk.content_usage_legacy FOR UPDATE',
        async () => {
          const legacy = new Database(c.url, Number(full));
          try {
            await assert.rejects(legacy.attachments.reserve(pair.sender, i), {
              code: '55P03',
            });
          } finally {
            await legacy.close();
          }
          await c.db.attachments.reserve(pair.sender, i);
        },
      );
      const after = await state(c);
      assert.equal(after.bytes - before.bytes, 4224n);
      assert.equal(
        after.pending.reservedBytes - before.pending.reservedBytes,
        4224,
      );
      assert.equal(after.pending.reservations - before.pending.reservations, 1);
      await assertStorageReconciled(c.inspector, [i.accountId, i.peer]);
    },
  );
  await t.test(
    'an identical retry retains an active writer and received parts with zero headroom and held ledger/coordinator',
    async () => {
      const i = input(pair),
        writer = crypto.randomUUID();
      await c.db.attachments.reserve(pair.sender, i);
      await c.inspector.query(
        "UPDATE hash_talk.message_attachments SET status='writing',writer=$2,received='{0}' WHERE id=$1",
        [i.refs[0]!.id, writer],
      );
      const before = await state(c);
      await held(
        c,
        'SELECT * FROM hash_talk.content_usage_legacy FOR UPDATE;SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
        async () => {
          c.room.bytes = 0n;
          assert.deepEqual(await c.db.attachments.reserve(pair.sender, i), [
            { id: i.refs[0]!.id, received: [0], ready: false },
          ]);
        },
      );
      assert.deepEqual(await state(c), before);
    },
  );
  await t.test(
    'maximum file/thumbnail reserves only missing growth and preserves existing ready bytes',
    async () => {
      const i = input(pair, [ref(3_000_000)]);
      await c.db.attachments.reserve(pair.sender, i);
      await c.inspector.query(
        "UPDATE hash_talk.message_attachments SET status='ready',received=ARRAY(SELECT generate_series(0,11)) WHERE id=$1",
        [i.refs[0]!.id],
      );
      const before = await state(c);
      i.refs.push(ref(96_000));
      await c.db.attachments.reserve(pair.sender, i);
      const after = await state(c);
      assert.equal(after.bytes - before.bytes, 100096n);
      assert.equal(
        after.pending.reservedBytes - before.pending.reservedBytes,
        100096,
      );
      assert.deepEqual(
        after.rows.find((r) => r['id'] === i.refs[0]!.id),
        before.rows.find((r) => r['id'] === i.refs[0]!.id),
      );
      await assertStorageReconciled(c.inspector, [i.accountId, i.peer]);
    },
  );
  await t.test(
    'physical pressure refuses new growth before either reservation appears',
    async () => {
      const i = input(pair, [ref(), ref(64)]),
        before = await state(c);
      c.room.bytes = 0n;
      try {
        await assert.rejects(c.db.attachments.reserve(pair.sender, i), {
          status: 503,
        });
      } finally {
        c.room.bytes = full;
      }
      assert.deepEqual(await state(c), before);
    },
  );
  for (const owner of ['sender', 'recipient'] as const)
    await t.test(
      owner + ' quota refusal rolls back every attachment and pending promise',
      async () => {
        const fake = input(pair),
          i = input(pair, [ref(), ref(64)]);
        await c.inspector.query(
          "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES($1,$2,$3,$4,'{}',1,$5)",
          [
            fake.refs[0]!.id,
            fake.message,
            pair[owner].session.accountId,
            owner === 'sender' ? fake.peer : fake.accountId,
            vaultQuota,
          ],
        );
        const before = await state(c);
        try {
          await assert.rejects(c.db.attachments.reserve(pair.sender, i), {
            status: 413,
          });
          assert.deepEqual(await state(c), before);
        } finally {
          await c.inspector.query(
            'DELETE FROM hash_talk.message_attachments WHERE id=$1',
            [fake.refs[0]!.id],
          );
        }
      },
    );
  await t.test(
    'later divergent reservation, changed selection and foreign owner refuse without partial effects',
    async () => {
      const i = input(pair);
      await c.db.attachments.reserve(pair.sender, i);
      const before = await state(c),
        original = i.refs[0]!;
      for (const refs of [
        [ref(), { ...original, hash: 'c'.repeat(64) }],
        [ref()],
      ])
        await assert.rejects(
          c.db.attachments.reserve(pair.sender, { ...i, refs }),
          { status: 409 },
        );
      await assert.rejects(
        c.db.attachments.reserve(pair.recipient, { ...i, peer: i.accountId }),
        { status: 409 },
      );
      assert.deepEqual(await state(c), before);
    },
  );
  await t.test(
    'personal removal predating reservation preserves exact two-owner accounting',
    async () => {
      const i = input(pair);
      await c.inspector.query(
        "INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,'message',$2,repeat('a',64),'{}',0,512)",
        [i.peer, i.message],
      );
      await c.db.attachments.reserve(pair.sender, i);
      await assertStorageReconciled(c.inspector, [i.accountId, i.peer]);
    },
  );
  await t.test(
    'ready media admission is still atomic and accepted/deleting media cannot be reserved again',
    async () => {
      const i = input(pair),
        packet = {
          ...admissionPacket(pair),
          id: i.message,
          kind: 'attachment' as const,
          attachments: i.refs,
        };
      await c.db.attachments.reserve(pair.sender, i);
      const lease = await c.db.attachments.begin(pair.sender, i.refs[0]!.id, 0);
      assert.ok(lease.writer);
      await c.db.attachments.finish(pair.sender, {
        id: i.refs[0]!.id,
        writer: lease.writer,
        index: 0,
      });
      const finishing = await c.db.attachments.begin(
        pair.sender,
        i.refs[0]!.id,
        null,
      );
      assert.ok(finishing.writer);
      await c.db.attachments.finish(pair.sender, {
        id: i.refs[0]!.id,
        writer: finishing.writer,
        index: null,
      });
      await c.db.messages.admit(pair.sender, packet, 'a'.repeat(64));
      await assert.rejects(c.db.attachments.reserve(pair.sender, i), {
        status: 409,
      });
      const abandoned = input(pair);
      await c.db.attachments.reserve(pair.sender, abandoned);
      await c.db.attachments.cancel(pair.sender, abandoned.message);
      await assert.rejects(c.db.attachments.reserve(pair.sender, abandoned), {
        status: 409,
      });
    },
  );
}
async function waitForBothReservations(c: MessageReceiptFixture) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const blocked = await c.inspector.query<{ n: number }>(
      "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE application_name='hash-talk' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",
    );
    if (blocked.rows[0]!.n >= 2) return;
    await setTimeout(10);
  }
  assert.fail('Both reservations must reach the held pending bucket.');
}
async function concurrency(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
  independent: Pair,
) {
  await t.test(
    'a waiting pair leaves independent upload reservations free',
    async () => {
      await c.reader.query('BEGIN');
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [pair.sender.session.accountId],
      );
      const pid = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const waiting = c.db.attachments.reserve(pair.sender, input(pair));
      try {
        await waitForBlocked(c.inspector, pid);
        await c.db.attachments.reserve(independent.sender, input(independent));
      } finally {
        await c.reader.query('ROLLBACK');
        await waiting;
      }
    },
  );
  await t.test(
    'independent file/thumbnail pairs acquire overlapping pending buckets in one order',
    async () => {
      const a = input(pair, [ref(), ref(64)]),
        b = input(independent, [ref(), ref(64)]);
      a.refs[0]!.id =
        '10000000-0000-4000-8000-' + crypto.randomUUID().slice(-12);
      a.refs[1]!.id =
        '20000000-0000-4000-8000-' + crypto.randomUUID().slice(-12);
      b.refs[0]!.id =
        '20000000-0000-4000-8000-' + crypto.randomUUID().slice(-12);
      b.refs[1]!.id =
        '10000000-0000-4000-8000-' + crypto.randomUUID().slice(-12);
      await c.reader.query('BEGIN');
      await c.reader.query(
        "SELECT bucket FROM hash_talk.storage_reservation_usage WHERE source='message_attachments' AND bucket=16 FOR UPDATE",
      );
      const pid = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const first = c.db.attachments.reserve(pair.sender, a);
      let second: Promise<unknown> | undefined;
      try {
        await waitForBlocked(c.inspector, pid);
        second = c.db.attachments.reserve(independent.sender, b);
        await waitForBothReservations(c);
      } finally {
        await c.reader.query('ROLLBACK');
        await Promise.all([first, second]);
      }
      await assertStorageReconciled(c.inspector, [
        a.accountId,
        a.peer,
        b.accountId,
        b.peer,
      ]);
    },
  );
  await t.test(
    'queued reservation sees committed consent withdrawal before creating rows',
    async () => {
      const i = input(independent),
        before = await state(c);
      await c.reader.query('BEGIN');
      await c.reader.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))",
      );
      const pid = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const refused = assert.rejects(
        c.db.attachments.reserve(independent.sender, i),
        { status: 404 },
      );
      try {
        await waitForBlocked(c.inspector, pid);
        await c.reader.query(
          "UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          [i.accountId, i.peer],
        );
        await c.reader.query('COMMIT');
        await refused;
        assert.deepEqual(await state(c), before);
      } finally {
        await c.reader.query('ROLLBACK');
        await c.inspector.query(
          "UPDATE hash_talk.contact_relations SET state='approved' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          [i.accountId, i.peer],
        );
      }
    },
  );
  await t.test(
    'opposite senders and identical retries serialize without deadlock or duplicate promises',
    async () => {
      const i = input(pair);
      await Promise.all([
        c.db.attachments.reserve(pair.sender, i),
        c.db.attachments.reserve(pair.sender, i),
        c.db.attachments.reserve(
          pair.recipient,
          input({ sender: pair.recipient, recipient: pair.sender }),
        ),
      ]);
      await assertStorageReconciled(c.inspector, [i.accountId, i.peer]);
    },
  );
  await t.test(
    'queued reservation rechecks session revocation after its authority wait',
    async () => {
      await c.reader.query('BEGIN');
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [pair.sender.session.accountId],
      );
      const pid = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const pending = c.db.attachments.reserve(pair.sender, input(pair));
      const refused = assert.rejects(pending, { status: 401 });
      try {
        await waitForBlocked(c.inspector, pid);
        await c.reader.query(
          'DELETE FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2',
          [pair.sender.session.accountId, pair.sender.session.deviceId],
        );
        await c.reader.query('COMMIT');
        await refused;
      } finally {
        await c.reader.query('ROLLBACK');
      }
    },
  );
}
async function guards(t: TestContext, c: MessageReceiptFixture, pair: Pair) {
  const patches = [
    { name: 'descriptor', patch: { descriptor: {} } },
    {
      name: 'owner',
      patch: {
        sender: pair.recipient.session.accountId,
        recipient: pair.sender.session.accountId,
      },
    },
    { name: 'message', patch: { message_id: crypto.randomUUID() } },
    { name: 'charge', patch: { charge: 0 } },
    { name: 'bytes', patch: { bytes: 1 } },
    { name: 'ready status', patch: { status: 'ready' } },
    { name: 'received parts', patch: { received: [0] } },
    {
      name: 'writer',
      patch: { writer: crypto.randomUUID(), status: 'writing' },
    },
    { name: 'creation time', patch: { created_at: '2020-01-01T00:00:00Z' } },
  ];
  for (const item of patches)
    await t.test('BEFORE guard refuses altered ' + item.name, async () => {
      const i = input(pair),
        before = await state(c);
      await bound(c, i, async () => {
        await assert.rejects(insertPlanned(c, i.refs[0]!.id, item.patch), {
          code: 'PCA01',
        });
      });
      assert.deepEqual(await state(c), before);
    });
  await t.test(
    'other charged sources and binding substitution are rejected',
    async () => {
      await bound(c, input(pair), async () => {
        await assert.rejects(
          c.writer.query(
            'INSERT INTO hash_talk.daily_controls(account_id) VALUES($1)',
            [pair.sender.session.accountId],
          ),
          { code: 'PCA01' },
        );
      });
      const i = input(pair);
      await bound(c, i, async () => {
        await c.writer.query(
          "SELECT set_config('hash_talk.content_operation',$1,true)",
          [crypto.randomUUID()],
        );
        await assert.rejects(insertPlanned(c, i.refs[0]!.id), {
          code: 'PCA01',
        });
      });
    },
  );
  await t.test('exhausted credit refuses before insertion', async () => {
    const i = input(pair);
    await bound(
      c,
      i,
      async () => {
        await assert.rejects(insertPlanned(c, i.refs[0]!.id), {
          code: 'PCA01',
        });
      },
      { bytes: 1 },
    );
  });
  await t.test(
    'skipped effects fail completeness and savepoints restore effect markers',
    async () => {
      const i = input(pair, [ref(), ref(64)]),
        before = await state(c);
      await bound(c, i, async () => {
        await insertPlanned(c, i.refs[0]!.id);
        await c.writer.query('SAVEPOINT unfinished');
        await assert.rejects(complete(c), { code: 'PCA01' });
        await c.writer.query('ROLLBACK TO SAVEPOINT unfinished');
        await c.writer.query('SAVEPOINT last');
        await insertPlanned(c, i.refs[1]!.id);
        await complete(c);
        await c.writer.query('ROLLBACK TO SAVEPOINT last');
        await insertPlanned(c, i.refs[1]!.id);
        await complete(c);
      });
      assert.deepEqual(await state(c), before);
    },
  );
  await t.test(
    'missing global partition fails the final checkpoint',
    async () => {
      const i = input(pair);
      await bound(c, i, async () => {
        await insertPlanned(c, i.refs[0]!.id);
        await c.writer.query(
          "DELETE FROM hash_talk.content_usage_partitions WHERE id=current_setting('hash_talk.content_partition')::bigint",
        );
        await assert.rejects(complete(c), { code: 'PCA01' });
      });
    },
  );
  await t.test(
    'ordinary application role can prepare, insert and verify the complete plan',
    async () => {
      const role =
          'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', ''),
        i = input(pair);
      await c.inspector.query(
        `CREATE ROLE "${role}" NOLOGIN;GRANT USAGE ON SCHEMA hash_talk TO "${role}";GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`,
      );
      try {
        await bound(
          c,
          i,
          async () => {
            await insertPlanned(c, i.refs[0]!.id);
            await complete(c);
          },
          { role },
        );
      } finally {
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function finalization(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'post-COMMIT finalization failure keeps credit and fails health without losing the reservation',
    async () => {
      const i = input(pair);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_refuse_attachment_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic finish refusal';END;$$;
      CREATE TRIGGER synthetic_refuse_attachment_finish BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_refuse_attachment_finish()`);
      try {
        await c.db.attachments.reserve(pair.sender, i);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT 1 FROM hash_talk.content_allocations WHERE scope='attachment-reserve'",
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await c.inspector.query(
              'SELECT 1 FROM hash_talk.message_attachments WHERE id=$1',
              [i.refs[0]!.id],
            )
          ).rowCount,
          1,
        );
        assert.equal(await c.db.healthy(), false);
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_refuse_attachment_finish ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_refuse_attachment_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
    },
  );
}
await test('private upload reservation uses a complete scoped physical envelope', async (t) => {
  const c = await messageReceiptFixture(t),
    first = await messagePair(c),
    second = await messagePair(c);
  await runtime(t, c, first);
  await guards(t, c, second);
  await concurrency(t, c, first, second);
  await finalization(t, c, second);
  await assertStorageReconciled(c.inspector, [
    first.sender.session.accountId,
    first.recipient.session.accountId,
    second.sender.session.accountId,
    second.recipient.session.accountId,
  ]);
  const sources = (
    await c.inspector.query<{
      name: string;
    }>(`SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure`)
  ).rows;
  const actual = await globalSourceSnapshot(c.inspector, sources);
  assert.equal(
    await globalBytes(c.inspector),
    actual.reduce((total, row) => total + BigInt(row.bytes), 0n),
  );
  await expectNoAllocations(c.inspector);
});
