import {
  verifyReaderFirst,
  verifyRollbackGap,
} from './message-sync-sequences.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import type { TestContext } from 'node:test';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  admissionPacket,
  messagePair,
  messageUser,
} from '../fixtures/message-allocation-database.ts';
import type { MessageUser } from '../fixtures/message-allocation-database.ts';
import { proof } from '../fixtures/message-removal-database.ts';
import { messageItems } from '../../src/client/messages/history.ts';
import { recordMessageChanges } from '../../src/server/database/message-changes.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';
const hash = 'a'.repeat(64);

async function journalBoundaries(t: TestContext, c: MessageReceiptFixture) {
  const pair = await messagePair(c),
    packet = admissionPacket(pair);
  await c.db.messages.admit(pair.sender, packet, hash);
  for (const revisions of [255, 256, 257])
    await t.test(
      `${revisions} retained revisions are independent from distinct IDs`,
      async () => {
        const from = await c.db.messages.syncState(pair.recipient, null);
        await c.db.contacts.withMessageAuthority(
          pair.recipient,
          async (client) => {
            for (let n = 0; n < revisions; n++)
              await recordMessageChanges(
                client,
                [packet.recipient],
                [packet.id],
              );
          },
        );
        const next = await c.db.messages.syncState(pair.recipient, from);
        assert.equal(next.source, revisions <= 256 ? 'journal' : 'tail');
        assert.equal(next.revision - from.revision, revisions);
        if (next.source === 'journal') {
          const changes = await c.db.messages.changes(pair.recipient, {
            from,
            snapshot: next,
          });
          assert.equal(changes.reset, false);
          assert.equal(changes.items!.length, 1);
        }
      },
    );
  const packets = Array.from({ length: 257 }, () => admissionPacket(pair));
  for (const row of packets) await c.db.messages.admit(pair.sender, row, hash);
  for (const count of [255, 256, 257])
    await t.test(
      `${count} distinct IDs respect complete-revision response cuts`,
      async () => {
        const from = await c.db.messages.syncState(pair.recipient, null);
        await c.db.contacts.withMessageAuthority(
          pair.recipient,
          async (client) => {
            for (let n = 0; n < count; n += 65)
              await recordMessageChanges(
                client,
                [packet.recipient],
                packets.slice(n, Math.min(count, n + 65)).map((row) => row.id),
              );
          },
        );
        const next = await c.db.messages.syncState(pair.recipient, from);
        assert.equal(next.source, 'journal');
        const changes = await c.db.messages.changes(pair.recipient, {
          from,
          snapshot: next,
        });
        assert.equal(changes.reset, false);
        assert.ok(changes.items!.length <= 256);
        assert.equal(changes.items!.length, count > 256 ? 195 : count);
        const final = await c.db.messages.syncState(pair.recipient, next);
        const rest = await c.db.messages.changes(pair.recipient, {
          from: next,
          snapshot: final,
        });
        assert.equal(
          new Set(
            [...changes.items!, ...rest.items!].map((row) => String(row['id'])),
          ).size,
          count,
        );
      },
    );
}

async function recoveryCauses(t: TestContext, c: MessageReceiptFixture) {
  const pair = await messagePair(c),
    packet = admissionPacket(pair);
  await c.db.messages.admit(pair.sender, packet, hash);
  for (const kind of ['gap', 'legacy', 'reset'] as const)
    await t.test(
      'explicit ' +
        kind +
        ' recovery keeps unknown destructive metadata conservative',
      async () => {
        const from = await c.db.messages.syncState(pair.recipient, null);
        await c.db.contacts.withMessageAuthority(
          pair.recipient,
          async (client) => {
            for (let n = 0; n < 3; n++)
              await recordMessageChanges(
                client,
                [packet.recipient],
                kind === 'reset' ? null : [packet.id],
              );
          },
        );
        if (kind === 'gap')
          await c.inspector.query(
            'DELETE FROM hash_talk.message_changes WHERE account_id=$1 AND revision=$2',
            [packet.recipient, from.revision + 2],
          );
        if (kind === 'legacy')
          await c.inspector.query(
            "UPDATE hash_talk.message_changes SET change_kind='legacy' WHERE account_id=$1 AND revision=$2",
            [packet.recipient, from.revision + 1],
          );
        const next = await c.db.messages.syncState(pair.recipient, from);
        assert.equal(next.recovery, kind);
        assert.equal(next.source, kind === 'gap' ? 'tail' : 'full');
      },
    );
}

