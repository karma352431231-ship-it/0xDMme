import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { messageUser } from '../fixtures/message-allocation-database.ts';
import { assertGroupReconciled } from '../fixtures/group-quota-database.ts';
import {
  currentGlobalUsageSources,
  globalBytes,
} from '../fixtures/global-usage-database.ts';
import { groupEventHash } from '../../src/shared/groups/index.ts';
import type { GroupEvent } from '../../src/shared/groups/index.ts';
import { canonical, digest } from '../../src/shared/devices/index.ts';
import {
  groupViewOnceManifest,
  groupViewOnceHash,
} from '../../src/shared/group-view-once/index.ts';
import { attachGroupViewOnce } from '../../src/server/database/group-view-once.ts';
import { assertGroupEdit } from '../../src/server/database/group-message-updates.ts';
import type { GroupPacket } from '../../src/shared/group-messages/index.ts';

await test('group delivery grants exactly one opening per member account and preserves independent recipients, authorization, keys and quota accounting', async (t) => {
  const c = await messageReceiptFixture(t),
    sender = await messageUser(c),
    one = await messageUser(c),
    two = await messageUser(c),
    stranger = await messageUser(c);
  const group = crypto.randomUUID();
  const state: GroupEvent = {
    version: 1,
    groupId: group,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: sender.session.accountId,
    deviceId: sender.session.deviceId,
    directory: sender.directory,
    authorityRevision: 1,
    target: null,
    owner: sender.session.accountId,
    members: [sender, one, two].map((u) => ({
      accountId: u.session.accountId,
      role: u === sender ? 'owner' : 'member',
      joined: 1,
    })),
    consent: null,
    signature: Buffer.alloc(64).toString('base64'),
  };
  state.members.sort((a, b) => a.accountId.localeCompare(b.accountId));
  const head = await groupEventHash(state);
  await c.inspector.query(
    'INSERT INTO hash_talk.groups(id,owner,revision,epoch,head,event,charge) VALUES($1,$2,1,1,$3,$4::jsonb,1024)',
    [group, state.owner, head, JSON.stringify(state)],
  );
  await c.inspector.query(
    "INSERT INTO hash_talk.group_members(group_id,account_id,role,joined) SELECT $1,(m->>'accountId')::uuid,m->>'role',1 FROM jsonb_array_elements($2::jsonb) m",
    [group, JSON.stringify(state.members)],
  );
  const operate = (
    user: typeof sender,
    op: string,
    data: Record<string, unknown>,
    installed = false,
  ) =>
    c.db.viewOnce.operate(
      user,
      'view-once-' + op,
      { scope: 'group', peer: group, ...data },
      installed,
    );
  async function upload(policy: 'mobile' | 'file', publish = true) {
    const id = crypto.randomUUID(),
      ciphertext = Buffer.alloc(400000, 21),
      keys = [one, two].map((u) => ({
        accountId: u.session.accountId,
        keyId: u.key,
        ciphertext: Buffer.alloc(48).toString('base64'),
        ephemeral: Buffer.alloc(32).toString('base64').replace(/=+$/u, ''),
        mac: Buffer.alloc(8).toString('base64').replace(/=+$/u, ''),
      }));
    const manifest = groupViewOnceManifest({
      version: 1,
      scope: 'group',
      id,
      sender: sender.session.accountId,
      recipient: group,
      epoch: 1,
      head,
      media: policy === 'file',
      policy,
      bytes: ciphertext.length,
      hash: createHash('sha256').update(ciphertext).digest('hex'),
      iv: Buffer.alloc(12).toString('base64'),
      recipients: await Promise.all(
        keys.map(async (key) => ({
          accountId: key.accountId,
          keyId: key.keyId,
          hash: await digest(canonical(key)),
        })),
      ),
    });
    const hash = await groupViewOnceHash(manifest),
      input = { id, hash };
    await operate(sender, 'create', { manifest, keys });
    for (let offset = 0; offset < ciphertext.length; offset += 192 * 1024)
      await operate(sender, 'part', {
        ...input,
        offset,
        bytes: ciphertext
          .subarray(offset, offset + 192 * 1024)
          .toString('base64'),
      });
    assert.deepEqual(await operate(sender, 'create', { manifest, keys }), {
      offset: ciphertext.length,
      ready: true,
    });
    if (publish) {
      await c.inspector.query('BEGIN');
      try {
        await attachGroupViewOnce(c.inspector, {
          id,
          groupId: group,
          sender: sender.session.accountId,
          epoch: 1,
          viewOnce: { hash },
        } as GroupPacket);
        await c.inspector.query(
          'INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,key_hash,hash,body,pending_accounts,charge) VALUES($1,$2,1,$3,NULL,$4,$5::jsonb,$6::uuid[],1024)',
          [
            id,
            group,
            sender.session.accountId,
            'a'.repeat(64),
            JSON.stringify({ viewOnce: { hash } }),
            [one.session.accountId, two.session.accountId],
          ],
        );
        await c.inspector.query('COMMIT');
      } catch (error) {
        await c.inspector.query('ROLLBACK');
        throw error;
      }
    }
    return { input, manifest, keys, ciphertext };
  }
  await assertReactionPages(c, { group, head, sender, members: [one, two] });
  await t.test(
    'reactions authenticate the root and membership period while edits stay author-only',
    () => assertActionAuthorization(c, { state, sender, member: one }),
  );
  const value = await upload('mobile');
  await assert.rejects(operate(one, 'open', value.input), { status: 403 });
  await assert.rejects(operate(stranger, 'open', value.input, true), {
    status: 403,
  });
  await assert.rejects(operate(sender, 'open', value.input, true), {
    status: 410,
  });
  const concurrent = await Promise.allSettled([
    operate(one, 'open', value.input, true),
    operate(one, 'open', value.input, true),
  ]);
  assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((r) => r.status === 'rejected').length, 1);
  assert.deepEqual(await operate(one, 'status', value.input), {
    consumed: true,
    ready: true,
    keyId: null,
  });
  assert.deepEqual(await operate(two, 'status', value.input), {
    consumed: false,
    ready: true,
    keyId: two.key,
  });
  const keysAfterOne = await c.inspector.query<{
    account_id: string;
    erased: boolean;
  }>(
    'SELECT account_id,key IS NULL AS erased FROM hash_talk.group_view_once_deliveries WHERE message_id=$1 ORDER BY account_id',
    [value.input.id],
  );
  assert.equal(
    keysAfterOne.rows.find((r) => r.account_id === one.session.accountId)
      ?.erased,
    true,
  );
  assert.equal(
    keysAfterOne.rows.find((r) => r.account_id === two.session.accountId)
      ?.erased,
    false,
  );
  await operate(two, 'open', value.input, true);
  assert.equal(
    (
      await c.inspector.query<{ bytes: number }>(
        'SELECT octet_length(ciphertext) AS bytes FROM hash_talk.group_view_once_payloads WHERE id=$1',
        [value.input.id],
      )
    ).rows[0]?.bytes,
    0,
  );
  await assertGroupReconciled(c.inspector);
  const file = await upload('file');
  await operate(one, 'open', file.input);
  const pending = await upload('file', false);
  await assert.rejects(operate(one, 'open', pending.input), { status: 410 });
  await operate(sender, 'cancel', pending.input);
  const removed = await upload('mobile');
  await c.inspector.query(
    `UPDATE hash_talk.group_packets SET body=NULL,deletion='{}'::jsonb WHERE id=$1`,
    [removed.input.id],
  );
  assert.equal(
    (
      await c.inspector.query(
        'SELECT 1 FROM hash_talk.group_view_once_payloads WHERE id=$1',
        [removed.input.id],
      )
    ).rowCount,
    0,
  );
  const expired = await upload('file', false);
  await c.inspector.query(
    "UPDATE hash_talk.group_view_once_payloads SET created_at=clock_timestamp()-interval '25 hours' WHERE id=$1",
    [expired.input.id],
  );
  await c.db.viewOnce.clean();
  assert.equal(
    (
      await c.inspector.query(
        'SELECT id FROM hash_talk.group_view_once_payloads WHERE id=$1',
        [expired.input.id],
      )
    ).rowCount,
    0,
  );
  const unfinished = await upload('file', false);
  await c.db.groupRetention.clear(sender, { groupId: group, head });
  await assert.rejects(
    operate(sender, 'create', {
      manifest: unfinished.manifest,
      keys: unfinished.keys,
    }),
    { status: 409 },
  );
  await assert.rejects(
    operate(sender, 'part', {
      ...unfinished.input,
      offset: 0,
      bytes: unfinished.ciphertext.subarray(0, 192 * 1024).toString('base64'),
    }),
    { status: 409 },
  );
  await c.db.groupRetention.tick();
  await c.db.groupRetention.tick();
  assert.equal(
    (
      await c.inspector.query(
        'SELECT id FROM hash_talk.group_view_once_payloads WHERE group_id=$1',
        [group],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await c.inspector.query<{ clearing: boolean }>(
        'SELECT clearing FROM hash_talk.groups WHERE id=$1',
        [group],
      )
    ).rows[0]?.clearing,
    false,
  );
  await assertGroupReconciled(c.inspector);
  const leaving = await upload('mobile');
  await c.inspector.query(
    'DELETE FROM hash_talk.group_members WHERE group_id=$1 AND account_id=$2',
    [group, one.session.accountId],
  );
  assert.equal(
    (
      await c.inspector.query<{ erased: boolean }>(
        'SELECT key IS NULL AS erased FROM hash_talk.group_view_once_deliveries WHERE message_id=$1 AND account_id=$2',
        [leaving.input.id, one.session.accountId],
      )
    ).rows[0]?.erased,
    true,
  );
  state.members = state.members.filter(
    (m) => m.accountId !== one.session.accountId,
  );
  state.epoch = 2;
  state.revision = 2;
  await c.inspector.query(
    'UPDATE hash_talk.groups SET event=$2::jsonb WHERE id=$1',
    [group, JSON.stringify(state)],
  );
  await assert.rejects(operate(one, 'open', leaving.input, true), {
    status: 403,
  });
  state.members.push({
    accountId: stranger.session.accountId,
    role: 'member',
    joined: 2,
  });
  state.members.sort((a, b) => a.accountId.localeCompare(b.accountId));
  await c.inspector.query(
    'UPDATE hash_talk.groups SET event=$2::jsonb WHERE id=$1',
    [group, JSON.stringify(state)],
  );
  await assert.rejects(operate(stranger, 'open', leaving.input, true), {
    status: 410,
  });
  state.epoch = 3;
  state.members.push({
    accountId: one.session.accountId,
    role: 'member',
    joined: 3,
  });
  state.members.sort((a, b) => a.accountId.localeCompare(b.accountId));
  await c.inspector.query(
    'UPDATE hash_talk.groups SET event=$2::jsonb WHERE id=$1',
    [group, JSON.stringify(state)],
  );
  await assert.rejects(operate(one, 'open', leaving.input, true), {
    status: 410,
  });
  await assertGroupReconciled(c.inspector);
  const sources = await currentGlobalUsageSources(c.inspector);
  const expected = await c.inspector.query<{ bytes: string }>(
    sources
      .map(
        ({ name }) =>
          `SELECT coalesce(sum(${name === 'accounts' ? 'coalesce(octet_length(profile_ciphertext)+524,0)' : 'charge'}),0) AS bytes FROM hash_talk.${name}`,
      )
      .join(' UNION ALL '),
  );
  assert.equal(
    await globalBytes(c.inspector),
    expected.rows.reduce((sum, r) => sum + BigInt(r.bytes), 0n),
  );
});

