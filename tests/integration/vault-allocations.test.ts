import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { assertContentCapacity } from '../../src/server/database/content-capacity.ts';
import { ContentAllocator } from '../../src/server/database/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import {
  expectNoAllocations,
  allocationPoolErrors,
  allocationPool,
  allocationWriter,
} from '../fixtures/content-allocation-database.ts';
import { rehearseAllocationReversal } from '../fixtures/vault-allocation-reversal.ts';
import {
  vaultAllocationFixture,
  bindVaultAllocation,
  insertVaultReservation,
  runtimeVaultCommit,
} from '../fixtures/vault-allocation-database.ts';
import type { VaultAllocationFixture } from '../fixtures/vault-allocation-database.ts';

function pressure(error: unknown) {
  return error instanceof AccountError && error.status === 503;
}
async function owners(c: VaultAllocationFixture, work: () => Promise<void>) {
  await Promise.all([c.writer.query('BEGIN'), c.reader.query('BEGIN')]);
  try {
    await work();
  } finally {
    await Promise.all([c.writer.query('ROLLBACK'), c.reader.query('ROLLBACK')]);
    await c.allocator.collect();
    await expectNoAllocations(c.inspector);
    const components = await c.inspector.query<{ bytes: string }>(
      'SELECT coalesce(sum(abs(used_bytes)),0)::text AS bytes FROM hash_talk.content_usage_partitions',
    );
    assert.equal(
      components.rows[0]?.bytes,
      '0',
      'Completed idle slots must shed historical traffic.',
    );
    c.room.bytes = 1_000_000_000_000n;
  }
}
async function remove(c: VaultAllocationFixture, ids: string[]) {
  await c.inspector.query(
    'DELETE FROM hash_talk.vault_operations WHERE id=ANY($1::uuid[])',
    [ids],
  );
  await assertStorageReconciled(c.inspector, c.fixture.accounts);
}
async function verifyIndependentWrites(
  t: TestContext,
  c: VaultAllocationFixture,
) {
  await t.test(
    'a granted vault reservation commits while the unrelated legacy ledger is locked',
    async () => {
      const before = await globalBytes(c.inspector),
        ids: string[] = [];
      try {
        await owners(c, async () => {
          await c.writer.query(
            'SELECT * FROM hash_talk.content_usage FOR UPDATE',
          );
          const input = await bindVaultAllocation(c, { client: c.reader });
          ids.push(input.id);
          await insertVaultReservation(c.reader, input);
          await assertContentCapacity(c.reader, c.capacity);
          await c.reader.query('COMMIT');
          assert.equal(await globalBytes(c.inspector), before + 4125n);
          await assertStorageReconciled(c.inspector, c.fixture.accounts);
        });
      } finally {
        await remove(c, ids);
      }
      assert.equal(await globalBytes(c.inspector), before);
    },
  );
  await t.test(
    'different owners keep independent ledger slots while both transactions are open',
    async () => {
      const ids: string[] = [];
      try {
        await owners(c, async () => {
          const inputs = await Promise.all([
            bindVaultAllocation(c, {
              client: c.writer,
              id: '10000000-0000-4000-8000-000000000001',
            }),
            bindVaultAllocation(c, {
              client: c.reader,
              account: c.fixture.second,
              id: '20000000-0000-4000-8000-000000000002',
            }),
          ]);
          ids.push(...inputs.map((i) => i.id));
          await Promise.all([
            insertVaultReservation(c.writer, inputs[0]),
            insertVaultReservation(c.reader, inputs[1]),
          ]);
          const slots = await Promise.all(
            [c.writer, c.reader].map(
              async (client) =>
                (
                  await client.query<{ slot: string }>(
                    "SELECT current_setting('hash_talk.content_partition') AS slot",
                  )
                ).rows[0]!.slot,
            ),
          );
          assert.notEqual(slots[0], slots[1]);
          await Promise.all([
            c.writer.query('COMMIT'),
            c.reader.query('COMMIT'),
          ]);
        });
      } finally {
        await remove(c, ids);
      }
    },
  );
  await t.test(
    'exhausted unlocked slots grow transactionally instead of refusing another writer',
    async () => {
      const before = (
        await c.inspector.query<{ n: number }>(
          'SELECT count(*)::integer AS n FROM hash_talk.content_usage_partitions',
        )
      ).rows[0]!.n;
      await owners(c, async () => {
        await c.reader.query(
          'SELECT * FROM hash_talk.content_usage_partitions FOR UPDATE',
        );
        await insertVaultReservation(
          c.writer,
          await bindVaultAllocation(c, { client: c.writer }),
        );
        assert.equal(
          (
            await c.writer.query<{ n: number }>(
              'SELECT count(*)::integer AS n FROM hash_talk.content_usage_partitions',
            )
          ).rows[0]?.n,
          before + 1,
        );
      });
      assert.equal(
        (
          await c.inspector.query<{ n: number }>(
            'SELECT count(*)::integer AS n FROM hash_talk.content_usage_partitions',
          )
        ).rows[0]?.n,
        before,
      );
    },
  );
}
async function verifyScope(t: TestContext, c: VaultAllocationFixture) {
  const invalid = [
    { name: 'undersized pre-write envelope', bytes: 100 },
    { name: 'another account', account: c.fixture.second },
    { name: 'another operation', id: crypto.randomUUID() },
  ];
  for (const scenario of invalid)
    await t.test(
      'rejects ' + scenario.name + ' before source/counter changes',
      async () => {
        const before = await globalBytes(c.inspector);
        await owners(c, async () => {
          const input = await bindVaultAllocation(c, {
            client: c.writer,
            bytes: scenario.bytes ?? 50_000,
          });
          await assert.rejects(
            insertVaultReservation(c.writer, { ...input, ...scenario }),
            { code: 'PCA01' },
          );
        });
        assert.equal(await globalBytes(c.inspector), before);
      },
    );
  await t.test(
    'a credit cannot authorize another source or a second source mutation',
    async () => {
      await owners(c, async () => {
        await bindVaultAllocation(c, { client: c.writer });
        await assert.rejects(
          c.writer.query(
            'UPDATE hash_talk.accounts SET profile_ciphertext=profile_ciphertext WHERE id=$1',
            [c.fixture.first],
          ),
          { code: 'PCA01' },
        );
      });
      await owners(c, async () => {
        const input = await bindVaultAllocation(c, { client: c.writer });
        await insertVaultReservation(c.writer, input);
        await assert.rejects(insertVaultReservation(c.writer, input), {
          code: 'PCA01',
        });
      });
    },
  );
  await t.test(
    'prepared-only grants and stale transaction bindings cannot skip the legacy guard',
    async () => {
      await owners(c, async () => {
        const grant = await c.allocator.reserve(c.writer, 50000);
        await c.writer.query(
          "SELECT set_config('hash_talk.content_allocation',$1,true)",
          [grant.transactionId],
        );
        await assert.rejects(
          c.writer.query('SELECT hash_talk.guard_content_usage()'),
          { code: 'PCA01' },
        );
      });
      await owners(c, async () => {
        const input = await bindVaultAllocation(c, { client: c.writer });
        await c.reader.query(
          "SELECT set_config('hash_talk.content_allocation',$1,true)",
          [input.grant.transactionId],
        );
        await assert.rejects(
          c.reader.query('SELECT hash_talk.guard_content_usage()'),
          { code: 'PCA01' },
        );
      });
    },
  );
  await t.test(
    'savepoint rollback restores consumed credit and every derived delta',
    async () => {
      const before = await globalBytes(c.inspector),
        ids: string[] = [];
      try {
        await owners(c, async () => {
          const input = await bindVaultAllocation(c, { client: c.writer });
          ids.push(input.id);
          await c.writer.query('SAVEPOINT source_write');
          await insertVaultReservation(c.writer, input);
          await c.writer.query('ROLLBACK TO source_write');
          await insertVaultReservation(c.writer, input);
          await c.writer.query('COMMIT');
        });
        assert.equal(await globalBytes(c.inspector), before + 4125n);
      } finally {
        await remove(c, ids);
      }
    },
  );
}
async function verifyHybridAdmission(
  t: TestContext,
  c: VaultAllocationFixture,
) {
  await t.test(
    'legacy admission subtracts a live credit whose source row is still uncommitted',
    async () => {
      // Reservation counters use the UUID's first byte. These independent
      // transactions need distinct buckets so source-row admission can proceed.
      await owners(c, async () => {
        await insertVaultReservation(
          c.writer,
          await bindVaultAllocation(c, {
            client: c.writer,
            id: '0a' + crypto.randomUUID().slice(2),
          }),
        );
        await insertVaultReservation(c.reader, {
          account: c.fixture.second,
          id: '0b' + crypto.randomUUID().slice(2),
        });
        c.room.bytes -=
          (await c.capacity.allocationHeadroom(c.reader)) - 10000n;
        await assert.rejects(
          assertContentCapacity(c.reader, c.capacity),
          pressure,
        );
      });
    },
  );
  await t.test(
    'a legacy final assertion retains the grant guard until its commit is visible',
    async () => {
      const id = crypto.randomUUID();
      try {
        await owners(c, async () => {
          await insertVaultReservation(c.reader, {
            account: c.fixture.second,
            id,
          });
          await assertContentCapacity(c.reader, c.capacity);
          // The committed database can shrink during background maintenance.
          // Zero measured room keeps pressure deterministic across that commit;
          // the contender must still wait for the legacy guard before refusing.
          c.room.bytes = 0n;
          await assert.rejects(
            c.allocator.reserve(c.writer, 50000, 'vault-reserve'),
            { code: '55P03' },
          );
          await c.reader.query('COMMIT');
          await assert.rejects(
            c.allocator.reserve(c.writer, 50000, 'vault-reserve'),
            pressure,
          );
        });
      } finally {
        await remove(c, [id]);
      }
    },
  );
  await t.test(
    'legacy cleanup of a credited record permits signed components while preserving the exact nonnegative total',
    async () => {
      const before = await globalBytes(c.inspector),
        charge = 3_000_000,
        ids: string[] = [];
      try {
        await owners(c, async () => {
          await c.reader.query(
            'SELECT * FROM hash_talk.content_usage FOR UPDATE',
          );
          const input = await bindVaultAllocation(c, {
            client: c.writer,
            bytes: charge + 50000,
          });
          ids.push(input.id);
          await insertVaultReservation(c.writer, { ...input, charge });
          await c.writer.query('COMMIT');
          await c.reader.query(
            'DELETE FROM hash_talk.vault_operations WHERE id=$1',
            [input.id],
          );
          assert.ok(
            BigInt(
              (
                await c.reader.query<{ n: string }>(
                  'SELECT used_bytes::text AS n FROM hash_talk.content_usage_legacy',
                )
              ).rows[0]!.n,
            ) < 0n,
          );
          assert.equal(await globalBytes(c.reader), before);
          await c.reader.query('COMMIT');
        });
        await remove(c, ids);
        assert.equal(await globalBytes(c.inspector), before);
      } finally {
        await remove(c, ids);
      }
    },
  );
  await t.test(
    'cleanup uses its own deltas despite a concurrent credited increase in global usage',
    async () => {
      const old = crypto.randomUUID(),
        ids: string[] = [old];
      await insertVaultReservation(c.inspector, {
        account: c.fixture.first,
        id: old,
      });
      try {
        await owners(c, async () => {
          await c.reader.query(
            'DELETE FROM hash_talk.vault_operations WHERE id=$1',
            [old],
          );
          const input = await bindVaultAllocation(c, {
            client: c.writer,
            account: c.fixture.second,
            bytes: 200000,
          });
          ids.push(input.id);
          await insertVaultReservation(c.writer, { ...input, charge: 100000 });
          await c.writer.query('COMMIT');
          c.room.bytes = 0n;
          await assertContentCapacity(c.reader, c.capacity);
          await c.reader.query('COMMIT');
        });
      } finally {
        await remove(c, ids);
      }
    },
  );
}
async function verifyPermissions(t: TestContext, c: VaultAllocationFixture) {
  await t.test(
    'ordinary role can grant, consume and finalize a scoped reservation without superuser privileges',
    async () => {
      const role =
        'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      await c.inspector.query(`CREATE ROLE "${role}" NOLOGIN;
      GRANT USAGE ON SCHEMA hash_talk TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`);
      const pool = allocationPool(c.url, role),
        writer = allocationWriter(c.url, role),
        allocator = new ContentAllocator(pool, (client) =>
          c.capacity.allocationHeadroom(client),
        );
      await writer.connect();
      try {
        assert.equal(
          (await writer.query<{ current_user: string }>('SELECT current_user'))
            .rows[0]?.current_user,
          role,
        );
        await writer.query('BEGIN');
        const grant = await allocator.reserve(writer, 50000, 'vault-reserve'),
          id = crypto.randomUUID();
        await writer.query(
          `SELECT set_config('hash_talk.content_allocation',$1,true),
        set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)`,
          [grant.transactionId, c.fixture.first, id],
        );
        await insertVaultReservation(writer, { account: c.fixture.first, id });
        await assertContentCapacity(writer, c.capacity);
        await writer.query('ROLLBACK');
        assert.equal(await allocator.finish(grant), true);
      } finally {
        await writer.query('ROLLBACK');
        await writer.end();
        await pool.end();
        await c.allocator.collect();
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
      await expectNoAllocations(c.inspector);
    },
  );
}
async function verifyRuntime(t: TestContext, c: VaultAllocationFixture) {
  const input = await runtimeVaultCommit(c);
  await t.test(
    'volume-mode VaultStore authorizes and commits without the unrelated legacy lock',
    async () => {
      await c.writer.query('BEGIN');
      try {
        await c.writer.query(
          'SELECT * FROM hash_talk.content_usage FOR UPDATE',
        );
        assert.deepEqual(
          await c.db.vault.reserve(input.session, input.commit, input.hash),
          { status: 'reserved' },
        );
      } finally {
        await c.writer.query('ROLLBACK');
      }
      await expectNoAllocations(c.inspector);
      assert.equal(await c.db.healthy(), true);
    },
  );
  await t.test(
    'idempotent retry needs no new credit under physical pressure',
    async () => {
      c.room.bytes = 0n;
      try {
        assert.deepEqual(
          await c.db.vault.reserve(input.session, input.commit, input.hash),
          { status: 'reserved' },
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
      }
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'physical refusal and authorization failure preserve the source and grant ledger',
    async () => {
      const before = await globalBytes(c.inspector),
        commit = { ...input.commit, id: crypto.randomUUID() };
      c.room.bytes = 0n;
      try {
        await assert.rejects(
          c.db.vault.reserve(input.session, commit, input.hash),
          pressure,
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
      }
      await assert.rejects(
        c.db.vault.reserve(
          { ...input.session, csrf: crypto.randomUUID() },
          commit,
          input.hash,
        ),
        { status: 403 },
      );
      assert.equal(await globalBytes(c.inspector), before);
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'post-commit finalization failure retains the promise, preserves accepted data and fails health',
    async () => {
      const commit = {
        ...input.commit,
        id: crypto.randomUUID(),
        block: {
          ...input.commit.block,
          hash: crypto.randomUUID().replaceAll('-', '').repeat(2),
        },
      };
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.test_remove_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN DELETE FROM hash_talk.content_allocation_guard;RETURN NULL;END;$$;
      CREATE TRIGGER test_remove_allocation_guard AFTER INSERT ON hash_talk.vault_operations
      FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.test_remove_allocation_guard()`);
      try {
        assert.deepEqual(
          await c.db.vault.reserve(input.session, commit, commit.block.hash),
          { status: 'reserved' },
        );
        assert.equal(await c.db.healthy(), false);
        assert.equal(
          (
            await c.inspector.query<{ n: number }>(
              'SELECT count(*)::integer AS n FROM hash_talk.content_allocations',
            )
          ).rows[0]?.n,
          1,
        );
        assert.equal(
          (
            await c.inspector.query<{ state: string }>(
              'SELECT state FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2',
              [commit.accountId, commit.id],
            )
          ).rows[0]?.state,
          'reserved',
        );
      } finally {
        await c.inspector
          .query(`DROP TRIGGER test_remove_allocation_guard ON hash_talk.vault_operations;
        DROP FUNCTION hash_talk.test_remove_allocation_guard();
        INSERT INTO hash_talk.content_allocation_guard VALUES(true) ON CONFLICT DO NOTHING`);
        await c.allocator.collect();
      }
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('vault allocation adoption preserves global, owner and physical admission contracts', async (t) => {
  const c = await vaultAllocationFixture(t);
  await t.test(
    'populated 077 to 078 migration preserves every source fingerprint, total, quota and old catalog',
    async () => {
      assert.deepEqual(c.vaultUpgrade.sources, c.before.sources);
      assert.deepEqual(c.vaultUpgrade.total, c.before.total);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT * FROM hash_talk.schema_migrations WHERE version<=80 ORDER BY version',
          )
        ).rows,
        c.before.catalog,
      );
      await c.db.verifyMigrations();
      await c.db.migrate();
      await assertStorageReconciled(c.inspector, c.fixture.accounts);
    },
  );
  await verifyIndependentWrites(t, c);
  await verifyScope(t, c);
  await verifyHybridAdmission(t, c);
  await verifyPermissions(t, c);
  await t.test(
    'maintenance reversal folds exact signed partitions without losing source rows or subsequent legacy writes',
    async () => {
      await c.writer.query('BEGIN');
      const input = await bindVaultAllocation(c, { client: c.writer });
      try {
        await insertVaultReservation(c.writer, input);
        await c.writer.query('COMMIT');
        assert.equal(await c.allocator.finish(input.grant), true);
        await rehearseAllocationReversal({
          client: c.inspector,
          sources: c.sources,
          predecessor: c.predecessor,
          lifecycle: c.lifecycle,
          message: c.message,
        });
      } finally {
        await c.writer.query('ROLLBACK');
        await remove(c, [input.id]);
        await c.allocator.collect();
      }
      await c.db.verifyMigrations();
      await assertStorageReconciled(c.inspector, c.fixture.accounts);
    },
  );
  await verifyRuntime(t, c);
  assert.deepEqual(allocationPoolErrors, []);
});
