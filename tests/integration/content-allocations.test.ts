import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import pg from 'pg';
import {
  Database,
  ContentAllocator,
  readStorageReservations,
} from '../../src/server/database/index.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  seedStorageReservations,
  reservationSourceHashes,
  assertStorageReconciled,
} from '../fixtures/storage-reservation-database.ts';
import {
  allocationPool,
  allocationPoolErrors,
  allocationWriter,
  allocationPredecessor,
  allocationRows,
  beginOwners,
  endOwners,
  expectNoAllocations,
} from '../fixtures/content-allocation-database.ts';
import { allocationCommitProxy } from '../fixtures/allocation-commit-proxy.ts';

interface Context {
  url: string;
  writer: pg.Client;
  reader: pg.Client;
  inspector: pg.Client;
  allocator: ContentAllocator;
  pool: pg.Pool;
  room: { bytes: bigint };
  fixture: Awaited<ReturnType<typeof seedStorageReservations>>;
}
function pressure(error: unknown) {
  return error instanceof AccountError && error.status === 503;
}
async function owners(c: Context, operation: () => Promise<void>) {
  await beginOwners([c.writer, c.reader]);
  try {
    await operation();
  } finally {
    await endOwners([c.writer, c.reader]);
    await c.allocator.collect();
    await expectNoAllocations(c.inspector);
  }
}
async function verifyClaims(t: TestContext, c: Context) {
  const { writer, reader, inspector, allocator, room } = c;
  await t.test(
    'competing coordinators cannot grant the same available bytes',
    async () => {
      const second = allocationPool(c.url),
        other = new ContentAllocator(second, () => Promise.resolve(room.bytes));
      try {
        await owners(c, async () => {
          room.bytes = 1000n;
          const results = await Promise.allSettled([
            allocator.reserve(writer, 700),
            other.reserve(reader, 700),
          ]);
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1,
          );
          const rejected = results.find((r) => r.status === 'rejected');
          assert.ok(
            rejected?.status === 'rejected' && pressure(rejected.reason),
          );
          assert.equal((await allocationRows(inspector)).length, 1);
        });
      } finally {
        await second.end();
      }
    },
  );
  await t.test(
    'independent granted operations coexist and release the coordinator guard before their SQL completes',
    async () => {
      await owners(c, async () => {
        room.bytes = 1000n;
        const grants = await Promise.all([
          allocator.reserve(writer, 400),
          allocator.reserve(reader, 600),
        ]);
        assert.equal((await allocationRows(inspector)).length, 2);
        await inspector.query('BEGIN');
        try {
          await inspector.query('SET LOCAL lock_timeout=200');
          await inspector.query(
            'SELECT singleton FROM hash_talk.content_allocation_guard WHERE singleton FOR UPDATE',
          );
        } finally {
          await inspector.query('ROLLBACK');
        }
        assert.equal(await allocator.finish(grants[0]), false);
        assert.equal(await allocator.collect(), 0);
      });
    },
  );
  await t.test(
    'same transaction retry is idempotent and cannot silently resize or refund a live credit',
    async () => {
      await owners(c, async () => {
        room.bytes = 1000n;
        const grant = await allocator.reserve(writer, 700);
        assert.deepEqual(await allocator.reserve(writer, 700), grant);
        assert.equal(Object.isFrozen(grant), true);
        await assert.rejects(allocator.reserve(writer, 600), pressure);
        await assert.rejects(allocator.reserve(writer, 800), pressure);
        assert.equal((await allocationRows(inspector))[0]?.bytes, '700');
        await writer.query('ROLLBACK');
        assert.equal(await allocator.finish(grant), true);
        assert.equal(await allocator.finish(grant), true);
      });
    },
  );
  await t.test(
    'a savepoint rollback keeps the top-level owner and its full credits alive',
    async () => {
      await owners(c, async () => {
        room.bytes = 1000n;
        await writer.query('SAVEPOINT payload');
        const grant = await allocator.reserve(writer, 700);
        await writer.query('ROLLBACK TO SAVEPOINT payload');
        assert.equal(await allocator.finish(grant), false);
        assert.equal(await allocator.collect(), 0);
        await assert.rejects(allocator.reserve(reader, 400), pressure);
      });
    },
  );
  await t.test(
    'pool replacement preserves active credits and recovers a completed owner without its finalizer',
    async () => {
      const first = allocationPool(c.url),
        next = allocationPool(c.url);
      try {
        await owners(c, async () => {
          room.bytes = 1000n;
          const old = new ContentAllocator(first, () =>
            Promise.resolve(room.bytes),
          );
          await old.reserve(writer, 700);
          await first.end();
          const restarted = new ContentAllocator(next, () =>
            Promise.resolve(room.bytes),
          );
          await assert.rejects(restarted.reserve(reader, 400), pressure);
          await writer.query('COMMIT');
          const grant = await restarted.reserve(reader, 400);
          assert.equal(grant.bytes, 400);
          assert.equal((await allocationRows(inspector)).length, 1);
        });
      } finally {
        if (!first.ended) await first.end();
        await next.end();
      }
    },
  );
}
async function verifyPhysical(t: TestContext, c: Context) {
  const { writer, reader, inspector, fixture } = c;
  await t.test(
    'collection precedes a fresh pending-space read so committed promises do not become free credits',
    async () => {
      const baseline = BigInt(
          (await readStorageReservations(inspector)).reservedBytes,
        ),
        measured = new ContentAllocator(
          c.pool,
          async (client) =>
            1000n -
            (BigInt((await readStorageReservations(client)).reservedBytes) -
              baseline),
        ),
        id = crypto.randomUUID();
      try {
        await owners(c, async () => {
          await measured.reserve(writer, 700);
          await writer.query(
            "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES($1,gen_random_uuid(),$2,$3,'{}',512,700)",
            [id, fixture.first, fixture.second],
          );
          await writer.query('COMMIT');
          await assert.rejects(measured.reserve(reader, 400), pressure);
          const grant = await measured.reserve(reader, 300);
          assert.equal(grant.bytes, 300);
        });
      } finally {
        await inspector.query(
          'DELETE FROM hash_talk.message_attachments WHERE id=$1',
          [id],
        );
      }
      await assertStorageReconciled(inspector, fixture.accounts);
    },
  );
  await t.test(
    'rollback restores pending room and recovery drops the abandoned credit',
    async () => {
      await owners(c, async () => {
        c.room.bytes = 700n;
        await c.allocator.reserve(writer, 700);
        await writer.query('ROLLBACK');
        await c.allocator.reserve(reader, 700);
        assert.equal((await allocationRows(inspector)).length, 1);
      });
    },
  );
  await t.test(
    'the physical provider samples current space and refuses measurement failure and pressure',
    async () => {
      let failed = false;
      let available = 1000000000000n;
      const capacity = new VolumeContentCapacity({
          read: () =>
            failed
              ? Promise.reject(new Error('synthetic filesystem failure'))
              : Promise.resolve(available),
        }),
        measured = new ContentAllocator(c.pool, (client) =>
          capacity.allocationHeadroom(client),
        );
      await owners(c, async () => {
        await measured.reserve(writer, 512);
        available = 1n;
        await assert.rejects(measured.reserve(reader, 512), pressure);
        failed = true;
        await assert.rejects(measured.reserve(reader, 512), pressure);
        assert.equal((await allocationRows(inspector)).length, 1);
      });
    },
  );
}
async function verifyBoundaries(t: TestContext, c: Context) {
  const { writer, reader, allocator, inspector } = c;
  await t.test(
    'invalid envelopes and autocommit, read-only, fixed or stale-snapshot owners cannot obtain credits',
    async () => {
      for (const bytes of [
        0,
        -1,
        0.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
      ])
        await assert.rejects(allocator.reserve(writer, bytes), pressure);
      await assert.rejects(allocator.reserve(writer, 1), pressure);
      for (const command of [
        'BEGIN READ ONLY',
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        'BEGIN ISOLATION LEVEL SERIALIZABLE',
      ]) {
        await writer.query(command);
        try {
          await assert.rejects(allocator.reserve(writer, 1));
        } finally {
          await writer.query('ROLLBACK');
        }
      }
      await writer.query('BEGIN');
      try {
        await writer.query("SET LOCAL hash_talk.storage_capacity_mode='fixed'");
        await assert.rejects(allocator.reserve(writer, 1), pressure);
      } finally {
        await writer.query('ROLLBACK');
      }
      await expectNoAllocations(inspector);
    },
  );
  await t.test(
    'different installation state cannot grant or finish a credit',
    async () => {
      await owners(c, async () => {
        await writer.query(
          'UPDATE hash_talk.service_metadata SET installation_id=gen_random_uuid() WHERE singleton',
        );
        await assert.rejects(allocator.reserve(writer, 100), pressure);
        await writer.query('ROLLBACK');
        await writer.query('BEGIN');
        c.room.bytes = 1000n;
        const grant = await allocator.reserve(writer, 100);
        await assert.rejects(
          allocator.finish({ ...grant, installationId: crypto.randomUUID() }),
          pressure,
        );
        assert.equal((await allocationRows(inspector)).length, 1);
      });
    },
  );
  await t.test(
    'missing coordination guard refuses grants without falling back to an unchecked total',
    async () => {
      await owners(c, async () => {
        await inspector.query('DELETE FROM hash_talk.content_allocation_guard');
        try {
          await assert.rejects(allocator.reserve(writer, 1), pressure);
        } finally {
          await inspector.query(
            'INSERT INTO hash_talk.content_allocation_guard VALUES(true)',
          );
        }
      });
    },
  );
  await t.test(
    'coordinator waits are bounded and a failed grant leaves the owner transaction usable',
    async () => {
      await owners(c, async () => {
        await writer.query(
          'SELECT singleton FROM hash_talk.content_allocation_guard WHERE singleton FOR UPDATE',
        );
        await assert.rejects(
          allocator.reserve(reader, 100),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '55P03',
        );
        await reader.query('SELECT 1');
        await writer.query('ROLLBACK');
        c.room.bytes = 1000n;
        await allocator.reserve(reader, 100);
      });
    },
  );
  await t.test(
    'failed headroom reads roll collection back and leave recoverable credits durable',
    async () => {
      await owners(c, async () => {
        c.room.bytes = 1000n;
        await allocator.reserve(writer, 700);
        await writer.query('COMMIT');
        const failed = new ContentAllocator(c.pool, () =>
          Promise.reject(new Error('measurement unavailable')),
        );
        await assert.rejects(
          failed.reserve(reader, 100),
          /measurement unavailable/u,
        );
        assert.equal((await allocationRows(inspector)).length, 1);
        assert.equal(await allocator.collect(), 1);
      });
    },
  );
}
async function verifyRecovery(t: TestContext, c: Context) {
  const { writer, reader, inspector, allocator } = c;
  await t.test(
    'bounded recovery removes at most 128 completed owners and never expires a live owner',
    async () => {
      const finished: string[] = [];
      for (let i = 0; i < 129; i++)
        finished.push(
          (
            await writer.query<{ id: string }>(
              'SELECT pg_current_xact_id()::text AS id',
            )
          ).rows[0]!.id,
        );
      await owners(c, async () => {
        c.room.bytes = 1000n;
        await allocator.reserve(reader, 100);
        await inspector.query(
          'INSERT INTO hash_talk.content_allocations SELECT id::xid8,1 FROM unnest($1::text[]) id',
          [finished],
        );
        assert.equal(await allocator.collect(), 128);
        assert.equal(await allocator.collect(), 1);
        assert.equal(await allocator.collect(), 0);
        assert.equal((await allocationRows(inspector)).length, 1);
      });
    },
  );
  await t.test(
    'a disconnected writer cannot retain orphan credits indefinitely',
    async () => {
      const lost = allocationWriter(c.url);
      await lost.connect();
      try {
        await lost.query('BEGIN');
        c.room.bytes = 1000n;
        const grant = await allocator.reserve(lost, 700);
        await lost.end();
        // A fresh command on another connection proves the backend removal has
        // reached the process array; collect can safely reclaim that owner.
        assert.equal(await allocator.finish(grant), true);
        await expectNoAllocations(inspector);
      } finally {
        await lost.end();
      }
    },
  );
  await t.test(
    'a failed coordinator COMMIT rolls its credit back and permits a later exact grant',
    async () => {
      await inspector.query(`CREATE FUNCTION hash_talk.test_refuse_allocation_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic coordinator commit refused'; END; $$;
      CREATE CONSTRAINT TRIGGER test_allocation_commit AFTER INSERT ON hash_talk.content_allocations
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hash_talk.test_refuse_allocation_commit()`);
      try {
        await owners(c, async () => {
          c.room.bytes = 1000n;
          await assert.rejects(
            allocator.reserve(writer, 700),
            /coordinator commit refused/u,
          );
          await expectNoAllocations(inspector);
        });
      } finally {
        await inspector.query(
          'DROP TRIGGER test_allocation_commit ON hash_talk.content_allocations; DROP FUNCTION hash_talk.test_refuse_allocation_commit()',
        );
      }
      await owners(c, async () => {
        await allocator.reserve(writer, 700);
      });
    },
  );
}