async function fanIn(t: TestContext, contacts: number) {
  const c = await messageReceiptFixture(t),
    recipient = await messageUser(c);
  const senders: MessageUser[] = [];
  for (let n = 0; n < contacts; n++) {
    const sender = await messageUser(c);
    senders.push(sender);
    await c.inspector.query(
      "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
      [sender.session.accountId, recipient.session.accountId],
    );
  }
  const accepted: string[] = [];
  async function arrive(count: number) {
    for (let n = 0; n < count; n++) {
      const sender = senders[accepted.length % contacts]!;
      const packet = admissionPacket({ sender, recipient });
      await c.db.messages.admit(sender, packet, hash);
      accepted.push(packet.id);
    }
  }
  await arrive(257); // Offline receiver already exceeds retained revisions.
  const first = await c.db.messages.syncState(recipient, null);
  let from = first,
    target = first,
    after = 0,
    completions = 0,
    fullRecoveries = 1;
  const seen = new Set<string>(),
    latencies: number[] = [];
  for (let turn = 0; turn < 120; turn++) {
    const began = performance.now();
    const page = messageItems(
      await c.db.messages.page(recipient, { snapshot: target, after }),
    );
    await arrive(17); // Live production remains active between read and confirm.
    await c.db.messages.confirmSnapshot(recipient, target);
    latencies.push(performance.now() - began);
    for (const row of page.items) {
      assert.equal(seen.has(row.id), false);
      seen.add(row.id);
    }
    after = nextAfter(page, after);
    if (page.next !== null) continue;
    completions++;
    from = target;
    assert.ok(
      accepted.length > seen.size,
      'producer still has later messages when this cut completes',
    );
    assert.equal(seen.size, accepted.indexOf(page.items.at(-1)?.id ?? '') + 1);
    target = await c.db.messages.syncState(recipient, from);
    if (target.source === 'full') fullRecoveries++;
    assert.equal(
      target.source,
      'tail',
      'expired append journal must recover after the confirmed anchor',
    );
    after = from.anchor;
  }
  assert.ok(accepted.length > 2000);
  assert.ok(completions >= 2);
  assert.equal(fullRecoveries, 1);
  assert.equal(from.invalidation, 0);
  t.diagnostic(
    JSON.stringify({
      contacts,
      accepted: accepted.length,
      confirmed: seen.size,
      completions,
      fullRecoveries,
      pageWith17AdmissionsMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      },
    }),
  );
}
function percentile(rows: number[], p: number): number {
  return [...rows].sort((a, b) => a - b)[Math.floor(rows.length * p)]!;
}

