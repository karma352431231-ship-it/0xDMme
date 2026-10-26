import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { historicalMigrations } from '../fixtures/historical-migrations.ts';
import { Wallet } from 'ethers';
import { AccountService } from '../../src/server/account/index.ts';
import { Database } from '../../src/server/database/index.ts';
import {
  assertContentCapacity,
  assertContentReclamationCapacity,
} from '../../src/server/database/content-capacity.ts';
import { assertVaultQuota } from '../../src/server/database/vault-quota.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  storageReservationPredecessor,
  seedStorageReservations,
  reservationSourceHashes,
  assertStorageReconciled,
} from '../fixtures/storage-reservation-database.ts';
import { AccountError } from '../../src/shared/account/index.ts';

interface CapacityContext {
  db: Database;
  writer: pg.Client;
  reader: pg.Client;
  capacity: VolumeContentCapacity;
  volume: { available: bigint; failed: boolean };
  fixture: Awaited<ReturnType<typeof seedStorageReservations>>;
}
const fullVolume = 1000000000000n;
async function rollback(client: pg.Client, work: () => Promise<void>) {
  await client.query('BEGIN');
  try {
    await work();
  } finally {
    await client.query('ROLLBACK');
  }
}
function pressure(error: unknown) {
  return error instanceof AccountError && error.status === 503;
}
async function addAttachment(
  client: pg.Client,
  input: { message: string; sender: string; recipient: string; charge: number },
) {
  await client.query(
    "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES(gen_random_uuid(),$1,$2,$3,'{}',512,$4)",
    [input.message, input.sender, input.recipient, input.charge],
  );
}
async function verifyGrowth(t: TestContext, c: CapacityContext) {
  const { writer, capacity, volume, fixture } = c;
  await t.test(
    'physical admission refuses an incompletely initialized integrated schema',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          'DELETE FROM hash_talk.schema_migrations WHERE version=84',
        );
        await assert.rejects(assertContentCapacity(writer, capacity), pressure);
      });
    },
  );
  await t.test(
    'physical admission accepts exact logical usage above the retired 900 MB ceiling while individual quotas remain',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,sequence)
        SELECT ($1::uuid[])[1+(i%3)],gen_random_uuid(),repeat(md5('quota'||i),2),repeat(md5('object'||i),2),'{}',3010000,'accepted',100+i FROM generate_series(1,400) i`,
          [fixture.accounts],
        );
        await assert.rejects(
          assertContentCapacity(writer, 900000000),
          pressure,
        );
        await assertContentCapacity(writer, capacity);
        for (const account of fixture.accounts)
          await assertVaultQuota(writer, account);
        await assertStorageReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'fresh free-space observations reject new reservations without retaining source/counter effects',
    async () => {
      const before = await c.db.storageReservations.snapshot();
      volume.available = 0n;
      await rollback(writer, async () => {
        await addAttachment(writer, {
          message: crypto.randomUUID(),
          sender: fixture.first,
          recipient: fixture.second,
          charge: 1024,
        });
        await assert.rejects(assertContentCapacity(writer, capacity), pressure);
      });
      volume.available = fullVolume;
      assert.deepEqual(await c.db.storageReservations.snapshot(), before);
      await assertStorageReconciled(writer, fixture.accounts);
    },
  );
  await t.test(
    'mount/measurement errors and nontransactional admission fail closed with the existing translated reason',
    async () => {
      volume.failed = true;
      await rollback(writer, () =>
        assert.rejects(
          assertContentCapacity(writer, capacity),
          (error) =>
            error instanceof AccountError &&
            error.status === 503 &&
            error.message ===
              'Global capacity occupied by stored data or ongoing uploads. Resume later.',
        ),
      );
      volume.failed = false;
      await assert.rejects(assertContentCapacity(writer, capacity), pressure);
    },
  );
}
async function verifyRuntimeConnection(t: TestContext, c: CapacityContext) {
  await t.test(
    'real wallet login uses the volume-mode pool and rolls account creation back on pressure',
    async () => {
      const service = new AccountService({
        store: c.db.authentication,
        origin: 'http://127.0.0.1:45117',
      });
      const login = async (wallet = Wallet.createRandom()) => {
        const challenge = await service.challenge({
          address: wallet.address,
          chainId: 1,
          deviceId: crypto.randomUUID(),
        });
        return service.login(
          {
            id: challenge.id,
            signature: await wallet.signMessage(challenge.message),
          },
          challenge.browserToken,
        );
      };
      const wallet = Wallet.createRandom();
      const opened = await login(wallet);
      assert.ok(opened.session.accountId);
      const before = (
        await c.writer.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM hash_talk.accounts',
        )
      ).rows[0]!.n;
      c.volume.available = 0n;
      try {
        await assert.rejects(login(), pressure);
        assert.equal(
          (await login(wallet)).session.accountId,
          opened.session.accountId,
        );
      } finally {
        c.volume.available = fullVolume;
      }
      assert.equal(
        (
          await c.writer.query<{ n: string }>(
            'SELECT count(*)::text AS n FROM hash_talk.accounts',
          )
        ).rows[0]!.n,
        before,
      );
    },
  );
  await t.test(
    'ordinary app-role permissions can measure the physical policy without PostgreSQL superuser access',
    async () => {
      const role = 'capacity_role_' + crypto.randomUUID().replaceAll('-', '');
      await c.writer.query(`CREATE ROLE "${role}"`);
      try {
        await c.writer.query(`GRANT USAGE ON SCHEMA hash_talk TO "${role}"`);
        await c.writer.query(
          `GRANT SELECT ON hash_talk.storage_reservation_usage,hash_talk.schema_migrations TO "${role}"`,
        );
        await c.writer.query(
          `GRANT SELECT,UPDATE ON hash_talk.content_usage TO "${role}"`,
        );
        await c.writer.query(
          `GRANT SELECT,UPDATE ON hash_talk.content_usage_legacy,hash_talk.content_allocation_guard TO "${role}"`,
        );
        await c.writer.query(
          `GRANT SELECT ON hash_talk.content_allocations TO "${role}"`,
        );
        await rollback(c.writer, async () => {
          await c.writer.query(`SET LOCAL ROLE "${role}"`);
          await assertContentCapacity(c.writer, c.capacity);
        });
      } finally {
        await c.writer.query(`DROP OWNED BY "${role}"`);
        await c.writer.query(`DROP ROLE "${role}"`);
      }
    },
  );
  await t.test(
    'ranking producer uses physical preflight and transactional publication',
    async () => {
      await c.db.communityRanking.process();
      assert.ok(
        (
          await c.writer.query<{ n: number }>(
            'SELECT count(*)::integer AS n FROM hash_talk.community_ranking_generations WHERE published',
          )
        ).rows[0]!.n > 0,
      );
    },
  );
  await t.test(
    'physical mutation admission refuses repeatable transaction snapshots',
    async () => {
      for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
        await c.writer.query('BEGIN ISOLATION LEVEL ' + isolation);
        try {
          await assert.rejects(
            assertContentCapacity(c.writer, c.capacity),
            pressure,
          );
        } finally {
          await c.writer.query('ROLLBACK');
        }
      }
    },
  );
}
async function verifyReclamation(t: TestContext, c: CapacityContext) {
  const { writer, capacity, volume, fixture } = c;
  await t.test(
    'authorized cleanup receipts use operational reserve without granting new upload promises',
    async () => {
      volume.available = 2048n;
      await rollback(writer, async () => {
        await writer.query(
          "INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,charge) VALUES($1,'vault',gen_random_uuid(),repeat('a',64),'{}',512)",
          [fixture.first],
        );
        await assert.rejects(assertContentCapacity(writer, capacity), pressure);
        await assertContentReclamationCapacity(writer, capacity);
      });
      volume.available = fullVolume;
      await rollback(writer, async () => {
        await addAttachment(writer, {
          message: crypto.randomUUID(),
          sender: fixture.first,
          recipient: fixture.second,
          charge: 1024,
        });
        await assert.rejects(
          assertContentReclamationCapacity(writer, capacity),
          pressure,
        );
      });
    },
  );
  await t.test(
    'completing or discarding an already charged reservation can progress under storage pressure',
    async () => {
      volume.available = 0n;
      await rollback(writer, async () => {
        await writer.query(
          "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1",
          [fixture.packet],
        );
        await assertContentCapacity(writer, capacity);
        await assertStorageReconciled(writer, fixture.accounts);
      });
      volume.available = fullVolume;
    },
  );
  await t.test(
    'baselines keep the first transaction values and expire on rollback and commit',
    async () => {
      await rollback(writer, async () => {
        const initial = (
          await writer.query<{ used_bytes: string }>(
            'SELECT used_bytes::text FROM hash_talk.content_usage',
          )
        ).rows[0]!.used_bytes;
        const message = crypto.randomUUID();
        await addAttachment(writer, {
          message,
          sender: fixture.first,
          recipient: fixture.second,
          charge: 1024,
        });
        await writer.query(
          'UPDATE hash_talk.message_attachments SET charge=charge+1 WHERE message_id=$1',
          [message],
        );
        assert.equal(
          (
            await writer.query<{ value: string }>(
              "SELECT current_setting('hash_talk.storage_logical_baseline',true) AS value",
            )
          ).rows[0]!.value,
          initial,
        );
      });
      const after = (
        await writer.query<{ logical: string | null; pending: string | null }>(
          "SELECT current_setting('hash_talk.storage_logical_baseline',true) AS logical,current_setting('hash_talk.storage_pending_baseline',true) AS pending",
        )
      ).rows[0]!;
      assert.ok(!after.logical && !after.pending);
    },
  );
}
async function capacityBoundary(c: CapacityContext) {
  let low = 0n,
    high = fullVolume;
  const logical = Number(
    (
      await c.writer.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage',
      )
    ).rows[0]!.bytes,
  );
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    c.volume.available = middle;
    if (
      await c.capacity.fits(c.writer, {
        logicalBytes: logical,
        additionalBytes: 0,
      })
    )
      high = middle;
    else low = middle;
  }
  return high;
}
async function verifyConcurrentClaims(t: TestContext, c: CapacityContext) {
  await t.test(
    'independent connections cannot promise the same remaining physical bytes',
    async () => {
      const { writer, reader, capacity, volume, fixture } = c;
      const before = await c.db.storageReservations.snapshot(),
        message = crypto.randomUUID();
      volume.available = (await capacityBoundary(c)) + 15000000n;
      const reserve = async (client: pg.Client) => {
        await client.query('BEGIN');
        try {
          await addAttachment(client, {
            message,
            sender: fixture.first,
            recipient: fixture.second,
            charge: 10000000,
          });
          await assertContentCapacity(client, capacity);
          await client.query('COMMIT');
          return 'accepted';
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          if (pressure(error)) return 'refused';
          throw error;
        }
      };
      try {
        assert.deepEqual(
          (await Promise.all([reserve(writer), reserve(reader)])).sort(),
          ['accepted', 'refused'],
        );
        const after = await c.db.storageReservations.snapshot();
        assert.equal(after.reservations, before.reservations + 1);
        assert.equal(after.reservedBytes, before.reservedBytes + 10000000);
        await assertStorageReconciled(writer, fixture.accounts);
      } finally {
        volume.available = fullVolume;
        await writer.query(
          'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
          [message],
        );
      }
    },
  );
}
await test('physical capacity preserves atomic reservations, cleanup and migration history', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const administrator = new pg.Client({ connectionString: config.databaseUrl }),
    name =
      'hash_talk_test_physical_capacity_' +
      crypto.randomUUID().replaceAll('-', '');
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const volume = { available: fullVolume, failed: false },
    capacity = new VolumeContentCapacity({
      read: () =>
        volume.failed
          ? Promise.reject(new Error('private filesystem detail'))
          : Promise.resolve(volume.available),
    });
  const db = new Database(url.href, capacity),
    writer = new pg.Client({ connectionString: url.href }),
    reader = new pg.Client({ connectionString: url.href });
  t.after(async () => {
    await writer.query('ROLLBACK');
    await Promise.all([db.close(), writer.end(), reader.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await Promise.all([writer.connect(), reader.connect()]);
  await storageReservationPredecessor(writer);
  const sql = await readFile(
    new URL(
      '../../src/server/database/migrations/077-storage-reservation-accounting.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await writer.query('BEGIN');
  await writer.query(sql);
  await writer.query(
    'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES(77,$1)',
    [createHash('sha256').update(sql).digest('hex')],
  );
  await writer.query('COMMIT');
  const fixture = await seedStorageReservations(writer),
    hashes = await reservationSourceHashes(writer),
    global = (
      await writer.query('SELECT used_bytes FROM hash_talk.content_usage')
    ).rows,
    versions = (
      await writer.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows;
  await historicalMigrations(writer, ['078-storage-admission-baselines.sql']);
  await writer.query("SET hash_talk.storage_capacity_mode='volume'");
  await reader.query("SET hash_talk.storage_capacity_mode='volume'");
  await t.test(
    'populated baseline migration preserves source fingerprints and old accounting/catalog',
    async () => {
      assert.deepEqual(await reservationSourceHashes(writer), hashes);
      assert.deepEqual(
        (await writer.query('SELECT used_bytes FROM hash_talk.content_usage'))
          .rows,
        global,
      );
      assert.deepEqual(
        (
          await writer.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=77 ORDER BY version',
          )
        ).rows,
        versions,
      );
      await assertStorageReconciled(writer, fixture.accounts);
      await db.migrate();
      await db.verifyMigrations();
    },
  );
  const context = { db, writer, reader, capacity, volume, fixture };
  await verifyGrowth(t, context);
  await verifyRuntimeConnection(t, context);
  await verifyReclamation(t, context);
  await verifyConcurrentClaims(t, context);
});