async function verifyPermissions(t: TestContext, c: Context) {
  await t.test(
    'a lost acknowledgement after real COMMIT retains the credit until its owner completes',
    async () => {
      const proxy = await allocationCommitProxy(c.url),
        pool = allocationPool(proxy.url),
        allocator = new ContentAllocator(pool, () => Promise.resolve(1000n));
      try {
        await owners(c, async () => {
          await assert.rejects(allocator.reserve(c.writer, 700));
          assert.equal(proxy.state.dropped, 1);
          assert.equal((await allocationRows(c.inspector))[0]?.bytes, '700');
          c.room.bytes = 1000n;
          await assert.rejects(c.allocator.reserve(c.reader, 400), pressure);
          await c.writer.query('ROLLBACK');
          await c.allocator.reserve(c.reader, 400);
          assert.equal((await allocationRows(c.inspector))[0]?.bytes, '400');
        });
      } finally {
        await pool.end();
        await proxy.close();
      }
    },
  );
  await t.test(
    'an ordinary application role can reserve, sample physical headroom and recover its credits',
    async () => {
      const role =
        'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      // Keep the environment's authenticated connection, then assume an
      // unprivileged role. This also works with CI's password authentication.
      await c.inspector.query(`CREATE ROLE "${role}" NOLOGIN`);
      const pool = allocationPool(c.url, role),
        writer = allocationWriter(c.url, role);
      try {
        await c.inspector.query(`GRANT USAGE ON SCHEMA hash_talk TO "${role}";
        GRANT SELECT ON hash_talk.service_metadata,hash_talk.schema_migrations,
          hash_talk.storage_reservation_usage TO "${role}";
        GRANT SELECT,UPDATE ON hash_talk.content_allocation_guard TO "${role}";
        GRANT SELECT,INSERT,DELETE ON hash_talk.content_allocations TO "${role}"`);
        await c.inspector
          .query(`GRANT SELECT,UPDATE ON hash_talk.content_usage_legacy,
          hash_talk.content_usage_partitions TO "${role}"`);
        await writer.connect();
        assert.equal(
          (await writer.query<{ name: string }>('SELECT current_user AS name'))
            .rows[0]?.name,
          role,
        );
        assert.equal(
          (await pool.query<{ name: string }>('SELECT current_user AS name'))
            .rows[0]?.name,
          role,
        );
        await writer.query('BEGIN');
        const capacity = new VolumeContentCapacity({
            read: () => Promise.resolve(1000000000000n),
          }),
          allocator = new ContentAllocator(pool, (client) =>
            capacity.allocationHeadroom(client),
          ),
          grant = await allocator.reserve(writer, 100);
        assert.equal(await allocator.finish(grant), false);
        await writer.query('COMMIT');
        assert.equal(await allocator.collect(), 1);
        await expectNoAllocations(c.inspector);
      } finally {
        await writer.end();
        await pool.end();
        await c.inspector.query(`DROP OWNED BY "${role}"; DROP ROLE "${role}"`);
      }
    },
  );
  await t.test(
    'a coordinator connection failure preserves both errors, discards the connection and allows recovery',
    async () => {
      await owners(c, async () => {
        const failed = new ContentAllocator(c.pool, async (client) => {
          await client.query('SELECT pg_terminate_backend(pg_backend_pid())');
          return 1000n;
        });
        await assert.rejects(
          failed.reserve(c.writer, 100),
          (error: unknown) =>
            error instanceof AggregateError &&
            error.errors.length === 2 &&
            error.cause instanceof Error,
        );
        await expectNoAllocations(c.inspector);
        c.room.bytes = 1000n;
        await c.allocator.reserve(c.writer, 100);
      });
    },
  );
}