async function concurrentSequences(t: TestContext, c: MessageReceiptFixture) {
  const pair = await messagePair(c),
    other = await messagePair(c),
    second = await messageUser(c);
  await c.inspector.query(
    "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
    [second.session.accountId, pair.recipient.session.accountId],
  );
  const lower = admissionPacket(pair),
    later = admissionPacket({ sender: second, recipient: pair.recipient });
  await c.inspector.query(
    `CREATE FUNCTION hash_talk.pause_sync_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=TG_ARGV[0]::uuid THEN PERFORM pg_advisory_xact_lock(773391); END IF; RETURN NEW; END $$`,
  );
  await c.inspector.query(
    `CREATE TRIGGER pause_sync_fixture AFTER INSERT ON hash_talk.message_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.pause_sync_fixture('${lower.id}')`,
  );
  await c.writer.query('SELECT pg_advisory_lock(773391)');
  const holder = Number(
    (await c.writer.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
      .rows[0]!.pid,
  );
  const writing = c.db.messages.admit(pair.sender, lower, hash);
  void writing.catch(() => undefined);
  let reading: ReturnType<typeof c.db.messages.syncState> | undefined;
  let writingLater: Promise<unknown> | undefined;
  try {
    await waitForBlocked(c.inspector, holder);
    const owner = (
      await c.inspector.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE application_name='hash-talk' AND $1=ANY(pg_blocking_pids(pid))",
        [holder],
      )
    ).rows[0]!.pid;
    reading = c.db.messages.syncState(pair.recipient, null);
    void reading.catch(() => undefined);
    writingLater = c.db.messages.admit(second, later, hash);
    void writingLater.catch(() => undefined);
    await waitForBlocked(c.inspector, owner);
    const foreign = admissionPacket(other);
    await c.db.messages.admit(other.sender, foreign, hash);
    assert.equal(
      (
        await c.inspector.query(
          'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
          [later.id],
        )
      ).rowCount,
      0,
    );
    await c.writer.query('SELECT pg_advisory_unlock(773391)');
    await writing;
    const cut = await reading;
    await writingLater;
    const sequences = (
      await c.inspector.query<{ id: string; sequence: string }>(
        'SELECT id,sequence::text FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) ORDER BY sequence',
        [[lower.id, foreign.id, later.id]],
      )
    ).rows;
    assert.deepEqual(
      sequences.map((row) => row.id),
      [lower.id, foreign.id, later.id],
    );
    const page = messageItems(
      await c.db.messages.page(pair.recipient, { snapshot: cut, after: 0 }),
    );
    assert.ok(page.items.some((row) => row.id === lower.id));
    assert.ok(page.items.every((row) => row.sequence <= cut.anchor));
    assert.equal(
      (
        await c.inspector.query<{ seqcache: string }>(
          "SELECT seqcache::text FROM pg_sequence WHERE seqrelid=pg_get_serial_sequence('hash_talk.message_packets','sequence')::regclass",
        )
      ).rows[0]!.seqcache,
      '1',
    );
    t.diagnostic(
      'Actual admissions allocate identity only after ordered participant locks; reader waits for pending recipient write.',
    );
  } finally {
    await c.writer.query('SELECT pg_advisory_unlock_all()');
    await Promise.allSettled([writing, reading, writingLater]);
    await c.inspector.query(
      'DROP TRIGGER pause_sync_fixture ON hash_talk.message_packets',
    );
    await c.inspector.query('DROP FUNCTION hash_talk.pause_sync_fixture()');
  }
}

