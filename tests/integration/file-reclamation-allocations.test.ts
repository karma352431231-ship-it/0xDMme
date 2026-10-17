import { waitForBlocked } from './contact-concurrency-fixture.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAllocator } from '../../src/server/database/content-allocations.ts';
import {
  allocationWriter,
  allocationPool,
} from '../fixtures/content-allocation-database.ts';
import { Database } from '../../src/server/database/index.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { AttachmentService } from '../../src/server/attachments/index.ts';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { messagePair } from '../fixtures/message-allocation-database.ts';
import { proof, snapshots } from '../fixtures/message-removal-database.ts';
import { selection, vault } from '../fixtures/personal-cleanup-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { expectNoAllocations } from '../fixtures/content-allocation-database.ts';

async function ready(c: MessageReceiptFixture) {
  const pair = await messagePair(c),
    s = await selection(c, pair);
  await c.db.backups.clean(pair.sender, proof(pair.sender, s.items));
  await c.db.backups.clean(
    pair.recipient,
    proof(
      pair.recipient,
      s.items.filter((i) => i.kind !== 'vault'),
    ),
  );
  return { ...s, pair };
}
type Ready = Awaited<ReturnType<typeof ready>>;
function targets(db: Database, s: Ready) {
  return [
    {
      source: 'personal_removals',
      id: s.block.id,
      account: s.pair.sender.session.accountId,
      collect: () =>
        db.backups.collected(s.pair.sender.session.accountId, s.block.id),
      sql: "UPDATE hash_talk.personal_removals SET charge=charge-retained_bytes,retained_bytes=0 WHERE kind='vault' AND id=$1",
    },
    {
      source: 'message_attachments',
      id: s.attachment,
      account: null,
      collect: () => db.attachments.collected(s.attachment),
      sql: 'DELETE FROM hash_talk.message_attachments WHERE id=$1',
    },
    {
      source: 'social_media',
      id: s.dm.media,
      account: null,
      collect: () => db.socialMedia.collected(s.dm.media),
      sql: 'DELETE FROM hash_talk.social_media WHERE id=$1',
    },
  ];
}
async function reconciled(c: MessageReceiptFixture, s: Ready) {
  await assertStorageReconciled(c.inspector, [
    s.pair.sender.session.accountId,
    s.pair.recipient.session.accountId,
  ]);
  const state = await snapshots(c);
  assert.equal(
    state.bytes,
    state.sources.reduce((n, r) => n + BigInt(r.bytes), 0n),
  );
  await expectNoAllocations(c.inspector);
}
async function bound(
  c: MessageReceiptFixture,
  target: ReturnType<typeof targets>[number],
  bytes?: number,
) {
  const plan = (
    await c.writer.query<{ bytes: string; actor: string }>(
      'SELECT bytes::text,actor::text FROM hash_talk.prepare_file_reclamation($1,$2,$3)',
      [target.source, target.id, target.account],
    )
  ).rows[0]!;
  const grant = await c.allocator.reserve(
    c.writer,
    bytes ?? Number(plan.bytes),
    'file-reclaim',
  );
  await c.writer.query(
    "SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)",
    [grant.transactionId, plan.actor, target.id],
  );
  return grant;
}
async function heldLedger(
  c: MessageReceiptFixture,
  work: () => Promise<unknown>,
) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    c.room.bytes = 0n;
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
    c.room.bytes = 1_000_000_000_000n;
  }
}
async function runtime(t: TestContext, c: MessageReceiptFixture) {
  await t.test(
    'web and worker release exact retained bytes under legacy contention and zero room; legacy predecessor waits',
    async () => {
      const s = await ready(c),
        worker = new Database(
          c.url,
          new VolumeContentCapacity({
            read: () => Promise.resolve(c.room.bytes),
          }),
          [],
          'worker',
        ),
        legacy = new Database(c.url, 1_000_000_000_000, [], 'worker');
      try {
        for (const [index, target] of targets(worker, s).entries()) {
          const before = await snapshots(c);
          await heldLedger(c, async () => {
            await assert.rejects(targets(legacy, s)[index]!.collect(), {
              code: '55P03',
            });
            await target.collect();
          });
          assert.ok((await snapshots(c)).bytes < before.bytes);
          await reconciled(c, s);
        }
        assert.ok((await worker.maintenanceSnapshot()).poolConnections <= 4);
        const before = await snapshots(c);
        await heldLedger(c, async () => {
          await c.writer.query(
            'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
          );
          await Promise.all(targets(c.db, s).map((target) => target.collect()));
        });
        assert.deepEqual(await snapshots(c), before);
      } finally {
        await Promise.all([worker.close(), legacy.close()]);
      }
    },
  );
  await t.test(
    'competing collectors release each source once and preserve the personal receipt proof',
    async () => {
      const s = await ready(c),
        before = await snapshots(c);
      await Promise.all(
        targets(c.db, s).flatMap((target) => [
          target.collect(),
          target.collect(),
        ]),
      );
      assert.equal(
        before.bytes - (await snapshots(c)).bytes,
        128n + 640n + 640n,
      );
      const receipt = (
        await c.inspector.query<{ retained_bytes: number; proof: unknown }>(
          "SELECT retained_bytes,proof FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='vault' AND id=$2",
          [s.pair.sender.session.accountId, s.block.id],
        )
      ).rows[0]!;
      assert.equal(receipt.retained_bytes, 0);
      assert.deepEqual(receipt.proof, proof(s.pair.sender, s.items));
      await reconciled(c, s);
    },
  );
  await t.test(
    'active accepted files and an unremoved vault version remain untouched without borrowing credits',
    async () => {
      const pair = await messagePair(c),
        s = { ...(await selection(c, pair)), pair },
        before = await snapshots(c);
      await heldLedger(c, async () => {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_allocation_guard FOR UPDATE',
        );
        await Promise.all(targets(c.db, s).map((target) => target.collect()));
      });
      assert.deepEqual(await snapshots(c), before);
    },
  );
}
async function guards(t: TestContext, c: MessageReceiptFixture) {
  for (const source of [
    'personal_removals',
    'message_attachments',
    'social_media',
  ])
    await t.test(
      `reclamation rejects altered fields or unrelated effects for ${source}`,
      async () => {
        const s = await ready(c),
          target = targets(c.db, s).find((target) => target.source === source)!,
          before = await snapshots(c);
        await c.writer.query('BEGIN');
        const grant = await bound(c, target);
        try {
          await assert.rejects(
            c.writer.query(
              `UPDATE hash_talk.${source} SET charge=charge-1 WHERE id=$1`,
              [target.id],
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
  await t.test(
    'missing effects, changed operation binding and exhausted credits fail closed',
    async () => {
      for (const fault of ['missing', 'binding', 'credit']) {
        const s = await ready(c),
          target = targets(c.db, s)[1]!,
          before = await snapshots(c);
        await c.writer.query('BEGIN');
        const grant = await bound(
          c,
          target,
          fault === 'credit' ? 1 : undefined,
        );
        try {
          if (fault === 'binding')
            await c.writer.query(
              "SELECT set_config('hash_talk.content_operation',$1,true)",
              [crypto.randomUUID()],
            );
          await assert.rejects(
            fault === 'missing'
              ? c.writer.query(
                  'SELECT hash_talk.assert_file_reclamation_complete()',
                )
              : c.writer.query(target.sql, [target.id]),
            { code: 'PCA01' },
          );
        } finally {
          await c.writer.query('ROLLBACK');
          await c.allocator.finish(grant);
        }
        assert.deepEqual(await snapshots(c), before);
      }
    },
  );
  await t.test(
    'savepoint rollback restores the source and consumption before a valid final effect',
    async () => {
      const s = await ready(c),
        target = targets(c.db, s)[2]!;
      await c.writer.query('BEGIN');
      const grant = await bound(c, target);
      try {
        await c.writer.query('SAVEPOINT reclamation');
        await c.writer.query(target.sql, [target.id]);
        await c.writer.query('ROLLBACK TO SAVEPOINT reclamation');
        await c.writer.query(target.sql, [target.id]);
        await c.writer.query(
          'SELECT hash_talk.assert_file_reclamation_complete()',
        );
        await c.writer.query('COMMIT');
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
      }
      await reconciled(c, s);
    },
  );
  await t.test(
    'a skipped delete refuses COMMIT and retains file charges',
    async () => {
      const s = await ready(c),
        before = await snapshots(c);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_skip_reclaim() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END;$$;
      CREATE TRIGGER synthetic_skip_reclaim BEFORE DELETE ON hash_talk.social_media FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_skip_reclaim()`);
      try {
        await assert.rejects(c.db.socialMedia.collected(s.dm.media), {
          status: 503,
        });
        assert.deepEqual(await snapshots(c), before);
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_skip_reclaim ON hash_talk.social_media; DROP FUNCTION hash_talk.synthetic_skip_reclaim()',
        );
      }
      await reconciled(c, s);
    },
  );
}
async function durableFiles(t: TestContext) {
  await t.test(
    'file failure keeps charges; unlink-before-SQL failure retries after restart without an open SQL transaction during I/O',
    async (caseContext) => {
      const c = await messageReceiptFixture(caseContext),
        s = await ready(c),
        directory = await realpath(
          await mkdtemp(join(tmpdir(), 'hash-talk-reclamation-')),
        ),
        objects = new ObjectStore(directory);
      caseContext.after(() => rm(directory, { recursive: true, force: true }));
      await objects.initialize();
      const bytes = new Uint8Array([1, 2, 3]),
        child = await objects.attachment(s.attachment),
        hash = await child.put(bytes),
        before = await snapshots(c);
      const service = new AttachmentService(c.db.attachments, null, objects),
        discard = objects.discardAttachment.bind(objects);
      const failure = caseContext.mock.method(
        objects,
        'discardAttachment',
        () => Promise.reject(new Error('synthetic unlink failure')),
      );
      await assert.rejects(service.clean(), /synthetic unlink failure/u);
      failure.mock.restore();
      assert.deepEqual([...(await child.read(hash))], [...bytes]);
      assert.deepEqual(await snapshots(c), before);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_reclaim_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic SQL failure';END;$$;
      CREATE TRIGGER synthetic_reclaim_failure BEFORE DELETE ON hash_talk.message_attachments FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_reclaim_failure()`);
      const observed = caseContext.mock.method(
        objects,
        'discardAttachment',
        async (id: string) => {
          const open = await c.inspector.query(
            "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='hash-talk' AND state='idle in transaction'",
          );
          assert.equal(open.rowCount, 0);
          await discard(id);
        },
      );
      try {
        await assert.rejects(service.clean(), /synthetic SQL failure/u);
        await assert.rejects(objects.readAttachment(s.attachment), {
          code: 'ENOENT',
        });
        assert.deepEqual(await snapshots(c), before);
      } finally {
        observed.mock.restore();
        await c.inspector.query(
          'DROP TRIGGER synthetic_reclaim_failure ON hash_talk.message_attachments; DROP FUNCTION hash_talk.synthetic_reclaim_failure()',
        );
      }
      const worker = new Database(
        c.url,
        new VolumeContentCapacity({
          read: () => Promise.resolve(c.room.bytes),
        }),
        [],
        'worker',
      );
      try {
        await new AttachmentService(
          worker.attachments,
          null,
          new ObjectStore(directory),
        ).clean();
      } finally {
        await worker.close();
      }
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.message_attachments WHERE id=$1',
            [s.attachment],
          )
        ).rowCount,
        0,
      );
      await reconciled(c, s);
    },
  );
}
async function ordinary(t: TestContext, c: MessageReceiptFixture) {
  await t.test(
    'ordinary application permissions confirm each source without privileged functions',
    async () => {
      const s = await ready(c),
        role = 'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      await c.inspector
        .query(`CREATE ROLE "${role}" NOLOGIN; GRANT USAGE ON SCHEMA hash_talk TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`);
      const client = allocationWriter(c.url, role),
        pool = allocationPool(c.url, role),
        capacity = new VolumeContentCapacity({
          read: () => Promise.resolve(c.room.bytes),
        }),
        allocator = new ContentAllocator(pool, (client) =>
          capacity.allocationHeadroom(client),
        );
      await client.connect();
      try {
        assert.equal(
          (
            await client.query<{ rolsuper: boolean }>(
              'SELECT rolsuper FROM pg_roles WHERE rolname=current_user',
            )
          ).rows[0]!.rolsuper,
          false,
        );
        for (const target of targets(c.db, s)) {
          await client.query('BEGIN');
          const grant = await bound(
            { ...c, writer: client, allocator },
            target,
          );
          try {
            await client.query(target.sql, [target.id]);
            await client.query(
              'SELECT hash_talk.assert_file_reclamation_complete()',
            );
            await client.query('COMMIT');
          } finally {
            await client.query('ROLLBACK');
            await allocator.finish(grant);
          }
        }
        await reconciled(c, s);
      } finally {
        await client.end();
        await pool.end();
        await c.inspector.query(`DROP OWNED BY "${role}"; DROP ROLE "${role}"`);
      }
    },
  );
  await t.test(
    'personal cleanup waiting behind a collector completes after exact collection commits',
    async () => {
      const s = await ready(c),
        target = targets(c.db, s)[1]!,
        block = await vault(c, s.pair.recipient);
      await c.writer.query('BEGIN');
      const grant = await bound(c, target);
      const holder = (
        await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      const cleaning = c.db.backups.clean(
        s.pair.recipient,
        proof(s.pair.recipient, [block]),
      );
      void cleaning.catch(() => undefined);
      try {
        await waitForBlocked(c.inspector, holder);
        await c.writer.query(target.sql, [target.id]);
        await c.writer.query(
          'SELECT hash_talk.assert_file_reclamation_complete()',
        );
        await c.writer.query('COMMIT');
        await cleaning;
      } finally {
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
        await cleaning;
      }
      await reconciled(c, s);
    },
  );
}
async function recovery(t: TestContext, c: MessageReceiptFixture) {
  await t.test(
    'a collector waiting for the counterpart rechecks a concurrently finalized row',
    async () => {
      const s = await ready(c),
        target = targets(c.db, s)[1]!;
      await c.reader.query('BEGIN');
      const holder = (
        await c.reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      await c.reader.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [s.pair.recipient.session.accountId],
      );
      const collecting = target.collect();
      void collecting.catch(() => undefined);
      try {
        await waitForBlocked(c.inspector, holder);
        await c.reader.query(target.sql, [target.id]);
        await c.reader.query('COMMIT');
        await collecting;
      } finally {
        await c.reader.query('ROLLBACK');
        await collecting;
      }
      await reconciled(c, s);
    },
  );
  await t.test(
    'acknowledged collection retains credit and fails health on finalization failure until recovery',
    async () => {
      const s = await ready(c);
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.synthetic_reclaim_finish() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic finalization failure';END;$$;
      CREATE TRIGGER synthetic_reclaim_finish BEFORE DELETE ON hash_talk.content_allocations FOR EACH ROW EXECUTE FUNCTION hash_talk.synthetic_reclaim_finish()`);
      try {
        await c.db.socialMedia.collected(s.dm.media);
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query(
              "SELECT 1 FROM hash_talk.content_allocations WHERE scope='file-reclaim'",
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await c.inspector.query(
              'SELECT 1 FROM hash_talk.social_media WHERE id=$1',
              [s.dm.media],
            )
          ).rowCount,
          0,
        );
      } finally {
        await c.inspector.query(
          'DROP TRIGGER synthetic_reclaim_finish ON hash_talk.content_allocations; DROP FUNCTION hash_talk.synthetic_reclaim_finish()',
        );
      }
      assert.equal(await c.allocator.collect(), 1);
      await reconciled(c, s);
    },
  );
}
await test('file reclamation preserves durable deletion, exact accounting and bounded scoped confirmation', async (t) => {
  const c = await messageReceiptFixture(t);
  await runtime(t, c);
  await guards(t, c);
  await durableFiles(t);
  await ordinary(t, c);
  await recovery(t, c);
});