await test('transaction-owned content credits preserve atomic grants and recover only completed owners', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const administrator = new pg.Client({ connectionString: config.databaseUrl }),
    name =
      'hash_talk_test_content_allocations_' +
      crypto.randomUUID().replaceAll('-', '');
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    writer = allocationWriter(url.href),
    reader = allocationWriter(url.href),
    inspector = allocationWriter(url.href),
    pool = allocationPool(url.href),
    room = { bytes: 1000n };
  t.after(async () => {
    await endOwners([writer, reader, inspector]);
    await Promise.all([
      db.close(),
      pool.end(),
      writer.end(),
      reader.end(),
      inspector.end(),
    ]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
    assert.deepEqual(
      allocationPoolErrors,
      [],
      'Unexpected idle pool errors must remain visible.',
    );
  });
  await Promise.all([writer.connect(), reader.connect(), inspector.connect()]);
  await allocationPredecessor(inspector);
  const fixture = await seedStorageReservations(inspector),
    hashes = await reservationSourceHashes(inspector),
    versions = (
      await inspector.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows,
    global = (await inspector.query('SELECT * FROM hash_talk.content_usage'))
      .rows;
  await db.migrate();
  await db.verifyMigrations();
  const allocator = new ContentAllocator(pool, () =>
      Promise.resolve(room.bytes),
    ),
    c = {
      url: url.href,
      writer,
      reader,
      inspector,
      allocator,
      pool,
      room,
      fixture,
    };
  await t.test(
    'populated migration preserves source hashes, quotas, global usage and prior catalog',
    async () => {
      assert.deepEqual(await reservationSourceHashes(inspector), hashes);
      assert.deepEqual(
        (await inspector.query('SELECT * FROM hash_talk.content_usage')).rows,
        global,
      );
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=76 ORDER BY version',
          )
        ).rows,
        versions,
      );
      await assertStorageReconciled(inspector, fixture.accounts);
      await expectNoAllocations(inspector);
      await db.migrate();
    },
  );
  await verifyClaims(t, c);
  await verifyPhysical(t, c);
  await verifyBoundaries(t, c);
  await verifyRecovery(t, c);
  await verifyPermissions(t, c);
});