async function assertReactionPages(
  c: Awaited<ReturnType<typeof messageReceiptFixture>>,
  input: {
    group: string;
    head: string;
    sender: Awaited<ReturnType<typeof messageUser>>;
    members: Awaited<ReturnType<typeof messageUser>>[];
  },
): Promise<void> {
  const { group, head, sender, members } = input;
  // A page of roots may have more than sixteen latest actions. Each author
  // contributes independently; a newer action replaces only that author's slot.
  const roots = Array.from({ length: 9 }, () => crypto.randomUUID()),
    latest = new Set<string>();
  for (const root of roots) {
    for (const user of members) {
      const versions: string[] = [];
      for (let version = 0; version < 2; version++) {
        const id = crypto.randomUUID();
        await c.inspector.query(
          'INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,key_hash,hash,body,pending_accounts,charge,relation) VALUES($1,$2,1,$3,NULL,$4,$5::jsonb,ARRAY[]::uuid[],1024,$6::jsonb)',
          [
            id,
            group,
            user.session.accountId,
            'c'.repeat(64),
            JSON.stringify({ kind: 'text' }),
            JSON.stringify({
              id: root,
              hash: 'a'.repeat(64),
              author: sender.session.accountId,
              type: 'reaction',
            }),
          ],
        );
        versions.push(id);
      }
      latest.add(versions.at(-1)!);
    }
  }
  const snapshot = await c.db.groupMessages.updates.snapshot(sender, {
      groupId: group,
      head,
    }),
    found: string[] = [];
  let after: string | undefined;
  do {
    const page = await c.db.groupMessages.relations(sender, {
      ...snapshot,
      ids: roots,
      ...(after ? { after } : {}),
    });
    assert.ok(page.ids.length <= 16);
    found.push(...page.ids);
    after = page.next ?? undefined;
  } while (after);
  assert.equal(found.length, 18);
  assert.deepEqual(new Set(found), latest);
}

