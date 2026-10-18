import { admissionPacket } from '../fixtures/message-allocation-database.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  uploadLifecycleFixture,
  uploadRequest,
  refusedAfterWait,
} from '../fixtures/upload-lifecycle-database.ts';
import type {
  UploadDomain,
  UploadLifecycleFixture,
} from '../fixtures/upload-lifecycle-database.ts';

async function transfer(c: UploadLifecycleFixture) {
  const input = uploadRequest(c),
    id = input.refs[0]!.id;
  await c.store.reserve(c.authority, input);
  await c.reconcile();
  const reserved = await c.rows();
  await c.store.reserve(c.authority, input);
  assert.deepEqual(await c.rows(), reserved);
  await c.reconcile();
  c.room.bytes = 0n;
  try {
    await c.store.reserve(c.authority, input);
    assert.deepEqual(await c.rows(), reserved);
    await c.reconcile();
    await assert.rejects(c.store.reserve(c.authority, uploadRequest(c)), {
      status: 503,
    });
    const added = uploadRequest(c).refs[0]!;
    await assert.rejects(
      c.store.reserve(c.authority, { ...input, refs: [...input.refs, added] }),
      { status: 503 },
    );
    await assert.rejects(
      c.store.reserve(c.authority, {
        ...input,
        refs: [{ ...input.refs[0]!, hash: '2'.repeat(64) }],
      }),
      { status: 409 },
    );
    assert.deepEqual(await c.rows(), reserved);
    await c.reconcile();
  } finally {
    c.room.bytes = 1_000_000_000_000n;
  }
  const contenders = await Promise.allSettled([
    c.store.begin(c.authority, id, 0),
    c.store.begin(c.authority, id, 0),
  ]);
  const winners = contenders.filter((result) => result.status === 'fulfilled');
  assert.equal(winners.length, 1);
  const lease = winners[0]!.value;
  assert.ok(lease.writer);
  const rejected = contenders.find((result) => result.status === 'rejected');
  assert.ok(rejected);
  assert.equal((rejected.reason as { status: number }).status, 409);
  await c.reconcile();
  await assert.rejects(c.store.cancel(c.authority, input.message), {
    status: 409,
  });
  await c.reconcile();
  await c.store.release(id, crypto.randomUUID());
  assert.equal(
    (
      await c.inspector.query<{ writer: string }>(
        `SELECT writer FROM hash_talk.${c.source} WHERE id=$1`,
        [id],
      )
    ).rows[0]!.writer,
    lease.writer,
  );
  await c.store.release(id, lease.writer);
  await c.reconcile();
  const replacement = await c.store.begin(c.authority, id, 0);
  assert.ok(replacement.writer);
  await assert.rejects(
    c.store.finish(c.authority, { id, writer: lease.writer, index: 0 }),
    { status: 409 },
  );
  await c.reconcile();
  await c.store.finish(c.authority, {
    id,
    writer: replacement.writer,
    index: 0,
  });
  await c.reconcile();
  assert.equal((await c.store.begin(c.authority, id, 0)).writer, null);
  const finish = await c.store.begin(c.authority, id, null);
  assert.ok(finish.writer);
  await c.store.finish(c.authority, { id, writer: finish.writer, index: null });
  await c.reconcile();
  assert.equal((await c.store.begin(c.authority, id, null)).writer, null);
  return { input, id };
}
async function expiry(c: UploadLifecycleFixture) {
  const { input, id } = await transfer(c);
  const before = await c.rows();
  const column = c.domain === 'private' ? 'created_at' : 'reserved_at';
  await c.inspector.query(
    `UPDATE hash_talk.${c.source} SET ${column}=now()-interval '25 hours' WHERE id=$1`,
    [id],
  );
  assert.ok((await c.store.nextCollection())! <= Date.now());
  assert.ok((await c.store.garbage()).some((row) => row.id === id));
  await c.reconcile();
  const row = (await c.rows()).find((row) => row.body['id'] === id)!;
  assert.equal(
    row.body['charge'],
    before.find((row) => row.body['id'] === id)!.body['charge'],
  );
  assert.equal(row.body['status'], 'deleting');
  await c.store.collected(id);
  await c.reconcile();
  await c.store.collected(id);
  await c.reconcile();
  await c.store.reserve(c.authority, input);
  await c.store.cancel(c.authority, input.message);
  await c.reconcile();
  await c.store.collected(id);
  await c.reconcile();
  assert.equal((await c.rows()).length, 0);
}
async function authorizationWaits(c: UploadLifecycleFixture) {
  const input = uploadRequest(c),
    id = input.refs[0]!.id;
  await c.store.reserve(c.authority, input);
  const lease = await c.store.begin(c.authority, id, 0);
  assert.ok(lease.writer);
  const before = await c.rows();
  for (const run of [
    () => c.store.preflight(c.authority, id),
    () => c.store.finish(c.authority, { id, writer: lease.writer!, index: 0 }),
  ]) {
    try {
      await refusedAfterWait(c, {
        run,
        sql: 'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
        values: [c.authority.session.accountId, 'f'.repeat(64)],
        status: 409,
      });
      assert.deepEqual(await c.rows(), before);
      await c.reconcile();
    } finally {
      await c.inspector.query(
        'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
        [c.authority.session.accountId, c.authority.directory],
      );
    }
  }
  const statement =
    c.domain === 'private'
      ? "UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)"
      : 'INSERT INTO hash_talk.social_blocks(actor,target,blocked,revision) VALUES($1,$2,true,1)';
  const values = c.domain === 'private' ? c.accounts : c.profiles;
  for (const run of [
    () => c.store.preflight(c.authority, id),
    () => c.store.finish(c.authority, { id, writer: lease.writer!, index: 0 }),
  ]) {
    try {
      await refusedAfterWait(c, {
        run,
        sql: statement,
        values,
        status: c.domain === 'private' ? 423 : 403,
      });
      assert.deepEqual(await c.rows(), before);
      await c.reconcile();
    } finally {
      if (c.domain === 'private')
        await c.inspector.query(
          "UPDATE hash_talk.contact_relations SET state='approved' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          values,
        );
      else
        await c.inspector.query(
          'DELETE FROM hash_talk.social_blocks WHERE actor=$1 AND target=$2',
          values,
        );
    }
  }
  await c.store.release(id, lease.writer);
  await c.reconcile();
}
for (const domain of [
  'private',
  'social',
] as const satisfies readonly UploadDomain[]) {
  await test(`${domain} upload lifecycle reconciles every reservation, transfer, retry, pressure, expiry and cancellation effect`, async (t) => {
    const c = await uploadLifecycleFixture(t, domain);
    await expiry(c);
  });
  await test(`${domain} waiting upload checks current device authority before effects`, async (t) => {
    const c = await uploadLifecycleFixture(t, domain);
    await authorizationWaits(c);
  });
}

