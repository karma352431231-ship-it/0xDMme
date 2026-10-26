import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { historicalMigrations } from '../fixtures/historical-migrations.ts';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { readStorageReservations } from '../../src/server/database/storage-reservations.ts';
import {
  reservationSources,
  storageReservationPredecessor,
  seedStorageReservations,
  reservationSourceHashes,
  assertStorageReconciled,
} from '../fixtures/storage-reservation-database.ts';

interface StorageContext {
  db: Database;
  writer: pg.Client;
  reader: pg.Client;
  fixture: Awaited<ReturnType<typeof seedStorageReservations>>;
  before: { global: unknown[]; versions: unknown[]; sourceHashes: unknown[] };
}

async function rollback(client: pg.Client, work: () => Promise<void>) {
  await client.query('BEGIN');
  try {
    await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function verifyReads(t: TestContext, context: StorageContext) {
  const { writer, reader, db, fixture, before } = context;
  await t.test(
    'populated backfill preserves all source rows, quotas, global bytes and earlier migration records',
    async () => {
      const snapshot = await assertStorageReconciled(writer, fixture.accounts);
      assert.equal(snapshot.reservations, 6);
      assert.equal(snapshot.reservedBytes, 115245);
      assert.deepEqual(
        await reservationSourceHashes(writer),
        before.sourceHashes,
      );
      assert.deepEqual(
        (await writer.query('SELECT used_bytes FROM hash_talk.content_usage'))
          .rows,
        before.global,
      );
      assert.deepEqual(
        (
          await writer.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=76 ORDER BY version',
          )
        ).rows,
        before.versions,
      );
      await db.migrate();
      await db.verifyMigrations();
    },
  );
  await t.test(
    'aggregate reads do not touch any payload or reservation-history table',
    async () => {
      const expected = await readStorageReservations(writer);
      await rollback(writer, async () => {
        await writer.query(
          'LOCK TABLE ' +
            reservationSources.map((s) => 'hash_talk.' + s).join(',') +
            ' IN ACCESS EXCLUSIVE MODE',
        );
        assert.deepEqual(await readStorageReservations(reader), expected);
        await assert.rejects(
          reader.query('SELECT * FROM hash_talk.storage_reservation_totals'),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '57014',
        );
      });
    },
  );
  await t.test(
    'private observation exposes aggregates only and fixed row count is not a pending-upload ceiling',
    async () => {
      const snapshot = await db.storageReservations.snapshot();
      assert.deepEqual(Object.keys(snapshot).sort(), [
        'reservations',
        'reservedBytes',
        'sources',
      ]);
      assert.deepEqual(
        snapshot.sources.map((row) => Object.keys(row).sort()),
        reservationSources.map(() => [
          'reservations',
          'reservedBytes',
          'source',
        ]),
      );
      assert.equal(
        (
          await writer.query<{ n: number }>(
            'SELECT count(*)::integer AS n FROM hash_talk.storage_reservation_usage',
          )
        ).rows[0]?.n,
        1536,
      );
      await rollback(writer, async () => {
        await writer.query(
          `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge)
        SELECT gen_random_uuid(),gen_random_uuid(),$1,$2,'{}',512,1024 FROM generate_series(1,1600)`,
          [fixture.first, fixture.second],
        );
        const expanded = await assertStorageReconciled(
          writer,
          fixture.accounts,
        );
        assert.equal(expanded.reservations, snapshot.reservations + 1600);
        assert.equal(
          (
            await writer.query<{ n: number }>(
              'SELECT count(*)::integer AS n FROM hash_talk.storage_reservation_usage',
            )
          ).rows[0]?.n,
          1536,
        );
      });
    },
  );
}

async function changeState(
  client: pg.Client,
  source: string,
  input: { id: string; state: string },
) {
  if (source === 'vault_operations') {
    await client.query(
      `UPDATE hash_talk.vault_operations SET state=$2,sequence=CASE WHEN $2='accepted' THEN 2 ELSE NULL END,
      writer=CASE WHEN $2='writing' THEN gen_random_uuid() ELSE NULL END WHERE id=$1`,
      [input.id, input.state],
    );
    return;
  }
  if (source === 'community_media') {
    await client.query(
      `UPDATE hash_talk.community_media SET status=$2,result=CASE WHEN $2='ready' THEN '{"bytes":1024,"thumbnailBytes":128}'::jsonb ELSE NULL END WHERE id=$1`,
      [input.id, input.state],
    );
    return;
  }
  await client.query(
    `UPDATE hash_talk.${source} SET status=$2,writer=CASE WHEN $2='writing' THEN gen_random_uuid() ELSE NULL END WHERE id=$1`,
    [input.id, input.state],
  );
}

async function verifyStates(t: TestContext, context: StorageContext) {
  const { writer, fixture } = context;
  await t.test(
    'all six write-capable lifecycles preserve their original full charge envelope',
    async () => {
      for (const source of reservationSources) {
        await rollback(writer, async () => {
          const id = fixture.ids.get(source)!;
          const initial = await readStorageReservations(writer);
          const states =
            source === 'vault_operations'
              ? ['writing', 'reserved', 'accepted', 'discarding', 'reserved']
              : source === 'community_media'
                ? ['processing', 'uploading', 'ready', 'deleting', 'uploading']
                : ['writing', 'ready', 'accepted', 'deleting', 'reserved'];
          for (const state of states) {
            await changeState(writer, source, { id, state });
            const current = await assertStorageReconciled(
              writer,
              fixture.accounts,
            );
            const promised =
              [
                'reserved',
                'writing',
                'ready',
                'uploading',
                'processing',
                'discarding',
              ].includes(state) &&
              !(source === 'community_media' && state === 'ready');
            assert.equal(
              current.reservations,
              initial.reservations - (promised ? 0 : 1),
            );
            assert.equal(
              current.sources.find((row) => row.source === source)
                ?.reservedBytes,
              promised
                ? initial.sources.find((row) => row.source === source)
                    ?.reservedBytes
                : 0,
            );
          }
        });
      }
    },
  );
  await t.test(
    'charge changes, partition moves and source deletion update only net pending deltas',
    async () => {
      for (const source of reservationSources) {
        await rollback(writer, async () => {
          const id = fixture.ids.get(source)!;
          const initial = await readStorageReservations(writer);
          await writer.query(
            `UPDATE hash_talk.${source} SET charge=charge+1${source === 'group_media' ? ',text_charge=text_charge+1' : ''} WHERE id=$1`,
            [id],
          );
          assert.equal(
            (await readStorageReservations(writer)).reservedBytes,
            initial.reservedBytes + 1,
          );
          await assertStorageReconciled(writer, fixture.accounts);
          await writer.query(
            `UPDATE hash_talk.${source} SET id=$2 WHERE id=$1`,
            [id, (id.startsWith('ff') ? '00' : 'ff') + id.slice(2)],
          );
          await assertStorageReconciled(writer, fixture.accounts);
          await writer.query(`DELETE FROM hash_talk.${source}`);
          await assertStorageReconciled(writer, fixture.accounts);
        });
      }
    },
  );
}

async function verifyCoordination(t: TestContext, context: StorageContext) {
  const { writer, reader, fixture } = context;
  await t.test(
    'state-only envelope changes follow the global ledger before partition rows',
    async () => {
      await rollback(writer, async () => {
        await changeState(writer, 'vault_operations', {
          id: fixture.ids.get('vault_operations')!,
          state: 'accepted',
        });
        await assert.rejects(
          reader.query(
            'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
          ),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '55P03',
        );
      });
    },
  );
  await t.test(
    'state transitions with the same envelope hold no added global or partition locks',
    async () => {
      await rollback(writer, async () => {
        const initial = (
          await writer.query(
            'SELECT source,bucket,reservations,reserved_bytes,xmin::text FROM hash_talk.storage_reservation_usage ORDER BY source,bucket',
          )
        ).rows;
        await changeState(writer, 'vault_operations', {
          id: fixture.ids.get('vault_operations')!,
          state: 'writing',
        });
        await reader.query(
          'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
        );
        await reader.query(
          'SELECT reserved_bytes FROM hash_talk.storage_reservation_usage FOR UPDATE NOWAIT',
        );
        assert.deepEqual(
          (
            await writer.query(
              'SELECT source,bucket,reservations,reserved_bytes,xmin::text FROM hash_talk.storage_reservation_usage ORDER BY source,bucket',
            )
          ).rows,
          initial,
        );
      });
    },
  );
  await t.test(
    'concurrent independent reservations commit exact counts and rollback restores the envelope',
    async () => {
      const message = crypto.randomUUID(),
        initial = await readStorageReservations(writer);
      const insert = (client: pg.Client) =>
        client.query(
          "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES(gen_random_uuid(),$1,$2,$3,'{}',512,1024)",
          [message, fixture.first, fixture.second],
        );
      try {
        await Promise.all([insert(writer), insert(reader)]);
        assert.equal(
          (await readStorageReservations(writer)).reservations,
          initial.reservations + 2,
        );
        await assertStorageReconciled(writer, fixture.accounts);
        await rollback(writer, async () => {
          await writer.query(
            'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
            [message],
          );
          assert.deepEqual(await readStorageReservations(writer), initial);
        });
        assert.equal(
          (await readStorageReservations(writer)).reservedBytes,
          initial.reservedBytes + 2048,
        );
      } finally {
        await writer.query(
          'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
          [message],
        );
      }
      assert.deepEqual(await readStorageReservations(writer), initial);
    },
  );
}

async function verifyFailures(t: TestContext, context: StorageContext) {
  const { writer, fixture } = context;
  await t.test(
    'missing partition accounting refuses observations and nonzero source changes',
    async () => {
      await rollback(writer, async () => {
        const id = fixture.ids.get('vault_operations')!;
        await writer.query(
          "DELETE FROM hash_talk.storage_reservation_usage WHERE source='vault_operations' AND bucket=get_byte(uuid_send($1::uuid),0)",
          [id],
        );
        await assert.rejects(
          readStorageReservations(writer),
          /accounting unavailable/u,
        );
        await assert.rejects(
          writer.query(
            'UPDATE hash_talk.vault_operations SET charge=charge+1 WHERE id=$1',
            [id],
          ),
          /Storage reservation accounting unavailable/u,
        );
      });
      await assertStorageReconciled(writer, fixture.accounts);
    },
  );
  await t.test(
    'unsafe aggregated byte counts fail closed without coercion or overflow',
    async () => {
      await rollback(writer, async () => {
        await writer.query(
          "UPDATE hash_talk.storage_reservation_usage SET reserved_bytes=9007199254740992 WHERE source='vault_operations' AND bucket=0",
        );
        await assert.rejects(
          readStorageReservations(writer),
          /accounting unavailable/u,
        );
      });
    },
  );
}

await test('pending storage envelopes preserve quotas and bound aggregate observation independently of history', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
      'hash_talk_test_storage_reservations_' +
      crypto.randomUUID().replaceAll('-', ''),
    administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    writer = new pg.Client({ connectionString: url.href }),
    reader = new pg.Client({
      connectionString: url.href,
      statement_timeout: 1000,
    });
  t.after(async () => {
    await writer.query('ROLLBACK');
    await Promise.all([db.close(), writer.end(), reader.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await Promise.all([writer.connect(), reader.connect()]);
  await storageReservationPredecessor(writer);
  const fixture = await seedStorageReservations(writer);
  const before = {
    global: (
      await writer.query('SELECT used_bytes FROM hash_talk.content_usage')
    ).rows,
    versions: (
      await writer.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows,
    sourceHashes: await reservationSourceHashes(writer),
  };
  await historicalMigrations(writer, [
    '077-storage-reservation-accounting.sql',
  ]);
  const context = { db, writer, reader, fixture, before };
  await verifyReads(t, context);
  await verifyStates(t, context);
  await verifyCoordination(t, context);
  await verifyFailures(t, context);
});
