import { waitForBlocked } from './contact-concurrency-fixture.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { randomBytes } from 'node:crypto';
import { Database } from '../../src/server/database/index.ts';
import { recordMessageChanges } from '../../src/server/database/message-changes.ts';
import type { BackupTarget } from '../../src/shared/backups/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import {
  proof,
  snapshots,
  seedRemovalBatch,
  accept,
  target,
} from '../fixtures/message-removal-database.ts';
import {
  social,
  vault,
  selection,
} from '../fixtures/personal-cleanup-database.ts';
import {
  allocationWriter,
  expectNoAllocations,
} from '../fixtures/content-allocation-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
const hash = 'a'.repeat(64);
async function heldLedger(
  c: MessageReceiptFixture,
  work: () => Promise<unknown>,
) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    await work();
  } finally {
    c.room.bytes = 1_000_000_000_000n;
    await c.writer.query('ROLLBACK');
  }
}
async function bind(
  c: MessageReceiptFixture,
  input: { pair: Pair; items: BackupTarget[]; bytes?: number },
  client = c.writer,
) {
  const actor = input.pair.sender,
    p = proof(actor, input.items),
    serialized = JSON.stringify(p);
  await client.query(
    "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
  );
  await client.query(
    'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[actor.session.accountId, input.pair.recipient.session.accountId]],
  );
  const plan = (
    await client.query<{ bytes: string; operation: string }>(
      'SELECT bytes::text,operation::text FROM hash_talk.prepare_personal_cleanup($1,$2::jsonb,$3::jsonb,$4,$5::uuid[])',
      [
        actor.session.accountId,
        JSON.stringify(input.items),
        serialized,
        Buffer.byteLength(serialized),
        [actor.session.accountId, input.pair.recipient.session.accountId],
      ],
    )
  ).rows[0]!;
  const grant = await c.allocator.reserve(
    client,
    input.bytes ?? Number(plan.bytes),
    'personal-clean',
  );
  await client.query(
    "SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)",
    [grant.transactionId, actor.session.accountId, plan.operation],
  );
  return { grant, bytes: Number(plan.bytes), p };
}
async function runtimeCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'actual three-kind cleanup bypasses the legacy ledger at zero growth room while its numeric predecessor times out',
    async () => {
      const s = await selection(c, pair),
        p = proof(pair.sender, s.items);
      await heldLedger(c, async () => {
        const predecessor = new Database(c.url, 1_000_000_000_000);
        try {
          await assert.rejects(predecessor.backups.clean(pair.sender, p), {
            code: '55P03',
          });
        } finally {
          await predecessor.close();
        }
        c.room.bytes = 0n;
        const cleaned = await c.db.backups.clean(pair.sender, p);
        assert.equal(cleaned.items.length, 3);
      });
      await expectNoAllocations(c.inspector);
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ]);
    },
  );
  await t.test(
    'vault-only and social-only cleanup also adopt maintenance without new payload promises; unchanged retries borrow no coordinator',
    async () => {
      const block = await vault(c, pair.sender),
        dm = await social(c, pair);
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.sender, proof(pair.sender, [block]));
        await c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [{ kind: dm.kind, id: dm.id, hash }]),
        );
      });
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
        await c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [block, { kind: dm.kind, id: dm.id, hash }]),
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
        await c.writer.query('ROLLBACK');
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function guarded(
  c: MessageReceiptFixture,
  pair: Pair,
  work: (input: {
    client: pg.Client;
    s: Awaited<ReturnType<typeof selection>>;
  }) => Promise<void>,
  bytes?: number,
) {
  const s = await selection(c, pair),
    before = await snapshots(c);
  await c.writer.query('BEGIN');
  const { grant } = await bind(c, {
    pair,
    items: s.items,
    ...(bytes === undefined ? {} : { bytes }),
  });
  try {
    await work({ client: c.writer, s });
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
  for (const mutation of [
    'charge=charge+1',
    "state='discarding',sequence=NULL",
    "commit='{}'::jsonb",
    "hash=repeat('b',64)",
  ])
    await t.test(`vault cleanup refuses unsupported ${mutation}`, async () => {
      await guarded(c, pair, async ({ client, s }) => {
        await assert.rejects(
          client.query(
            `UPDATE hash_talk.vault_operations SET ${mutation} WHERE account_id=$1 AND id=$2`,
            [pair.sender.session.accountId, s.block.id],
          ),
          { code: 'PCA01' },
        );
      });
    });
  for (const mutation of [
    "body=jsonb_set(body,'{content,ciphertext}','\"changed\"')",
    'charge=charge+1',
    'sender=recipient,recipient=sender',
    'body=NULL,personal_collected=true,charge=512',
  ])
    await t.test(`social cleanup refuses unsupported ${mutation}`, async () => {
      await guarded(c, pair, async ({ client, s }) => {
        await assert.rejects(
          client.query(
            `UPDATE hash_talk.social_messages SET ${mutation} WHERE id=$1`,
            [s.dm.id],
          ),
          { code: 'PCA01' },
        );
      });
    });
  await t.test(
    'ready/writing media transitions and file charge release cannot hide in personal cleanup',
    async () => {
      for (const mutation of [
        "status='deleting'",
        'charge=charge-128',
        'bytes=bytes-1',
      ])
        await guarded(c, pair, async ({ client, s }) => {
          await assert.rejects(
            client.query(
              `UPDATE hash_talk.social_media SET ${mutation} WHERE id=$1`,
              [s.dm.media],
            ),
            { code: 'PCA01' },
          );
        });
    },
  );
  await t.test(
    'wrong-owner receipts, fabricated delivery and changed operation/profile bindings are refused',
    async () => {
      for (const effect of [
        'receipt',
        'delivery',
        'operation',
        'profile',
        'kind',
      ])
        await guarded(c, pair, async ({ client, s }) => {
          if (effect === 'receipt')
            await assert.rejects(
              client.query(
                'DELETE FROM hash_talk.social_receipts WHERE message_id=$1 AND profile_id=$2',
                [s.dm.id, s.dm.recipient],
              ),
              { code: 'PCA01' },
            );
          else if (effect === 'delivery')
            await assert.rejects(
              client.query(
                'UPDATE hash_talk.social_receipts SET received=false WHERE message_id=$1',
                [s.dm.id],
              ),
              { code: 'PCA01' },
            );
          else {
            await client.query('SELECT set_config($1,$2,true)', [
              effect === 'profile'
                ? 'hash_talk.content_personal_profile'
                : effect === 'kind'
                  ? 'hash_talk.content_removal_kind'
                  : 'hash_talk.content_operation',
              effect === 'kind' ? 'delete' : crypto.randomUUID(),
            ]);
            await assert.rejects(
              client.query(
                'UPDATE hash_talk.vault_operations SET charge=charge-128 WHERE account_id=$1 AND id=$2',
                [pair.sender.session.accountId, s.block.id],
              ),
              { code: 'PCA01' },
            );
          }
        });
    },
  );
  await t.test(
    'missing all effects and an undersized envelope fail without source changes',
    async () => {
      await guarded(c, pair, async ({ client }) => {
        await assert.rejects(
          client.query('SELECT hash_talk.assert_personal_cleanup_complete()'),
          { code: 'PCA01' },
        );
      });
      await guarded(
        c,
        pair,
        async ({ client, s }) => {
          await assert.rejects(
            client.query(
              'UPDATE hash_talk.vault_operations SET charge=charge-128 WHERE account_id=$1 AND id=$2',
              [pair.sender.session.accountId, s.block.id],
            ),
            { code: 'PCA01' },
          );
        },
        1,
      );
    },
  );
  await t.test(
    'savepoint rollback restores plan writes and consumed credit before a valid repeated effect',
    async () => {
      await guarded(c, pair, async ({ client, s }) => {
        const sql =
            'UPDATE hash_talk.vault_operations SET charge=charge-128 WHERE account_id=$1 AND id=$2',
          parameters = [pair.sender.session.accountId, s.block.id];
        await client.query('SAVEPOINT before_effect');
        await client.query(sql, parameters);
        await client.query('ROLLBACK TO SAVEPOINT before_effect');
        await client.query(sql, parameters);
        await assert.rejects(
          client.query('SELECT hash_talk.assert_personal_cleanup_complete()'),
          { code: 'PCA01' },
        );
      });
    },
  );
}
async function collectionGuard(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'social collection requires both current receipts before the ciphertext collection transition',
    async () => {
      const s = await selection(c, pair);
      await c.db.backups.clean(
        pair.recipient,
        proof(pair.recipient, [{ kind: s.dm.kind, id: s.dm.id, hash }]),
      );
      const before = await snapshots(c);
      await c.writer.query('BEGIN');
      const { grant } = await bind(c, { pair, items: s.items });
      try {
        await c.writer.query(
          'UPDATE hash_talk.social_messages SET sender_charge=0 WHERE id=$1',
          [s.dm.id],
        );
        await assert.rejects(
          c.writer.query(
            'UPDATE hash_talk.social_messages SET body=NULL,personal_collected=true,charge=512 WHERE id=$1',
            [s.dm.id],
          ),
          { code: 'PCA01' },
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function omittedEffects(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  for (const source of ['personal_removals', 'social_media', 'social_receipts'])
    await t.test(
      `omitted ${source} effects refuse COMMIT and roll back the whole three-kind cleanup`,
      async () => {
        const s = await selection(c, pair),
          before = await snapshots(c);
        await c.inspector.query(
          `CREATE FUNCTION hash_talk.synthetic_skip_personal() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END;$$;CREATE TRIGGER zz_synthetic_skip_personal BEFORE ${source === 'personal_removals' ? 'INSERT' : source === 'social_receipts' ? 'DELETE' : 'UPDATE'} ON hash_talk.${source} FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_skip_personal()`,
        );
        try {
          await assert.rejects(
            c.db.backups.clean(pair.sender, proof(pair.sender, s.items)),
            { status: 503 },
          );
        } finally {
          await c.inspector.query(
            `DROP TRIGGER zz_synthetic_skip_personal ON hash_talk.${source};DROP FUNCTION hash_talk.synthetic_skip_personal()`,
          );
        }
        assert.deepEqual(await snapshots(c), before);
      },
    );
}
async function commitVault(
  c: MessageReceiptFixture,
  input: { pair: Pair; client: pg.Client; priorOid: string | undefined },
) {
  const block = await vault(c, input.pair.sender),
    { client } = input;
  await client.query('BEGIN');
  const { grant, p } = await bind(
    c,
    { pair: input.pair, items: [block] },
    client,
  );
  try {
    const oid = (
      await client.query<{ oid: string }>(
        "SELECT 'pg_temp.hash_talk_personal_plan'::regclass::oid::text AS oid",
      )
    ).rows[0]!.oid;
    if (input.priorOid) assert.equal(oid, input.priorOid);
    await client.query(
      'UPDATE hash_talk.vault_operations SET charge=charge-128 WHERE account_id=$1 AND id=$2',
      [input.pair.sender.session.accountId, block.id],
    );
    await client.query(
      "INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,'vault',$2,$3,$4::jsonb,128,$5)",
      [
        input.pair.sender.session.accountId,
        block.id,
        hash,
        JSON.stringify(p),
        128 + Buffer.byteLength(JSON.stringify(p)) + 512,
      ],
    );
    await recordMessageChanges(
      client,
      [input.pair.sender.session.accountId],
      null,
    );
    await client.query('SELECT hash_talk.assert_personal_cleanup_complete()');
    await client.query('COMMIT');
    assert.equal(
      (await client.query('SELECT * FROM pg_temp.hash_talk_personal_plan'))
        .rowCount,
      0,
    );
    assert.equal(
      (await client.query('SELECT * FROM pg_temp.hash_talk_removal_plan'))
        .rowCount,
      0,
    );
    return oid;
  } finally {
    await client.query('ROLLBACK');
    await c.allocator.finish(grant);
  }
}
async function ordinaryCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'ordinary app permissions reuse and truncate both metadata relations after exact vault-only commits',
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
          oid = await commitVault(c, { pair, client, priorOid: oid });
      } finally {
        await client.end();
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function maximumCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'an eight-item mixed selection with private related history and social historical devices fits one SQL credit without ciphertext plans',
    async () => {
      const seeded = await seedRemovalBatch(c, {
          pair,
          roots: 6,
          actions: 64,
          devices: 32,
          peerDevices: 32,
        }),
        dm = await social(c, pair, randomBytes(2_000_000).toString('base64')),
        block = await vault(c, pair.sender);
      await c.inspector.query(
        'INSERT INTO hash_talk.social_receipts(message_id,profile_id,device_id,received) SELECT $1,owner,gen_random_uuid(),true FROM unnest($2::uuid[]) owner,generate_series(1,31)',
        [dm.id, [dm.sender, dm.recipient]],
      );
      const items = [
        ...seeded.items,
        { kind: dm.kind, id: dm.id, hash },
        block,
      ];
      await c.writer.query('BEGIN');
      const { grant, bytes } = await bind(c, { pair, items });
      try {
        assert.ok(bytes < 64 * 1024 * 1024);
        assert.equal(
          (
            await c.writer.query<{ body: boolean }>(
              "SELECT bool_or(before_state ? 'body' OR after_state ? 'body') AS body FROM pg_temp.hash_talk_personal_plan",
            )
          ).rows[0]!.body,
          false,
        );
        t.diagnostic(
          `Mixed eight-item first-removal envelope: ${bytes} bytes.`,
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      });
      const otherBlock = await vault(c, pair.recipient),
        otherItems = [
          ...seeded.items,
          { kind: dm.kind, id: dm.id, hash },
          otherBlock,
        ];
      await c.writer.query('BEGIN');
      const collection = await bind(c, {
        pair: { sender: pair.recipient, recipient: pair.sender },
        items: otherItems,
      });
      try {
        assert.ok(collection.bytes < 64 * 1024 * 1024);
        t.diagnostic(
          `Mixed eight-item collection envelope: ${collection.bytes} bytes.`,
        );
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(collection.grant);
      }
      await heldLedger(c, async () => {
        c.room.bytes = 0n;
        await c.db.backups.clean(
          pair.recipient,
          proof(pair.recipient, otherItems),
        );
      });
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT body IS NULL AS collected,charge FROM hash_talk.social_messages WHERE id=$1',
            [dm.id],
          )
        ).rows,
        [{ collected: true, charge: 512 }],
      );
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ]);
    },
  );
}
async function resourceCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'oversized media metadata is refused before bulk temporary-plan copying or a grant',
    async () => {
      const dm = await social(c, pair);
      await c.inspector.query(
        `INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,status,bytes,sender_charge,recipient_charge,charge)
      SELECT gen_random_uuid(),$1,$2,$3,'{}','photo','accepted',128,640,640,640 FROM generate_series(1,8192)`,
        [dm.id, dm.sender, dm.recipient],
      );
      const before = await snapshots(c);
      await assert.rejects(
        c.db.backups.clean(
          pair.sender,
          proof(pair.sender, [{ kind: dm.kind, id: dm.id, hash }]),
        ),
        { status: 503 },
      );
      assert.deepEqual(await snapshots(c), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'collection preserves ready and writing promises and only marks accepted media deleting without releasing file bytes',
    async () => {
      const dm = await social(c, pair),
        ready = crypto.randomUUID(),
        writing = crypto.randomUUID(),
        writer = crypto.randomUUID();
      await c.inspector.query(
        `INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,status,writer,bytes,sender_charge,recipient_charge,charge)
      VALUES($1,$3,$4,$5,'{}','photo','ready',NULL,128,640,640,640),($2,$3,$4,$5,'{}','photo','writing',$6,128,640,640,640)`,
        [ready, writing, dm.id, dm.sender, dm.recipient, writer],
      );
      const items = [{ kind: dm.kind, id: dm.id, hash }];
      await c.db.backups.clean(pair.sender, proof(pair.sender, items));
      await c.db.backups.clean(pair.recipient, proof(pair.recipient, items));
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,writer,bytes,charge FROM hash_talk.social_media WHERE id=$1',
            [ready],
          )
        ).rows,
        [{ status: 'ready', writer: null, bytes: 128, charge: 640 }],
      );
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,writer,bytes,charge FROM hash_talk.social_media WHERE id=$1',
            [writing],
          )
        ).rows,
        [{ status: 'writing', writer, bytes: 128, charge: 640 }],
      );
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
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
    'a maximum maintenance grant does not spend physical room twice or prevent an independent real growth admission',
    async () => {
      const other = await messagePair(c),
        block = await vault(c, pair.sender);
      await c.writer.query('BEGIN');
      const { grant } = await bind(c, {
        pair,
        items: [block],
        bytes: 64 * 1024 * 1024,
      });
      try {
        await c.inspector.query('BEGIN');
        await c.inspector.query('SELECT pg_current_xact_id()');
        const policy = new VolumeContentCapacity({
            read: () => Promise.resolve(c.room.bytes),
          }),
          available = await policy.allocationHeadroom(c.inspector);
        await c.inspector.query('ROLLBACK');
        c.room.bytes = 1_000_000_000_000n - available + 4_000_000n;
        await accept(c, other);
      } finally {
        await c.inspector.query('ROLLBACK');
        await c.writer.query('ROLLBACK');
        c.room.bytes = 1_000_000_000_000n;
        await c.allocator.finish(grant);
      }
      c.room.bytes = 0n;
      await c.writer.query('BEGIN');
      try {
        await assert.rejects(
          c.allocator.reserve(c.writer, 64 * 1024 * 1024 + 1, 'personal-clean'),
          { status: 503 },
        );
      } finally {
        await c.writer.query('ROLLBACK');
        c.room.bytes = 1_000_000_000_000n;
      }
    },
  );
}
async function overlappingCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  for (const rootFirst of [true, false])
    await t.test(
      `mixed original/action selections preserve serial effects and roll back earlier social changes when required (original first: ${rootFirst})`,
      async () => {
        const root = admissionPacket(pair),
          action = {
            ...admissionPacket(pair),
            relation: {
              type: 'edit' as const,
              id: root.id,
              hash,
              author: root.sender,
            },
          },
          ids = [root.id, action.id].sort();
        root.id = ids[rootFirst ? 0 : 1]!;
        action.id = ids[rootFirst ? 1 : 0]!;
        action.relation.id = root.id;
        await c.db.messages.admit(pair.sender, root, hash);
        await c.db.messages.admit(pair.sender, action, hash);
        await c.db.backups.clean(
          pair.recipient,
          proof(pair.recipient, [target(root.id)]),
        );
        const dm = await social(c, pair),
          items = [
            { kind: dm.kind, id: dm.id, hash },
            target(root.id),
            target(action.id),
          ],
          before = await snapshots(c);
        if (rootFirst) {
          await assert.rejects(
            c.db.backups.clean(pair.sender, proof(pair.sender, items)),
            { status: 409 },
          );
          assert.deepEqual(await snapshots(c), before);
        } else
          await heldLedger(c, () =>
            c.db.backups.clean(pair.sender, proof(pair.sender, items)),
          );
        await assertStorageReconciled(c.inspector, [
          pair.sender.session.accountId,
          pair.recipient.session.accountId,
        ]);
      },
    );
}
async function writingMedia(c: MessageReceiptFixture, pair: Pair) {
  const dm = await social(c, pair),
    id = crypto.randomUUID(),
    writer = crypto.randomUUID();
  await c.inspector.query(
    `INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,status,writer,bytes,sender_charge,recipient_charge,charge)
    VALUES($1,$2,$3,$4,'{}','photo','writing',$5,128,640,640,640)`,
    [id, dm.id, dm.sender, dm.recipient, writer],
  );
  return { dm, id, writer, items: [{ kind: dm.kind, id: dm.id, hash }] };
}
async function workerCases(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'an out-of-band media release waits for the cleanup plan without changing its frozen writer state',
    async () => {
      const media = await writingMedia(c, pair);
      await c.writer.query('BEGIN');
      const { grant } = await bind(c, { pair, items: media.items });
      const holder = (
        await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const pending = c.db.socialMedia.release(media.id, media.writer);
      void pending.catch(() => undefined);
      try {
        await waitForBlocked(c.inspector, holder);
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
        await pending;
      }
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,writer,charge FROM hash_talk.social_media WHERE id=$1',
            [media.id],
          )
        ).rows,
        [{ status: 'reserved', writer: null, charge: 640 }],
      );
    },
  );
  await t.test(
    'cleanup waiting behind a media release snapshots the newly committed state and preserves its promise',
    async () => {
      const media = await writingMedia(c, pair);
      await c.writer.query('BEGIN');
      await c.writer.query(
        "UPDATE hash_talk.social_media SET status='reserved',writer=NULL,lease_at=NULL WHERE id=$1",
        [media.id],
      );
      const holder = (
        await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const pending = c.db.backups.clean(
        pair.sender,
        proof(pair.sender, media.items),
      );
      void pending.catch(() => undefined);
      try {
        await waitForBlocked(c.inspector, holder);
        await c.writer.query('COMMIT');
        assert.equal((await pending).items.length, 1);
      } finally {
        await c.writer.query('ROLLBACK');
        await pending.catch(() => undefined);
      }
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT status,writer,charge,sender_charge FROM hash_talk.social_media WHERE id=$1',
            [media.id],
          )
        ).rows,
        [{ status: 'reserved', writer: null, charge: 640, sender_charge: 0 }],
      );
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
      ]);
    },
  );
}
async function finalizationCase(
  t: TestContext,
  c: MessageReceiptFixture,
  pair: Pair,
) {
  await t.test(
    'an acknowledged mixed cleanup retains its durable credit on finalization failure until bounded recovery',
    async () => {
      const s = await selection(c, pair);
      await c.inspector.query(
        `CREATE FUNCTION hash_talk.synthetic_personal_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic finalization failure';END;$$;CREATE TRIGGER synthetic_personal_finish BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_personal_finish()`,
      );
      try {
        const result = await c.db.backups.clean(
          pair.sender,
          proof(pair.sender, s.items),
        );
        assert.equal(result.items.length, 3);
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT * FROM hash_talk.content_allocations WHERE scope='personal-clean'",
            )
          ).rowCount,
          1,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_personal_finish ON hash_talk.content_allocations;DROP FUNCTION hash_talk.synthetic_personal_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('personal cleanup allocations preserve complete mixed effects on the existing SQL reserve', async (t) => {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  await runtimeCases(t, c, pair);
  await guardCases(t, c, pair);
  await collectionGuard(t, c, pair);
  await omittedEffects(t, c, pair);
  await ordinaryCase(t, c, pair);
  await maximumCase(t, c, pair);
  await resourceCases(t, c, pair);
  await coexistenceCases(t, c, pair);
  await overlappingCases(t, c, pair);
  await workerCases(t, c, pair);
  await finalizationCase(t, c, pair);
});