await test('social ready-media admission rolls back atomically and accepted media neither cancels nor expires', async (t) => {
  const c = await uploadLifecycleFixture(t, 'social');
  // Synthetic SQL fixture; the social-DM integration separately verifies signed directory and packet bytes.
  await c.inspector.query(
    "INSERT INTO hash_talk.social_directories(profile_id,revision,body,hash,charge) SELECT id,1,'{}',repeat('a',64),512 FROM unnest($1::uuid[]) id",
    [c.profiles],
  );
  const input = uploadRequest(c),
    id = input.refs[0]!.id;
  await c.store.reserve(c.authority, input);
  for (const index of [0, null]) {
    const lease = await c.store.begin(c.authority, id, index);
    assert.ok(lease.writer);
    await c.store.finish(c.authority, { id, writer: lease.writer, index });
  }
  const ready = await c.rows();
  const packet = {
    ...admissionPacket(c.pair),
    id: input.message,
    sender: c.profiles[0]!,
    recipient: c.profiles[1]!,
    kind: 'attachment' as const,
    socialMedia: 'photo' as const,
    attachments: input.refs,
  };
  const admit = async (fail: boolean) =>
    c.db.socialDm.withActor(c.authority, async (context) => {
      await c.db.socialDm.requireConversation(context, c.peer);
      await c.db.socialMedia.admit(context.client, packet);
      await context.client.query(
        `INSERT INTO hash_talk.social_messages(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge)
      VALUES($1,$2,$3,repeat('a',64),$4::jsonb,1024,512,512)`,
        [packet.id, packet.sender, packet.recipient, JSON.stringify(packet)],
      );
      if (fail) throw new Error('Synthetic late admission failure');
    });
  await assert.rejects(admit(true), /Synthetic late admission failure/u);
  assert.deepEqual(await c.rows(), ready);
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.social_messages WHERE id=$1',
        [packet.id],
      )
    ).rowCount,
    0,
  );
  await c.reconcile();
  await admit(false);
  await c.reconcile();
  await assert.rejects(c.store.cancel(c.authority, input.message), {
    status: 409,
  });
  await c.inspector.query(
    "UPDATE hash_talk.social_media SET reserved_at=now()-interval '25 hours' WHERE id=$1",
    [id],
  );
  assert.equal(await c.store.nextCollection(), null);
  assert.deepEqual(await c.store.garbage(), []);
  assert.equal((await c.rows())[0]!.body['status'], 'accepted');
  await c.reconcile();
});
