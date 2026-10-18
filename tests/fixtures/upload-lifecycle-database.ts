import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { messageReceiptFixture } from './message-receipt-database.ts';
import { messagePair } from './message-allocation-database.ts';
import { assertStorageReconciled } from './storage-reservation-database.ts';
import { assertAttachmentReconciled } from './attachment-quota-database.ts';
import { assertGroupReconciled } from './group-quota-database.ts';
import { globalBytes, globalSourceSnapshot } from './global-usage-database.ts';
import { expectNoAllocations } from './content-allocation-database.ts';
import { waitForBlocked } from '../integration/contact-concurrency-fixture.ts';

export type UploadDomain = 'private' | 'social';
export async function uploadLifecycleFixture(
  t: TestContext,
  domain: UploadDomain,
) {
  const c = await messageReceiptFixture(t),
    pair = await messagePair(c);
  const accounts = [
    pair.sender.session.accountId,
    pair.recipient.session.accountId,
  ];
  const profiles = [crypto.randomUUID(), crypto.randomUUID()];
  await c.inspector.query(
    `INSERT INTO hash_talk.public_profiles(id,account_id,handle)
    VALUES($1,$2,$3),($4,$5,$6)`,
    [
      profiles[0],
      accounts[0],
      'life_' + profiles[0]!.slice(0, 8),
      profiles[1],
      accounts[1],
      'life_' + profiles[1]!.slice(0, 8),
    ],
  );
  await c.inspector.query(
    `INSERT INTO hash_talk.social_relations(lo,hi,requester,state,revision)
    VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved',1)`,
    profiles,
  );
  const source = domain === 'private' ? 'message_attachments' : 'social_media';
  const store = domain === 'private' ? c.db.attachments : c.db.socialMedia;
  const authority = pair.sender;
  const peer = domain === 'private' ? accounts[1]! : profiles[1]!;
  const ledgerSources = (
    await c.inspector.query<{ name: string }>(`SELECT DISTINCT c.relname AS name
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY c.relname`)
  ).rows;
  async function reconcile() {
    await assertStorageReconciled(c.inspector, accounts);
    await assertAttachmentReconciled(c.inspector, accounts);
    await assertGroupReconciled(c.inspector);
    const totals = await globalSourceSnapshot(c.inspector, ledgerSources);
    assert.equal(
      await globalBytes(c.inspector),
      totals.reduce((sum, row) => sum + BigInt(row.bytes), 0n),
    );
    await expectNoAllocations(c.inspector);
  }
  const rows = async () =>
    (
      await c.inspector.query<{ body: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS body FROM hash_talk.${source} t ORDER BY id`,
      )
    ).rows;
  return {
    ...c,
    pair,
    accounts,
    profiles,
    domain,
    source,
    store,
    authority,
    peer,
    reconcile,
    rows,
  };
}
export type UploadLifecycleFixture = Awaited<
  ReturnType<typeof uploadLifecycleFixture>
>;
export function uploadRequest(c: UploadLifecycleFixture) {
  const ref = {
    id: crypto.randomUUID(),
    hash: '1'.repeat(64),
    bytes: 37,
    parts: [{ hash: '1'.repeat(64), bytes: 37 }],
  };
  return {
    message: crypto.randomUUID(),
    peer: c.peer,
    refs: [ref],
    ...(c.domain === 'social' ? { media: 'photo' as const } : {}),
  };
}
export async function refusedAfterWait(
  c: UploadLifecycleFixture,
  input: {
    run: () => Promise<unknown>;
    sql: string;
    values: string[];
    status: number;
  },
) {
  await c.writer.query('BEGIN');
  let pending: Promise<unknown> | undefined;
  try {
    const holder = (
      await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    ).rows[0]!.pid;
    await c.writer.query(
      "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))",
    );
    await c.writer.query(input.sql, input.values);
    pending = input.run();
    void pending.catch(() => undefined);
    await waitForBlocked(c.reader, holder);
    await c.writer.query('COMMIT');
    await assert.rejects(pending, { status: input.status });
  } finally {
    await c.writer.query('ROLLBACK');
    await pending?.catch(() => undefined);
  }
}
