import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  vaultUsage,
  assertVaultQuota,
} from '../../src/server/database/vault-quota.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import { referenceVaultUsage } from '../fixtures/vault-usage-reference.ts';
import {
  attachmentQuotaPredecessor,
  seedAttachmentQuota,
  assertAttachmentReconciled,
  insertAttachment,
  removeAttachmentMessage,
} from '../fixtures/attachment-quota-database.ts';

interface AttachmentContext {
  db: Database;
  writer: pg.Client;
  reader: pg.Client;
  observer: pg.Client;
  fixture: Awaited<ReturnType<typeof seedAttachmentQuota>>;
  globalRows: unknown[];
  versionRows: unknown[];
}

async function rolledBack(client: pg.Client, work: () => Promise<void>) {
  await client.query('BEGIN');
  try {
    await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function verifyReads(t: TestContext, context: AttachmentContext) {
  const { db, writer, reader, fixture, globalRows, versionRows } = context;
  await t.test(
    'populated upgrade preserves charges, direct counters, global bytes and migration records',
    async () => {
      await assertAttachmentReconciled(writer, fixture.accounts);
      assert.deepEqual(
        (await writer.query('SELECT used_bytes FROM hash_talk.content_usage'))
          .rows,
        globalRows,
      );
      assert.deepEqual(
        (
          await writer.query(
            'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations WHERE version<=75 ORDER BY version',
          )
        ).rows,
        versionRows,
      );
      assert.equal(await vaultUsage(writer, fixture.third), 0);
      await db.migrate();
      await db.verifyMigrations();
    },
  );
  await t.test(
    'quota reads no longer touch attachments or personal-removal history',
    async () => {
      const expected = await vaultUsage(writer, fixture.first);
      await rolledBack(writer, async () => {
        await writer.query(
          'LOCK TABLE hash_talk.message_attachments,hash_talk.personal_removals,hash_talk.vault_operations IN ACCESS EXCLUSIVE MODE',
        );
        assert.equal(await vaultUsage(reader, fixture.first), expected);
        await assert.rejects(
          referenceVaultUsage(reader, fixture.first),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '57014',
        );
      });
    },
  );
}

async function verifyMutations(t: TestContext, context: AttachmentContext) {
  const { writer, fixture } = context;
  await t.test(
    'all attachment statuses remain charged; only collection releases physical bytes',
    async () => {
      await rolledBack(writer, async () => {
        const initial = await vaultUsage(writer, fixture.first),
          global = (
            await writer.query('SELECT used_bytes FROM hash_talk.content_usage')
          ).rows;
        for (const status of ['writing', 'ready', 'accepted', 'deleting']) {
          await writer.query(
            "UPDATE hash_talk.message_attachments SET status=$2,writer=CASE WHEN $2='writing' THEN gen_random_uuid() ELSE NULL END WHERE message_id=$1",
            [fixture.message, status],
          );
          assert.equal(await vaultUsage(writer, fixture.first), initial);
          await assertAttachmentReconciled(writer, fixture.accounts);
        }
        assert.deepEqual(
          (await writer.query('SELECT used_bytes FROM hash_talk.content_usage'))
            .rows,
          global,
        );
        await writer.query(
          'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
          [fixture.message],
        );
        assert.equal(await vaultUsage(writer, fixture.first), initial - 3072);
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'charge, participant and message changes reconcile old and new owners',
    async () => {
      await rolledBack(writer, async () => {
        await writer.query(
          'UPDATE hash_talk.message_attachments SET charge=charge+64 WHERE message_id=$1',
          [fixture.message],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          'UPDATE hash_talk.message_attachments SET recipient=$2,message_id=$3 WHERE message_id=$1',
          [fixture.message, fixture.third, fixture.packet],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          'UPDATE hash_talk.message_attachments SET sender=recipient,recipient=sender WHERE id=ANY($1::uuid[])',
          [fixture.attachments],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'removal insertion, deletion, account, kind and target changes preserve exclusions and retained bytes',
    async () => {
      await rolledBack(writer, async () => {
        await removeAttachmentMessage(writer, {
          account: fixture.second,
          message: fixture.packet,
        });
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          "UPDATE hash_talk.personal_removals SET id=$2,account_id=$3,retained_bytes=128,charge=640 WHERE account_id=$1 AND kind='message'",
          [fixture.second, fixture.message, fixture.third],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          "UPDATE hash_talk.personal_removals SET kind='vault' WHERE account_id=$1",
          [fixture.first],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          "UPDATE hash_talk.personal_removals SET kind='message',id=$2 WHERE account_id=$1",
          [fixture.first, fixture.message],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query('DELETE FROM hash_talk.personal_removals');
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'both participants can remove an attachment before collection without changing global ownership',
    async () => {
      await rolledBack(writer, async () => {
        const initial = await vaultUsage(writer, fixture.first);
        await removeAttachmentMessage(writer, {
          account: fixture.first,
          message: fixture.message,
        });
        assert.equal(
          await vaultUsage(writer, fixture.first),
          initial - 3072 + 512,
        );
        await removeAttachmentMessage(writer, {
          account: fixture.second,
          message: fixture.message,
        });
        const global = (
          await writer.query('SELECT used_bytes FROM hash_talk.content_usage')
        ).rows;
        await writer.query(
          "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1",
          [fixture.message],
        );
        assert.deepEqual(
          (await writer.query('SELECT used_bytes FROM hash_talk.content_usage'))
            .rows,
          global,
        );
        await writer.query(
          'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
          [fixture.message],
        );
        assert.equal(
          await vaultUsage(writer, fixture.first),
          initial - 3072 + 512,
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
}

async function verifyCombinedStatements(
  t: TestContext,
  context: AttachmentContext,
) {
  const { writer, fixture } = context;
  await t.test(
    'one writable CTE changing both sources reconciles each message once',
    async () => {
      await rolledBack(writer, async () => {
        const message = crypto.randomUUID();
        await writer.query(
          `WITH attachment AS (
        INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge)
        VALUES(gen_random_uuid(),$1,$2,$3,'{}',512,1024) RETURNING id)
        INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,charge)
        VALUES($2,'message',$1,repeat('b',64),'{}',512)`,
          [message, fixture.first, fixture.second],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await writer.query(
          `WITH removal AS (DELETE FROM hash_talk.personal_removals WHERE account_id=$2 AND kind='message' AND id=$1 RETURNING id)
        UPDATE hash_talk.message_attachments SET charge=charge+128 WHERE message_id=$1`,
          [message, fixture.first],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
        await removeAttachmentMessage(writer, {
          account: fixture.second,
          message,
        });
        await writer.query(
          `WITH removal AS (DELETE FROM hash_talk.personal_removals WHERE account_id=$2 AND kind='message' AND id=$1 RETURNING id)
        DELETE FROM hash_talk.message_attachments WHERE message_id=$1`,
          [message, fixture.second],
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'net-zero multi-row charge changes do not write derived state',
    async () => {
      await rolledBack(writer, async () => {
        const initial = (
          await writer.query(
            'SELECT message_id,account_id,used_bytes,xmin::text FROM hash_talk.attachment_quota_messages ORDER BY message_id,account_id',
          )
        ).rows;
        await writer.query(
          'UPDATE hash_talk.message_attachments SET charge=charge+CASE WHEN id=$2 THEN 1 ELSE -1 END WHERE message_id=$1',
          [fixture.message, fixture.attachments[0]],
        );
        assert.deepEqual(
          (
            await writer.query(
              'SELECT message_id,account_id,used_bytes,xmin::text FROM hash_talk.attachment_quota_messages ORDER BY message_id,account_id',
            )
          ).rows,
          initial,
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
}

async function awaitLedgerWait(observer: pg.Client, pid: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ waiting: boolean }>(
      "SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",
      [pid],
    );
    if (result.rows[0]?.waiting) return;
    await delay(10);
  }
  throw new Error('The second source mutation did not wait on the ledger.');
}

async function raceSources(context: AttachmentContext, removalFirst: boolean) {
  const { writer, reader, observer, fixture } = context,
    message = crypto.randomUUID(),
    attachment = () =>
      insertAttachment(writer, {
        message,
        sender: fixture.first,
        recipient: fixture.second,
      }),
    removal = () =>
      removeAttachmentMessage(writer, { message, account: fixture.first });
  await writer.query('BEGIN');
  let pending: Promise<void> | undefined;
  try {
    await (removalFirst ? removal() : attachment());
    const pid = (
      await reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    ).rows[0]!.pid;
    pending = removalFirst
      ? insertAttachment(reader, {
          message,
          sender: fixture.first,
          recipient: fixture.second,
        })
      : removeAttachmentMessage(reader, { message, account: fixture.first });
    // Own a possible rejection immediately while the observer establishes the interleaving.
    void pending.catch(() => undefined);
    await awaitLedgerWait(observer, pid);
    await writer.query('COMMIT');
    await pending;
    await assertAttachmentReconciled(writer, fixture.accounts);
  } finally {
    await writer.query('ROLLBACK');
    await pending?.catch(() => undefined);
    await writer.query(
      'DELETE FROM hash_talk.message_attachments WHERE message_id=$1',
      [message],
    );
    await writer.query(
      "DELETE FROM hash_talk.personal_removals WHERE kind='message' AND id=$1",
      [message],
    );
  }
}

async function verifyConcurrency(t: TestContext, context: AttachmentContext) {
  const { writer, reader, fixture } = context;
  await t.test(
    'attachment admission sees a removal committed while waiting on the ledger',
    () => raceSources(context, true),
  );
  await t.test(
    'personal removal sees an attachment committed while waiting on the ledger',
    () => raceSources(context, false),
  );
  await t.test(
    'owner-only changes acquire the ledger; unchanged quota and pending-write envelopes hold no derived/global locks',
    async () => {
      await rolledBack(writer, async () => {
        await writer.query(
          'UPDATE hash_talk.message_attachments SET recipient=$2 WHERE message_id=$1',
          [fixture.message, fixture.third],
        );
        await assert.rejects(
          reader.query(
            'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
          ),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '55P03',
        );
      });
      await rolledBack(writer, async () => {
        const versions = (
          await writer.query(
            'SELECT account_id,used_bytes,xmin::text FROM hash_talk.attachment_quota_usage ORDER BY account_id',
          )
        ).rows;
        await writer.query(
          "UPDATE hash_talk.message_attachments SET status='ready',received='{0}' WHERE message_id=$1",
          [fixture.message],
        );
        await reader.query(
          'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE NOWAIT',
        );
        await reader.query(
          'SELECT used_bytes FROM hash_talk.attachment_quota_usage FOR UPDATE NOWAIT',
        );
        assert.deepEqual(
          (
            await writer.query(
              'SELECT account_id,used_bytes,xmin::text FROM hash_talk.attachment_quota_usage ORDER BY account_id',
            )
          ).rows,
          versions,
        );
      });
    },
  );
}

async function verifyBoundaries(t: TestContext, context: AttachmentContext) {
  const { writer, fixture } = context;
  await t.test(
    'attachment charges participate in quota refusal and roll back with the source',
    async () => {
      const initial = await vaultUsage(writer, fixture.second);
      await rolledBack(writer, async () => {
        await writer.query(
          'UPDATE hash_talk.message_attachments SET charge=1000000000 WHERE id=$1',
          [fixture.attachments[0]],
        );
        await assert.rejects(
          assertVaultQuota(writer, fixture.second),
          (error: unknown) =>
            error instanceof AccountError && error.status === 413,
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
      assert.equal(await vaultUsage(writer, fixture.second), initial);
    },
  );
  await t.test(
    'missing attachment totals fail closed for reads and mutations',
    async () => {
      await rolledBack(writer, async () => {
        await writer.query(
          'DELETE FROM hash_talk.attachment_quota_usage WHERE account_id=$1',
          [fixture.first],
        );
        await assert.rejects(
          vaultUsage(writer, fixture.first),
          /Quota unavailable/u,
        );
        await assert.rejects(
          writer.query(
            'UPDATE hash_talk.message_attachments SET charge=charge+1 WHERE message_id=$1',
            [fixture.message],
          ),
          /attachment_quota|Attachment quota/u,
        );
      });
      await assertAttachmentReconciled(writer, fixture.accounts);
    },
  );
  await t.test(
    'fresh accounts initialize zero totals and cascades remove only derived state',
    async () => {
      await rolledBack(writer, async () => {
        const account = crypto.randomUUID();
        await writer.query(
          "INSERT INTO hash_talk.accounts(id,address) VALUES($1::uuid,'0x'||substr(replace($1::text,'-','')||repeat('0',40),1,40))",
          [account],
        );
        assert.equal(await vaultUsage(writer, account), 0);
        await removeAttachmentMessage(writer, {
          message: fixture.message,
          account,
        });
        await writer.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
          account,
        ]);
        assert.equal(await vaultUsage(writer, account), 0);
        assert.equal(
          (
            await writer.query(
              'SELECT account_id FROM hash_talk.attachment_quota_usage WHERE account_id=$1',
              [account],
            )
          ).rowCount,
          0,
        );
        await assertAttachmentReconciled(writer, fixture.accounts);
      });
    },
  );
  await t.test(
    'cross-table mutations refuse stale isolation snapshots atomically',
    async () => {
      for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
        await writer.query('BEGIN ISOLATION LEVEL ' + isolation);
        try {
          await assert.rejects(
            writer.query(
              'UPDATE hash_talk.message_attachments SET charge=charge+1 WHERE message_id=$1',
              [fixture.message],
            ),
            /require READ COMMITTED/u,
          );
        } finally {
          await writer.query('ROLLBACK');
        }
      }
      await assertAttachmentReconciled(writer, fixture.accounts);
    },
  );
}

await test('incremental attachment quotas preserve cross-table visibility and charged bytes', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
      'hash_talk_test_attachment_quota_' +
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
    }),
    observer = new pg.Client({ connectionString: url.href });
  t.after(async () => {
    await writer.query('ROLLBACK');
    await Promise.all([db.close(), writer.end(), reader.end(), observer.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await Promise.all([writer.connect(), reader.connect(), observer.connect()]);
  await attachmentQuotaPredecessor(writer);
  const fixture = await seedAttachmentQuota(writer),
    globalRows = (
      await writer.query('SELECT used_bytes FROM hash_talk.content_usage')
    ).rows,
    versionRows = (
      await writer.query(
        'SELECT version,checksum,applied_at FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows;
  await db.migrate();
  const context = {
    db,
    writer,
    reader,
    observer,
    fixture,
    globalRows,
    versionRows,
  };
  await verifyReads(t, context);
  await verifyMutations(t, context);
  await verifyCombinedStatements(t, context);
  await verifyConcurrency(t, context);
  await verifyBoundaries(t, context);
});
