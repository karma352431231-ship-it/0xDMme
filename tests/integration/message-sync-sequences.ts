import assert from 'node:assert/strict';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  admissionPacket,
  messagePair,
} from '../fixtures/message-allocation-database.ts';
import { lockContactAdmission } from '../../src/server/database/contact-admission.ts';
import { messageItems } from '../../src/client/messages/history.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';
const hash = 'a'.repeat(64);

export async function verifyReaderFirst(
  c: MessageReceiptFixture,
): Promise<void> {
  const pair = await messagePair(c),
    packet = admissionPacket(pair);
  const reader = await c.pool.connect();
  let writing: Promise<unknown> | undefined;
  try {
    await reader.query('BEGIN');
    await lockContactAdmission(reader, {
      actor: packet.recipient,
      access: 'read',
    });
    const holder = Number(
      (await reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid,
    );
    const cut = await c.db.messages.syncState(pair.recipient, null);
    writing = c.db.messages.admit(pair.sender, packet, hash);
    void writing.catch(() => undefined);
    await waitForBlocked(c.inspector, holder);
    assert.equal(
      (
        await c.inspector.query(
          'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
          [packet.id],
        )
      ).rowCount,
      0,
    );
    await reader.query('COMMIT');
    await writing;
    const next = await c.db.messages.syncState(pair.recipient, cut);
    assert.ok(next.anchor > cut.anchor);
    assert.deepEqual(
      messageItems(
        await c.db.messages.page(pair.recipient, { snapshot: cut, after: 0 }),
      ).items,
      [],
    );
    assert.equal(
      messageItems(
        await c.db.messages.page(pair.recipient, {
          snapshot: next,
          after: cut.anchor,
        }),
      ).items[0]!.id,
      packet.id,
    );
  } finally {
    await reader.query('ROLLBACK');
    reader.release();
    await writing?.catch(() => undefined);
  }
}

export async function verifyRollbackGap(
  c: MessageReceiptFixture,
): Promise<void> {
  const pair = await messagePair(c),
    rejected = admissionPacket(pair),
    accepted = admissionPacket(pair);
  const cut = await c.db.messages.syncState(pair.recipient, null);
  await c.inspector.query(
    `CREATE FUNCTION hash_talk.reject_sync_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=TG_ARGV[0]::uuid THEN RAISE EXCEPTION 'Synthetic admission rollback'; END IF; RETURN NEW; END $$`,
  );
  await c.inspector.query(
    `CREATE TRIGGER reject_sync_fixture AFTER INSERT ON hash_talk.message_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.reject_sync_fixture('${rejected.id}')`,
  );
  try {
    await assert.rejects(
      c.db.messages.admit(pair.sender, rejected, hash),
      /Synthetic admission rollback/,
    );
    const rolled = (
      await c.inspector.query<{ last_value: string }>(
        "SELECT last_value::text FROM pg_sequences WHERE schemaname='hash_talk' AND sequencename=split_part(pg_get_serial_sequence('hash_talk.message_packets','sequence'),'.',2)",
      )
    ).rows[0]!.last_value;
    await c.db.messages.admit(pair.sender, accepted, hash);
    const sequence = (
      await c.inspector.query<{ sequence: string }>(
        'SELECT sequence::text FROM hash_talk.message_packets WHERE id=$1',
        [accepted.id],
      )
    ).rows[0]!.sequence;
    assert.ok(Number(sequence) > Number(rolled));
    const pid = () =>
      c.db.contacts.withMessageRead(
        pair.recipient,
        async (client) =>
          (
            await client.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            )
          ).rows[0]!.pid,
      );
    assert.equal(
      await pid(),
      await pid(),
      'sequential account reads reuse the pooled connection safely',
    );
    const next = await c.db.messages.syncState(pair.recipient, cut);
    const page = messageItems(
      await c.db.messages.page(pair.recipient, {
        snapshot: next,
        after: cut.anchor,
      }),
    );
    assert.deepEqual(
      page.items.map((row) => row.id),
      [accepted.id],
    );
    assert.equal(page.next, null);
  } finally {
    await c.inspector.query(
      'DROP TRIGGER reject_sync_fixture ON hash_talk.message_packets',
    );
    await c.inspector.query('DROP FUNCTION hash_talk.reject_sync_fixture()');
  }
}
