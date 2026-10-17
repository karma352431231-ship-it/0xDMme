import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { AccountError } from '../../src/shared/account/index.ts';
import {
  contentSqlTransactionBytes,
  readStorageReservations,
} from '../../src/server/database/index.ts';
import {
  globalBytes,
  globalSourceSnapshot,
} from '../fixtures/global-usage-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import { runtimeVaultCommit } from '../fixtures/vault-allocation-database.ts';
import {
  expectNoAllocations,
  allocationPoolErrors,
} from '../fixtures/content-allocation-database.ts';
import {
  vaultLifecycleFixture,
  bindVaultMaintenance,
} from '../fixtures/vault-lifecycle-database.ts';
import type { VaultLifecycleFixture } from '../fixtures/vault-lifecycle-database.ts';
import { reverseMessageAllocations } from '../fixtures/message-allocation-reversal.ts';
import { reverseVaultLifecycle } from '../fixtures/vault-lifecycle-reversal.ts';

const full = 1_000_000_000_000n;
type RuntimeCommit = Awaited<ReturnType<typeof runtimeVaultCommit>>;
function pressure(error: unknown) {
  return error instanceof AccountError && error.status === 503;
}
async function legacyHeld(c: VaultLifecycleFixture, work: () => Promise<void>) {
  await c.writer.query('BEGIN');
  try {
    await c.writer.query('SELECT * FROM hash_talk.content_usage FOR UPDATE');
    await work();
  } finally {
    await c.writer.query('ROLLBACK');
    c.room.bytes = full;
  }
}
async function verifyCompletion(t: TestContext, c: VaultLifecycleFixture) {
  const initial = await runtimeVaultCommit(c);
  let previous: string | null = null;
  await t.test(
    'reserve, upload, completion and checkpoint upsert avoid an unrelated legacy lock, including storage pressure',
    async () => {
      await legacyHeld(c, async () => {
        for (const sequence of [1, 2]) {
          c.room.bytes = full;
          const commit = {
              ...initial.commit,
              id: crypto.randomUUID(),
              sequence,
              previous,
              block: {
                ...initial.commit.block,
                hash: crypto.randomUUID().replaceAll('-', '').repeat(2),
              },
            },
            hash = crypto.randomUUID().replaceAll('-', '').repeat(2);
          await c.db.vault.reserve(initial.session, commit, hash);
          const first = await c.db.vault.beginUpload(
            initial.session,
            commit,
            hash,
          );
          assert.ok(first);
          await c.db.vault.releaseUpload(commit.accountId, commit.id, first);
          const writer = await c.db.vault.beginUpload(
            initial.session,
            commit,
            hash,
          );
          assert.ok(writer);
          c.room.bytes = 0n;
          await assert.rejects(
            c.db.vault.finishUpload({
              session: initial.session,
              commit,
              hash,
              writer: first,
            }),
            { status: 409 },
          );
          await c.db.vault.finishUpload({
            session: initial.session,
            commit,
            hash,
            writer,
          });
          assert.equal(
            await c.db.vault.beginUpload(initial.session, commit, hash),
            null,
          );
          assert.deepEqual(
            await c.db.vault.object(
              initial.session,
              commit.directory,
              commit.id,
            ),
            commit,
          );
          const page = await c.db.vault.page(
            initial.session,
            commit.directory,
            0,
          );
          assert.equal(page.sequence, sequence);
          assert.equal(page.head, hash);
          previous = hash;
        }
      });
      await expectNoAllocations(c.inspector);
      assert.equal(await c.db.healthy(), true);
    },
  );
}
async function verifyDiscard(t: TestContext, c: VaultLifecycleFixture) {
  const input = await runtimeVaultCommit(c);
  await c.db.vault.reserve(input.session, input.commit, input.hash);
  await t.test(
    'failed discard retains its promise, stale writers cannot delete, and final discard progresses under pressure',
    async () => {
      const pending = await c.db.storageReservations.snapshot();
      await legacyHeld(c, async () => {
        c.room.bytes = 0n;
        const first = await c.db.vault.beginDiscard(
          input.session,
          input.commit.directory,
          input.commit.id,
        );
        assert.deepEqual(await c.db.storageReservations.snapshot(), pending);
        await c.db.vault.releaseDiscard(
          input.commit.accountId,
          input.commit.id,
          first.writer,
        );
        assert.deepEqual(await c.db.storageReservations.snapshot(), pending);
        const next = await c.db.vault.beginDiscard(
          input.session,
          input.commit.directory,
          input.commit.id,
        );
        await c.db.vault.finishDiscard(
          input.commit.accountId,
          input.commit.id,
          first.writer,
        );
        assert.deepEqual(await c.db.storageReservations.snapshot(), pending);
        await c.db.vault.finishDiscard(
          input.commit.accountId,
          input.commit.id,
          next.writer,
        );
        await c.db.vault.finishDiscard(
          input.commit.accountId,
          input.commit.id,
          next.writer,
        );
        assert.equal(
          (
            await c.inspector.query(
              'SELECT 1 FROM hash_talk.vault_operations WHERE id=$1',
              [input.commit.id],
            )
          ).rowCount,
          0,
        );
      });
      assert.equal(
        (await c.db.storageReservations.snapshot()).reservations,
        pending.reservations - 1,
      );
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'expiry claim, failure restoration and deletion preserve promises and progress independently',
    async () => {
      const expired = await runtimeVaultCommit(c);
      await c.db.vault.reserve(expired.session, expired.commit, expired.hash);
      await c.inspector.query(
        "UPDATE hash_talk.vault_operations SET reserved_at=now()-interval '25 hours' WHERE id=$1",
        [expired.commit.id],
      );
      const pending = await c.db.storageReservations.snapshot();
      await legacyHeld(c, async () => {
        c.room.bytes = 0n;
        assert.ok(
          (await c.db.vault.expiredReservations()).some(
            (row) => row.id === expired.commit.id,
          ),
        );
        const first = await c.db.vault.claimExpired(
          expired.commit.accountId,
          expired.commit.id,
        );
        assert.ok(first);
        assert.deepEqual(await c.db.storageReservations.snapshot(), pending);
        await c.db.vault.releaseDiscard(
          expired.commit.accountId,
          expired.commit.id,
          first.writer,
        );
        const next = await c.db.vault.claimExpired(
          expired.commit.accountId,
          expired.commit.id,
        );
        assert.ok(next);
        await c.db.vault.finishDiscard(
          expired.commit.accountId,
          expired.commit.id,
          next.writer,
        );
      });
      await expectNoAllocations(c.inspector);
    },
  );
}
async function writing(c: VaultLifecycleFixture) {
  const input = await runtimeVaultCommit(c);
  await c.db.vault.reserve(input.session, input.commit, input.hash);
  const writer = await c.db.vault.beginUpload(
    input.session,
    input.commit,
    input.hash,
  );
  assert.ok(writer);
  return { ...input, writer };
}
async function completeRow(c: VaultLifecycleFixture, input: RuntimeCommit) {
  await c.reader.query(
    "UPDATE hash_talk.vault_operations SET state='accepted',sequence=$2,writer=NULL WHERE id=$1",
    [input.commit.id, input.commit.sequence],
  );
}
async function writeHead(
  c: VaultLifecycleFixture,
  input: RuntimeCommit,
  hash = input.hash,
) {
  await c.reader.query(
    'INSERT INTO hash_talk.vault_heads(account_id,sequence,head) VALUES($1,$2,$3)',
    [input.commit.accountId, input.commit.sequence, hash],
  );
}
async function rawMaintenance(
  c: VaultLifecycleFixture,
  input: Awaited<ReturnType<typeof writing>>,
  work: () => Promise<void>,
  bytes = 64000,
) {
  await c.reader.query('BEGIN');
  try {
    await bindVaultMaintenance(c, {
      client: c.reader,
      account: input.commit.accountId,
      id: input.commit.id,
      writer: input.writer,
      kind: 'complete',
      bytes,
    });
    await work();
  } finally {
    await c.reader.query('ROLLBACK');
    await c.allocator.collect();
  }
}
async function verifyBoundaries(t: TestContext, c: VaultLifecycleFixture) {
  const input = await writing(c),
    before = await globalBytes(c.inspector);
  await t.test(
    'maintenance cannot increase charge, alter ciphertext or create a new payload promise',
    async () => {
      for (const change of ['charge=charge+1', "commit='{}'::jsonb"])
        await rawMaintenance(c, input, async () => {
          await assert.rejects(
            c.reader.query(
              "UPDATE hash_talk.vault_operations SET state='accepted',sequence=1,writer=NULL," +
                change +
                ' WHERE id=$1',
              [input.commit.id],
            ),
            { code: 'PCA01' },
          );
        });
      await rawMaintenance(c, input, async () => {
        await assert.rejects(
          c.reader.query(
            "INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state) VALUES($1,gen_random_uuid(),repeat('a',64),repeat('b',64),'{}',4125,'reserved')",
            [input.commit.accountId],
          ),
          { code: 'PCA01' },
        );
      });
    },
  );
  await t.test(
    'incorrect writer, unsupported source, missing checkpoint and exhausted envelope refuse atomically',
    async () => {
      await rawMaintenance(c, input, async () => {
        await c.reader.query(
          "SELECT set_config('hash_talk.content_writer',$1,true)",
          [crypto.randomUUID()],
        );
        await assert.rejects(completeRow(c, input), { code: 'PCA01' });
      });
      await rawMaintenance(c, input, async () => {
        await assert.rejects(
          c.reader.query(
            'UPDATE hash_talk.accounts SET profile_ciphertext=profile_ciphertext WHERE id=$1',
            [input.commit.accountId],
          ),
          { code: 'PCA01' },
        );
      });
      await rawMaintenance(c, input, async () => {
        await completeRow(c, input);
        await assert.rejects(
          c.reader.query(
            'SELECT hash_talk.assert_vault_maintenance_complete()',
          ),
          { code: 'PCA01' },
        );
      });
      await rawMaintenance(
        c,
        input,
        async () => {
          await assert.rejects(completeRow(c, input), { code: 'PCA01' });
        },
        100,
      );
    },
  );
  await t.test(
    'wrong checkpoint is rejected; savepoint rollback restores the operation and its envelope',
    async () => {
      await rawMaintenance(c, input, async () => {
        await completeRow(c, input);
        await assert.rejects(writeHead(c, input, 'f'.repeat(64)), {
          code: 'PCA01',
        });
      });
      await rawMaintenance(c, input, async () => {
        await c.reader.query('SAVEPOINT checkpoint');
        await completeRow(c, input);
        await writeHead(c, input);
        await c.reader.query('ROLLBACK TO checkpoint');
        await completeRow(c, input);
        await writeHead(c, input);
        await c.reader.query(
          'SELECT hash_talk.assert_vault_maintenance_complete()',
        );
      });
      assert.equal(await globalBytes(c.inspector), before);
      assert.equal(
        (
          await c.inspector.query<{ state: string }>(
            'SELECT state FROM hash_talk.vault_operations WHERE id=$1',
            [input.commit.id],
          )
        ).rows[0]?.state,
        'writing',
      );
      await expectNoAllocations(c.inspector);
    },
  );
  await t.test(
    'ordinary application permissions suffice for scoped completion and checkpoint validation',
    async () => {
      const role =
        'synthetic_allocator_' + crypto.randomUUID().replaceAll('-', '');
      await c.inspector
        .query(`CREATE ROLE "${role}" NOLOGIN;GRANT USAGE ON SCHEMA hash_talk TO "${role}";
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA hash_talk TO "${role}";
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA hash_talk TO "${role}"`);
      try {
        await rawMaintenance(c, input, async () => {
          await c.reader.query(`SET LOCAL ROLE "${role}"`);
          assert.equal(
            (
              await c.reader.query<{ current_user: string }>(
                'SELECT current_user',
              )
            ).rows[0]?.current_user,
            role,
          );
          await completeRow(c, input);
          await writeHead(c, input);
          await c.reader.query(
            'SELECT hash_talk.assert_vault_maintenance_complete()',
          );
        });
      } finally {
        await c.inspector.query(`DROP OWNED BY "${role}";DROP ROLE "${role}"`);
      }
    },
  );
}
async function verifyUnavailableLedger(
  t: TestContext,
  c: VaultLifecycleFixture,
) {
  const input = await writing(c);
  await t.test(
    'missing global accounting rolls scoped completion and its checkpoint back before acknowledgement',
    async () => {
      const ledger = (
        await c.inspector.query<{ used_bytes: string }>(
          'SELECT used_bytes::text FROM hash_talk.content_usage_legacy WHERE singleton',
        )
      ).rows[0];
      assert.ok(ledger);
      await c.inspector.query('DELETE FROM hash_talk.content_usage_legacy');
      try {
        await assert.rejects(
          c.db.vault.finishUpload({
            session: input.session,
            commit: input.commit,
            hash: input.hash,
            writer: input.writer,
          }),
        );
      } finally {
        await c.inspector.query(
          'INSERT INTO hash_talk.content_usage_legacy(singleton,used_bytes) VALUES(true,$1)',
          [ledger.used_bytes],
        );
      }
      assert.equal(
        (
          await c.inspector.query<{ state: string }>(
            'SELECT state FROM hash_talk.vault_operations WHERE id=$1',
            [input.commit.id],
          )
        ).rows[0]?.state,
        'writing',
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT 1 FROM hash_talk.vault_heads WHERE account_id=$1',
            [input.commit.accountId],
          )
        ).rowCount,
        0,
      );
      await expectNoAllocations(c.inspector);
    },
  );
}
async function verifyBudgets(t: TestContext, c: VaultLifecycleFixture) {
  await t.test(
    'maintenance uses existing connection SQL room without charging it again against new payload grants',
    async () => {
      await Promise.all([c.writer.query('BEGIN'), c.reader.query('BEGIN')]);
      try {
        await c.reader.query('SELECT pg_current_xact_id()');
        const headroom = await c.capacity.allocationHeadroom(c.reader);
        c.room.bytes -= headroom - 250000n;
        await c.allocator.reserve(c.writer, 1_000_000, 'vault-maintain');
        await c.allocator.reserve(c.reader, 10000, 'vault-reserve');
      } finally {
        await Promise.all([
          c.writer.query('ROLLBACK'),
          c.reader.query('ROLLBACK'),
        ]);
        c.room.bytes = full;
        await c.allocator.collect();
      }
    },
  );
  await t.test(
    'the operating envelope is bounded per live owner by the existing 64 MiB SQL allowance',
    async () => {
      await c.reader.query('BEGIN');
      try {
        c.room.bytes = 0n;
        await assert.rejects(
          c.allocator.reserve(
            c.reader,
            contentSqlTransactionBytes + 1,
            'vault-maintain',
          ),
          pressure,
        );
        const grant = await c.allocator.reserve(
          c.reader,
          contentSqlTransactionBytes,
          'vault-maintain',
        );
        assert.equal(grant.bytes, 67108864);
      } finally {
        await c.reader.query('ROLLBACK');
        c.room.bytes = full;
        await c.allocator.collect();
      }
    },
  );
}
async function verifyRecovery(t: TestContext, c: VaultLifecycleFixture) {
  await t.test(
    'startup recovers more than 256 interrupted operations while preserving accepted data and exact promises',
    async () => {
      const tag = crypto.randomUUID();
      const rows = (
        await c.inspector.query<{ id: string }>(
          `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,writer,sequence)
      SELECT $1,gen_random_uuid(),repeat(md5($2||i::text),2),repeat(md5('object'||$2||i::text),2),'{}',4125,
      CASE WHEN i=321 THEN 'accepted' WHEN i%2=0 THEN 'writing' ELSE 'discarding' END,
      CASE WHEN i<321 THEN gen_random_uuid() ELSE NULL END,CASE WHEN i=321 THEN 99999 ELSE NULL END
      FROM generate_series(1,321) i RETURNING id`,
          [c.fixture.first, tag],
        )
      ).rows;
      const before = await c.db.storageReservations.snapshot(),
        total = await globalBytes(c.inspector),
        accepted = (
          await c.inspector.query(
            "SELECT md5(string_agg(o::text,'|' ORDER BY account_id,id)) FROM hash_talk.vault_operations o WHERE state='accepted'",
          )
        ).rows;
      try {
        await legacyHeld(c, async () => {
          c.room.bytes = 0n;
          await c.db.vault.resumeInterrupted();
          await c.db.vault.resumeInterrupted();
        });
        assert.equal(
          (
            await c.inspector.query(
              "SELECT 1 FROM hash_talk.vault_operations WHERE state IN ('writing','discarding')",
            )
          ).rowCount,
          0,
        );
        assert.deepEqual(
          (
            await c.inspector.query(
              "SELECT md5(string_agg(o::text,'|' ORDER BY account_id,id)) FROM hash_talk.vault_operations o WHERE state='accepted'",
            )
          ).rows,
          accepted,
        );
        assert.deepEqual(await c.db.storageReservations.snapshot(), before);
        assert.equal(await globalBytes(c.inspector), total);
      } finally {
        await c.inspector.query(
          'DELETE FROM hash_talk.vault_operations WHERE id=ANY($1::uuid[])',
          [rows.map((row) => row.id)],
        );
      }
      await assertStorageReconciled(c.inspector, c.fixture.accounts);
    },
  );
}
async function verifyFinalizationFault(
  t: TestContext,
  c: VaultLifecycleFixture,
) {
  const input = await writing(c);
  await t.test(
    'post-commit maintenance finalization failure retains its token and never loses the accepted checkpoint',
    async () => {
      await c.inspector
        .query(`CREATE FUNCTION hash_talk.test_maintenance_guard_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN DELETE FROM hash_talk.content_allocation_guard;RETURN NULL;END;$$;
      CREATE TRIGGER test_maintenance_guard_failure AFTER UPDATE ON hash_talk.vault_operations FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.test_maintenance_guard_failure()`);
      try {
        await c.db.vault.finishUpload({
          session: input.session,
          commit: input.commit,
          hash: input.hash,
          writer: input.writer,
        });
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
            await c.inspector.query<{ head: string }>(
              'SELECT head FROM hash_talk.vault_heads WHERE account_id=$1',
              [input.commit.accountId],
            )
          ).rows[0]?.head,
          input.hash,
        );
      } finally {
        await c.inspector
          .query(`DROP TRIGGER test_maintenance_guard_failure ON hash_talk.vault_operations;
        DROP FUNCTION hash_talk.test_maintenance_guard_failure();INSERT INTO hash_talk.content_allocation_guard VALUES(true) ON CONFLICT DO NOTHING`);
        await c.allocator.collect();
      }
      await expectNoAllocations(c.inspector);
    },
  );
}
await test('vault lifecycle adoption preserves completion, physical promises, recovery and legacy coexistence', async (t) => {
  const c = await vaultLifecycleFixture(t);
  await t.test(
    'populated 078 to 079 migration changes only derived discarding promises and preserves every source, quota, total and old catalog',
    async () => {
      assert.deepEqual(
        await globalSourceSnapshot(c.inspector, c.upgrade.sources),
        c.upgrade.rows,
      );
      assert.equal(await globalBytes(c.inspector), c.upgrade.total);
      assert.deepEqual(
        (
          await c.inspector.query(
            'SELECT * FROM hash_talk.schema_migrations WHERE version<=78 ORDER BY version',
          )
        ).rows,
        c.upgrade.catalog,
      );
      const pending = await c.db.storageReservations.snapshot();
      assert.equal(
        pending.reservedBytes,
        c.upgrade.pending.reservedBytes + c.upgrade.discarded.charge,
      );
      assert.equal(pending.reservations, c.upgrade.pending.reservations + 1);
      await assertStorageReconciled(c.inspector, c.fixture.accounts);
    },
  );
  await t.test(
    'maintenance reversal preserves source rows and restores predecessor physical accounting',
    async () => {
      const before = await globalSourceSnapshot(c.inspector, c.upgrade.sources);
      await c.inspector.query('BEGIN');
      try {
        await c.inspector.query(
          'LOCK TABLE hash_talk.vault_operations,hash_talk.vault_heads IN ACCESS EXCLUSIVE MODE',
        );
        await reverseMessageAllocations(c.inspector, c.message);
        await reverseVaultLifecycle(c.inspector, c.lifecycle);
        assert.deepEqual(
          await globalSourceSnapshot(c.inspector, c.upgrade.sources),
          before,
        );
        assert.equal(await globalBytes(c.inspector), c.upgrade.total);
        assert.deepEqual(
          await readStorageReservations(c.inspector),
          c.upgrade.pending,
        );
        await assertStorageReconciled(c.inspector, c.fixture.accounts);
      } finally {
        await c.inspector.query('ROLLBACK');
      }
      await c.db.verifyMigrations();
    },
  );
  await verifyCompletion(t, c);
  await verifyDiscard(t, c);
  await verifyBoundaries(t, c);
  await verifyUnavailableLedger(t, c);
  await verifyBudgets(t, c);
  await verifyRecovery(t, c);
  await verifyFinalizationFault(t, c);
  assert.deepEqual(allocationPoolErrors, []);
});