await test('incremental journal boundaries, security fences and concurrent sequence contract', async (t) => {
  const c = await messageReceiptFixture(t);
  await journalBoundaries(t, c);
  await recoveryCauses(t, c);
  await t.test(
    'reader-first account cut excludes a later admission before identity allocation',
    () => verifyReaderFirst(c),
  );
  await t.test(
    'rolled-back sequence gaps and pooled connection reuse cannot skip a committed packet',
    () => verifyRollbackGap(c),
  );
  await t.test(
    'pending transactions cannot publish smaller sequences after an acknowledged cut',
    () => concurrentSequences(t, c),
  );
  await t.test(
    'known limitation: destructive changes with expired coverage can keep reconciliation closed',
    async () => {
      const pair = await messagePair(c),
        roots: MessagePacket[] = [];
      for (let n = 0; n < 40; n++) {
        const packet = admissionPacket(pair);
        await c.db.messages.admit(pair.sender, packet, hash);
        roots.push(packet);
      }
      let target = await c.db.messages.syncState(pair.recipient, null),
        restarts = 0;
      const first = messageItems(
        await c.db.messages.page(pair.recipient, {
          snapshot: target,
          after: 0,
        }),
      );
      assert.equal(first.items.length, 16);
      assert.notEqual(first.next, null);
      for (let epoch = 0; epoch < 5; epoch++) {
        const root = roots[epoch]!;
        const edit = {
          ...admissionPacket(pair),
          relation: {
            id: root.id,
            hash,
            author: root.sender,
            type: 'edit' as const,
          },
        };
        await c.db.messages.admit(pair.sender, edit, hash);
        await c.db.messages.remove(pair.sender, root.id, hash, {
          ...proof(pair.sender),
          signature: Buffer.alloc(64, 1).toString('base64'),
        });
        await c.db.contacts.withMessageAuthority(
          pair.recipient,
          async (client) => {
            for (let n = 0; n < 257; n++)
              await recordMessageChanges(
                client,
                [root.recipient],
                [roots.at(-1)!.id],
              );
          },
        );
        await assert.rejects(
          c.db.messages.confirmSnapshot(pair.recipient, target),
          { status: 409 },
        );
        target = await c.db.messages.syncState(pair.recipient, target);
        assert.equal(target.source, 'full');
        restarts++;
        const page = messageItems(
          await c.db.messages.page(pair.recipient, {
            snapshot: target,
            after: 0,
          }),
        );
        assert.ok(
          page.items
            .filter((row) =>
              roots.slice(0, epoch + 1).some((root) => root.id === row.id),
            )
            .every((row) => row.deleted),
        );
        // Writer is still active: no invalidated baseline is considered displayed.
        assert.ok(page.next !== null);
      }
      t.diagnostic(
        JSON.stringify({
          destructiveCoverageExpired: true,
          recoveryRestarts: restarts,
          publicationBlocked: true,
          livenessGuaranteed: false,
        }),
      );
    },
  );
  await t.test(
    'arrival preserves cuts; edits follow later cuts; deletion and contact/device changes reject old cuts',
    async () => {
      const pair = await messagePair(c),
        root = admissionPacket(pair);
      await c.db.messages.admit(pair.sender, root, hash);
      const frozen = await c.db.messages.syncState(pair.recipient, null),
        legacy = await c.db.messages.snapshot(pair.recipient);
      const edit = {
        ...admissionPacket(pair),
        relation: {
          id: root.id,
          hash,
          author: root.sender,
          type: 'edit' as const,
        },
      };
      await c.db.messages.admit(pair.sender, edit, hash);
      await assert.rejects(
        c.db.messages.page(pair.recipient, { snapshot: legacy, after: 0 }),
        { status: 409 },
      );
      await c.db.messages.confirmSnapshot(pair.recipient, frozen);
      assert.equal(
        messageItems(
          await c.db.messages.page(pair.recipient, {
            snapshot: frozen,
            after: 0,
          }),
        ).items.length,
        1,
      );
      assert.equal(
        messageItems(
          await c.db.messages.relations(pair.recipient, [root.id], frozen),
          48,
        ).items.length,
        0,
      );
      await assert.rejects(
        c.db.messages.object(pair.recipient, edit.id, frozen),
        { status: 404 },
      );
      await assert.rejects(
        c.db.messages.acknowledge(pair.recipient, edit.id, hash, frozen),
        { status: 404 },
      );
      await c.db.messages.remove(
        pair.sender,
        root.id,
        hash,
        proof(pair.sender),
      );
      await assert.rejects(
        c.db.messages.confirmSnapshot(pair.recipient, frozen),
        { status: 409 },
      );
      const recovered = await c.db.messages.syncState(pair.recipient, frozen);
      assert.ok(recovered.invalidation > frozen.invalidation);
      const removed = await c.db.messages.changes(pair.recipient, {
        from: frozen,
        snapshot: recovered,
      });
      assert.ok(removed.items!.every((row) => row['deleted'] === true));
      const foreign = await messageUser(c);
      await assert.rejects(
        c.db.messages.page(foreign, { snapshot: recovered, after: 0 }),
        { status: 409 },
      );
      await c.inspector.query(
        "UPDATE hash_talk.device_directories SET head=repeat('f',64) WHERE account_id=$1",
        [pair.recipient.session.accountId],
      );
      await assert.rejects(
        c.db.messages.confirmSnapshot(pair.recipient, recovered),
        { status: 409 },
      );
    },
  );
});
for (const contacts of [30, 50])
  await test(`${contacts} contacts continuously append to one account beyond journal retention`, (t) =>
    fanIn(t, contacts));

function nextAfter(
  page: ReturnType<typeof messageItems>,
  previous: number,
): number {
  return page.next ?? page.items.at(-1)?.sequence ?? previous;
}