async function assertActionAuthorization(
  c: Awaited<ReturnType<typeof messageReceiptFixture>>,
  input: {
    state: GroupEvent;
    sender: Awaited<ReturnType<typeof messageUser>>;
    member: Awaited<ReturnType<typeof messageUser>>;
  },
): Promise<void> {
  const { state, sender, member } = input,
    id = crypto.randomUUID(),
    hash = 'd'.repeat(64);
  await c.inspector.query(
    'INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,key_hash,hash,body,pending_accounts,charge) VALUES($1,$2,1,$3,NULL,$4,$5::jsonb,ARRAY[]::uuid[],1024)',
    [
      id,
      state.groupId,
      sender.session.accountId,
      hash,
      JSON.stringify({ kind: 'text' }),
    ],
  );
  const relation = {
      id,
      hash,
      author: sender.session.accountId,
      type: 'reaction' as const,
    },
    packet = {
      id: crypto.randomUUID(),
      groupId: state.groupId,
      sender: member.session.accountId,
      epoch: 1,
      kind: 'text',
      relation,
    } as GroupPacket,
    check = (candidate: GroupPacket, current = state) =>
      c.db.contacts.withMaintenance((client) =>
        assertGroupEdit(client, candidate, current),
      );
  await check(packet);
  await assert.rejects(
    check({ ...packet, relation: { ...relation, type: 'edit' } }),
    { status: 403 },
  );
  await assert.rejects(
    check({ ...packet, relation: { ...relation, hash: 'e'.repeat(64) } }),
    { status: 403 },
  );
  await assert.rejects(
    check({
      ...packet,
      relation: { ...relation, author: member.session.accountId },
    }),
    { status: 403 },
  );
  await assert.rejects(
    check(packet, {
      ...state,
      members: state.members.map((m) =>
        m.accountId === member.session.accountId ? { ...m, joined: 2 } : m,
      ),
    }),
    { status: 403 },
  );
  await c.inspector.query(
    'UPDATE hash_talk.group_packets SET body=$2::jsonb WHERE id=$1',
    [id, JSON.stringify({ kind: 'text', viewOnce: { hash } })],
  );
  await assert.rejects(
    check({
      ...packet,
      sender: sender.session.accountId,
      relation: { ...relation, type: 'edit' },
    }),
    { status: 403 },
  );
}
