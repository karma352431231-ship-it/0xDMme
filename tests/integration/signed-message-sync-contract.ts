import assert from 'node:assert/strict';
import type pg from 'pg';
import { waitForBlocked } from './contact-concurrency-fixture.ts';
import { verifyDeletion } from '../../src/client/messages/history.ts';
import type { DirectoryEvent } from '../../src/shared/devices/index.ts';
import type { TestContext } from 'node:test';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import type { MessageRelation } from '../../src/shared/daily/index.ts';
import { messageItems } from '../../src/client/messages/history.ts';
import { syncSnapshot } from '../../src/shared/message-sync/index.ts';
import { digest } from '../../src/shared/devices/index.ts';

interface SyncUser {
  events: DirectoryEvent[];
  session: { accountId: string; deviceId: string };
}
export async function signedMessageSyncContract<U extends SyncUser>(
  t: TestContext,
  p: {
    inspector: pg.Client;
    create: () => Promise<U>;
    approve: (sender: U, recipient: U) => Promise<void>;
    make: (
      sender: U,
      recipient: U,
    ) => Promise<
      (text: string, relation?: MessageRelation) => Promise<MessagePacket>
    >;
    op: (
      user: U,
      operation: string,
      payload?: Record<string, unknown>,
    ) => Promise<unknown>;
    block: (recipient: U, sender: U) => Promise<unknown>;
  },
): Promise<void> {
  await t.test(
    'signed encrypted admission reproduces legacy 409 while finite cuts finish under continuing arrival',
    async () => {
      const sender = await p.create(),
        recipient = await p.create();
      await p.approve(sender, recipient);
      const make = await p.make(sender, recipient),
        accepted: MessagePacket[] = [];
      async function send(text: string, relation?: MessageRelation) {
        const packet = await make(text, relation);
        await p.op(sender, 'publish', { packet });
        accepted.push(packet);
        return packet;
      }
      for (let n = 0; n < 33; n++)
        await send('Synthetic continuous message ' + n);
      const pendingPacket = await make('Signed pending transaction');
      await signedPendingSequence(p, {
        sender,
        recipient,
        packet: pendingPacket,
      });
      accepted.push(pendingPacket);
      const legacy = await p.op(recipient, 'snapshot'),
        cut = syncSnapshot(await p.op(recipient, 'sync-state', { from: null }));
      const seen: string[] = [];
      let after = 0;
      for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
        const page = messageItems(
          await p.op(recipient, 'page', { snapshot: cut, after }),
        );
        await send('Arrival during page ' + pageNumber);
        await p.op(recipient, 'confirm', { snapshot: cut });
        seen.push(...page.items.map((row) => row.id));
        after = page.next ?? after;
        if (page.next === null) break;
      }
      assert.deepEqual(
        seen,
        accepted.slice(0, 34).map((row) => row.id),
      );
      assert.ok(accepted.length > seen.length);
      await assert.rejects(
        p.op(recipient, 'page', { snapshot: legacy, after: 0 }),
        { status: 409 },
      );
      const future = accepted.at(-1)!;
      await assert.rejects(
        p.op(recipient, 'object', { snapshot: cut, id: future.id }),
        { status: 404 },
      );
      await assert.rejects(
        p.op(recipient, 'backup-ack', {
          snapshot: cut,
          items: [
            { id: future.id, hash: await digest(JSON.stringify(future)) },
          ],
        }),
        { status: 404 },
      );
      const next = syncSnapshot(
        await p.op(recipient, 'sync-state', { from: cut }),
      );
      const delta = messageItems(
        await p.op(recipient, 'changes', { from: cut, snapshot: next }),
        256,
      );
      assert.deepEqual(
        delta.items.map((row) => row.id),
        accepted.slice(34).map((row) => row.id),
      );
      const root = accepted[0]!,
        hash = await digest(JSON.stringify(root));
      const edit = await send('Edited while the conversation is closed', {
        id: root.id,
        hash,
        author: root.sender,
        type: 'edit',
      });
      const edited = syncSnapshot(
        await p.op(recipient, 'sync-state', { from: next }),
      );
      assert.ok(
        messageItems(
          await p.op(recipient, 'changes', { from: next, snapshot: edited }),
          256,
        ).items.some((row) => row.id === edit.id),
      );
      await p.op(sender, 'delete', { id: root.id, hash, revision: 1 });
      await assert.rejects(p.op(recipient, 'confirm', { snapshot: edited }), {
        status: 409,
      });
      const removed = syncSnapshot(
        await p.op(recipient, 'sync-state', { from: edited }),
      );
      const tombstones = messageItems(
        await p.op(recipient, 'changes', { from: edited, snapshot: removed }),
        256,
      ).items;
      assert.deepEqual(
        new Set(tombstones.map((row) => row.id)),
        new Set([root.id, edit.id]),
      );
      assert.ok(tombstones.every((row) => row.deleted));
      for (const row of tombstones) await verifyDeletion(row, sender.events);
      await assert.rejects(
        p.op(recipient, 'object', { id: root.id, snapshot: removed }),
        { status: 410 },
      );
      await p.block(recipient, sender);
      await assert.rejects(p.op(recipient, 'confirm', { snapshot: removed }), {
        status: 409,
      });
      const foreign = await p.create();
      await assert.rejects(
        p.op(foreign, 'page', { snapshot: removed, after: 0 }),
        { status: 409 },
      );
    },
  );
}

async function signedPendingSequence<U extends SyncUser>(
  p: {
    inspector: pg.Client;
    op: (
      user: U,
      operation: string,
      payload?: Record<string, unknown>,
    ) => Promise<unknown>;
  },
  input: { sender: U; recipient: U; packet: MessagePacket },
): Promise<void> {
  const c = p.inspector;
  await c.query(
    `CREATE FUNCTION hash_talk.pause_signed_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=TG_ARGV[0]::uuid THEN PERFORM pg_advisory_xact_lock(773392); END IF; RETURN NEW; END $$`,
  );
  await c.query(
    `CREATE TRIGGER pause_signed_sync AFTER INSERT ON hash_talk.message_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.pause_signed_sync('${input.packet.id}')`,
  );
  await c.query('SELECT pg_advisory_lock(773392)');
  const holder = Number(
    (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
      .pid,
  );
  const writing = p.op(input.sender, 'publish', { packet: input.packet });
  void writing.catch(() => undefined);
  let reading: Promise<unknown> | undefined;
  try {
    await waitForBlocked(c, holder);
    const owner = (
      await c.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE application_name='hash-talk' AND $1=ANY(pg_blocking_pids(pid))",
        [holder],
      )
    ).rows[0]!.pid;
    reading = p.op(input.recipient, 'sync-state', { from: null });
    void reading.catch(() => undefined);
    await waitForBlocked(c, owner);
    await c.query('SELECT pg_advisory_unlock(773392)');
    await writing;
    const cut = syncSnapshot(await reading);
    let after = 0,
      found = false;
    for (let round = 0; round < 8; round++) {
      const page = messageItems(
        await p.op(input.recipient, 'page', { snapshot: cut, after }),
      );
      found ||= page.items.some((row) => row.id === input.packet.id);
      if (page.next === null) break;
      after = page.next;
    }
    assert.ok(
      found,
      'signed versioned reader includes the committed pending packet',
    );
  } finally {
    await c.query('SELECT pg_advisory_unlock_all()');
    await Promise.allSettled([writing, reading]);
    await c.query(
      'DROP TRIGGER pause_signed_sync ON hash_talk.message_packets',
    );
    await c.query('DROP FUNCTION hash_talk.pause_signed_sync()');
  }
}
