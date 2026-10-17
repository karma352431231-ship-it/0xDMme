import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { messagePair } from '../fixtures/message-allocation-database.ts';
import {
  proof,
  seedRemovalBatch,
  snapshots,
} from '../fixtures/message-removal-database.ts';
import { social, vault } from '../fixtures/personal-cleanup-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { expectNoAllocations } from '../fixtures/content-allocation-database.ts';

type Pair = Awaited<ReturnType<typeof messagePair>>;
async function history(c: MessageReceiptFixture, mixed: boolean) {
  const pair = await messagePair(c),
    seeded = await seedRemovalBatch(c, {
      pair,
      roots: mixed ? 6 : 8,
      actions: 64,
      devices: mixed ? 128 : 64,
      peerDevices: mixed ? 128 : 64,
    }),
    dm = mixed ? await social(c, pair) : undefined;
  const itemsFor = async (actor: Pair['sender']) => [
    ...seeded.items,
    ...(dm
      ? [{ kind: dm.kind, id: dm.id, hash: dm.hash }, await vault(c, actor)]
      : []),
  ];
  return { pair, seeded, dm, itemsFor };
}
async function reconciled(c: MessageReceiptFixture, pair: Pair) {
  await assertStorageReconciled(c.inspector, [
    pair.sender.session.accountId,
    pair.recipient.session.accountId,
  ]);
  const state = await snapshots(c);
  assert.equal(
    state.bytes,
    state.sources.reduce((sum, row) => sum + BigInt(row.bytes), 0n),
  );
  await expectNoAllocations(c.inspector);
}
async function collection(t: TestContext, mixed: boolean) {
  const c = await messageReceiptFixture(t),
    h = await history(c, mixed);
  for (const actor of [h.pair.sender, h.pair.recipient]) {
    const items = await h.itemsFor(actor);
    const result = await c.db.backups.clean(actor, proof(actor, items));
    assert.equal(result.items.length, 8);
    await reconciled(c, h.pair);
  }
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (body IS NOT NULL OR NOT personal_collected OR charge<>4096 OR sender_charge<>0 OR recipient_charge<>0)',
        [h.seeded.ids],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.message_references WHERE message_id=ANY($1::uuid[])',
        [h.seeded.ids],
      )
    ).rowCount,
    0,
  );
  if (h.dm) {
    const media = await c.inspector.query(
      'SELECT status,bytes,charge FROM hash_talk.social_media WHERE id=$1',
      [h.dm.media],
    );
    assert.deepEqual(media.rows, [
      { status: 'deleting', bytes: 128, charge: 640 },
    ]);
  }
}
for (const mixed of [false, true])
  await test(`valid ${mixed ? 'mixed' : 'private'} eight-item cleanup collects growing historical device references atomically`, async (t) =>
    collection(t, mixed));

await test('large cleanup refuses real pressure without effects, then succeeds and retries unchanged without room or coordinator', async (t) => {
  const c = await messageReceiptFixture(t),
    h = await history(c, false),
    first = await h.itemsFor(h.pair.sender),
    second = await h.itemsFor(h.pair.recipient);
  await c.db.backups.clean(h.pair.sender, proof(h.pair.sender, first));
  const before = await snapshots(c);
  c.room.bytes = 0n;
  await assert.rejects(
    c.db.backups.clean(h.pair.recipient, proof(h.pair.recipient, second)),
    { status: 503 },
  );
  assert.deepEqual(await snapshots(c), before);
  await expectNoAllocations(c.inspector);
  c.room.bytes = 1_000_000_000_000n;
  await c.db.backups.clean(h.pair.recipient, proof(h.pair.recipient, second));
  await c.writer.query('BEGIN');
  try {
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    await c.writer.query(
      'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
    );
    c.room.bytes = 0n;
    const result = await c.db.backups.clean(
      h.pair.recipient,
      proof(h.pair.recipient, second),
    );
    assert.equal(result.items.length, 8);
  } finally {
    await c.writer.query('ROLLBACK');
    c.room.bytes = 1_000_000_000_000n;
  }
  await reconciled(c, h.pair);
});

await test('a skipped late receipt rolls back a large mixed cleanup and all physical credits', async (t) => {
  const c = await messageReceiptFixture(t),
    h = await history(c, true),
    first = await h.itemsFor(h.pair.sender),
    second = await h.itemsFor(h.pair.recipient);
  await c.db.backups.clean(h.pair.sender, proof(h.pair.sender, first));
  const before = await snapshots(c);
  await c.inspector
    .query(`CREATE FUNCTION hash_talk.synthetic_large_cleanup_skip() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.kind='vault' THEN RETURN NULL; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER synthetic_large_cleanup_skip BEFORE INSERT ON hash_talk.personal_removals
    FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_large_cleanup_skip()`);
  try {
    await assert.rejects(
      c.db.backups.clean(h.pair.recipient, proof(h.pair.recipient, second)),
      { status: 503 },
    );
    assert.deepEqual(await snapshots(c), before);
    await reconciled(c, h.pair);
  } finally {
    await c.inspector.query(
      'DROP TRIGGER synthetic_large_cleanup_skip ON hash_talk.personal_removals; DROP FUNCTION hash_talk.synthetic_large_cleanup_skip()',
    );
  }
  await c.db.backups.clean(h.pair.recipient, proof(h.pair.recipient, second));
  await reconciled(c, h.pair);
});
