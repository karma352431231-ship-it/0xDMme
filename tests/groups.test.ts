import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupParticipant as participant } from './fixtures/group-participant.ts';
import { sign } from '../src/shared/devices/index.ts';
import {
  groupCanRead,
  groupEvent,
  groupConsentProof,
  groupEventHash,
  groupEventProof,
  groupRoom,
  verifyGroupTransition,
} from '../src/shared/groups/index.ts';
import type { GroupConsent, GroupEvent } from '../src/shared/groups/index.ts';

type Participant = Awaited<ReturnType<typeof participant>>;
function authority(p: Participant) {
  return {
    actor: p.accountId,
    deviceId: p.deviceId,
    directory: p.head,
    authorityRevision: 1,
  };
}
async function signed(event: GroupEvent, p: Participant) {
  return { ...event, signature: await sign(p.signing, groupEventProof(event)) };
}
async function consent(
  previous: GroupEvent,
  actor: Participant,
  target: Participant,
  kind: GroupConsent['kind'],
) {
  const value: GroupConsent = {
    version: 1,
    kind,
    id: crypto.randomUUID(),
    groupId: previous.groupId,
    head: await groupEventHash(previous),
    ...authority(actor),
    target: target.accountId,
    targetDirectory: target.head,
    targetRevision: target.directory.revision,
    signature: '',
  };
  value.signature = await sign(actor.signing, groupConsentProof(value));
  return value;
}
async function change(
  previous: GroupEvent,
  actor: Participant,
  values: Partial<GroupEvent>,
) {
  return signed(
    {
      ...previous,
      revision: previous.revision + 1,
      epoch: previous.epoch + 1,
      previous: await groupEventHash(previous),
      ...authority(actor),
      consent: null,
      ...values,
    },
    actor,
  );
}
function members(event: GroupEvent) {
  return event.members.toSorted((a, b) =>
    a.accountId.localeCompare(b.accountId),
  );
}

await test('signed membership, removal and reentry grant no history from earlier periods', async () => {
  const owner = await participant(),
    invited = await participant(),
    attacker = await participant();
  const genesis = await signed(
    {
      version: 1,
      groupId: crypto.randomUUID(),
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      ...authority(owner),
      target: null,
      owner: owner.accountId,
      members: [{ accountId: owner.accountId, role: 'owner', joined: 1 }],
      consent: null,
      signature: '',
    },
    owner,
  );
  assert.deepEqual(
    await verifyGroupTransition({
      previous: null,
      event: genesis,
      actorDirectory: owner.directory,
    }),
    genesis,
  );
  const entry = await change(genesis, invited, {
    kind: 'join',
    target: invited.accountId,
    consent: await consent(genesis, owner, invited, 'invite'),
    members: members({
      ...genesis,
      members: [
        ...genesis.members,
        { accountId: invited.accountId, role: 'member', joined: 2 },
      ],
    }),
  });
  await verifyGroupTransition({
    previous: genesis,
    event: entry,
    actorDirectory: invited.directory,
    consentDirectory: owner.directory,
  });
  assert.equal(groupCanRead(entry, invited.accountId, 1), false);
  assert.equal(groupCanRead(entry, invited.accountId, 2), true);
  assert.equal(groupCanRead(entry, attacker.accountId, 2), false);
  assert.equal(groupCanRead(entry, owner.accountId, 3), false);
  // A substituted, otherwise valid recipient identity cannot consume the inviter's signature.
  const impostor = await participant({ accountId: invited.accountId });
  const substituted = await signed(
    { ...entry, ...authority(impostor) },
    impostor,
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: genesis,
      event: substituted,
      actorDirectory: impostor.directory,
      consentDirectory: owner.directory,
    }),
  );
  const removal = await change(entry, owner, {
    kind: 'remove',
    target: invited.accountId,
    members: genesis.members,
  });
  await verifyGroupTransition({
    previous: entry,
    event: removal,
    actorDirectory: owner.directory,
  });
  assert.equal(groupCanRead(removal, invited.accountId, 2), false);
  const reentry = await change(removal, invited, {
    kind: 'join',
    target: invited.accountId,
    consent: await consent(removal, owner, invited, 'invite'),
    members: members({
      ...removal,
      members: [
        ...removal.members,
        { accountId: invited.accountId, role: 'member', joined: 4 },
      ],
    }),
  });
  await verifyGroupTransition({
    previous: removal,
    event: reentry,
    actorDirectory: invited.directory,
    consentDirectory: owner.directory,
  });
  assert.equal(groupCanRead(reentry, invited.accountId, 2), false);
  assert.equal(groupCanRead(reentry, invited.accountId, 4), true);
  assert.notEqual(groupRoom(genesis.groupId, 2), groupRoom(genesis.groupId, 4));
  await assert.rejects(
    verifyGroupTransition({
      previous: removal,
      event: { ...reentry, consent: entry.consent },
      actorDirectory: invited.directory,
      consentDirectory: owner.directory,
    }),
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: entry,
      event: await change(entry, invited, {
        kind: 'remove',
        target: owner.accountId,
        members: [{ accountId: invited.accountId, role: 'owner', joined: 2 }],
        owner: invited.accountId,
      }),
      actorDirectory: invited.directory,
    }),
  );
});

await test('directory admits 200 participants and rejects the 201st without reducing the limit', async () => {
  const owner = await participant();
  const state: GroupEvent = {
    version: 1,
    groupId: crypto.randomUUID(),
    revision: 200,
    epoch: 200,
    previous: 'a'.repeat(64),
    kind: 'role',
    ...authority(owner),
    target: owner.accountId,
    owner: owner.accountId,
    members: [
      { accountId: owner.accountId, role: 'owner' as const, joined: 1 },
      ...Array.from({ length: 199 }, () => ({
        accountId: crypto.randomUUID(),
        role: 'member' as const,
        joined: 2,
      })),
    ].sort((a, b) => a.accountId.localeCompare(b.accountId)),
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  assert.equal(groupEvent(state).members.length, 200);
  assert.throws(() =>
    groupEvent({
      ...state,
      members: [
        ...state.members,
        { accountId: crypto.randomUUID(), role: 'member', joined: 200 },
      ].sort((a, b) => a.accountId.localeCompare(b.accountId)),
    }),
  );
});

await test('admin cannot change ownership; an accepted offer needs both signatures and the former owner becomes a member', async () => {
  const owner = await participant(),
    next = await participant();
  const genesis = await signed(
    {
      version: 1,
      groupId: crypto.randomUUID(),
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      ...authority(owner),
      target: null,
      owner: owner.accountId,
      members: [{ accountId: owner.accountId, role: 'owner', joined: 1 }],
      consent: null,
      signature: '',
    },
    owner,
  );
  const entry = await change(genesis, next, {
    kind: 'join',
    target: next.accountId,
    consent: await consent(genesis, owner, next, 'invite'),
    members: members({
      ...genesis,
      members: [
        ...genesis.members,
        { accountId: next.accountId, role: 'member', joined: 2 },
      ],
    }),
  });
  const promotion = await change(entry, owner, {
    kind: 'role',
    target: next.accountId,
    members: entry.members.map((m) =>
      m.accountId === next.accountId ? { ...m, role: 'admin' } : m,
    ),
  });
  await verifyGroupTransition({
    previous: entry,
    event: promotion,
    actorDirectory: owner.directory,
  });
  const transfer = await change(promotion, next, {
    kind: 'transfer',
    owner: next.accountId,
    target: next.accountId,
    consent: await consent(promotion, owner, next, 'transfer'),
    members: promotion.members.map((m) => ({
      ...m,
      role: m.accountId === next.accountId ? 'owner' : 'member',
    })),
  });
  await verifyGroupTransition({
    previous: promotion,
    event: transfer,
    actorDirectory: next.directory,
    consentDirectory: owner.directory,
  });
  assert.equal(
    transfer.members.find((m) => m.accountId === owner.accountId)?.role,
    'member',
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: promotion,
      event: { ...transfer, consent: null },
      actorDirectory: next.directory,
    }),
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: promotion,
      event: await change(promotion, next, {
        kind: 'role',
        target: owner.accountId,
        members: transfer.members,
      }),
      actorDirectory: next.directory,
    }),
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: promotion,
      event: {
        ...transfer,
        signature: await sign(owner.signing, groupEventProof(transfer)),
      },
      actorDirectory: next.directory,
      consentDirectory: owner.directory,
    }),
  );
  const leave = await change(transfer, owner, {
    kind: 'leave',
    target: owner.accountId,
    members: transfer.members.filter((m) => m.accountId !== owner.accountId),
  });
  await verifyGroupTransition({
    previous: transfer,
    event: leave,
    actorDirectory: owner.directory,
  });
  const deletion = await change(leave, next, {
    kind: 'delete',
    target: null,
    members: [],
  });
  await verifyGroupTransition({
    previous: leave,
    event: deletion,
    actorDirectory: next.directory,
  });
  assert.equal(groupCanRead(deletion, next.accountId, leave.epoch), false);
  await assert.rejects(
    verifyGroupTransition({
      previous: deletion,
      event: await change(deletion, next, { kind: 'create' }),
      actorDirectory: next.directory,
    }),
  );
});

await test('owner hands ownership to a member without acceptance, then leaves; nobody else can', async () => {
  const owner = await participant(),
    next = await participant(),
    other = await participant();
  const genesis = await signed(
    {
      version: 1,
      groupId: crypto.randomUUID(),
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      ...authority(owner),
      target: null,
      owner: owner.accountId,
      members: [{ accountId: owner.accountId, role: 'owner', joined: 1 }],
      consent: null,
      signature: '',
    },
    owner,
  );
  const added = await change(genesis, owner, {
    kind: 'add',
    target: next.accountId,
    members: members({
      ...genesis,
      members: [
        ...genesis.members,
        { accountId: next.accountId, role: 'member', joined: 2 },
      ],
    }),
  });
  await verifyGroupTransition({
    previous: genesis,
    event: added,
    actorDirectory: owner.directory,
  });
  const handover = (actor: Participant, target: string) =>
    change(added, actor, {
      kind: 'transfer',
      owner: target,
      target,
      members: added.members.map((m) => ({
        ...m,
        role: m.accountId === target ? 'owner' : 'member',
      })),
    });
  const transfer = await handover(owner, next.accountId);
  await verifyGroupTransition({
    previous: added,
    event: transfer,
    actorDirectory: owner.directory,
  });
  assert.equal(transfer.owner, next.accountId);
  await assert.rejects(
    verifyGroupTransition({
      previous: added,
      event: await handover(next, next.accountId),
      actorDirectory: next.directory,
    }),
  );
  await assert.rejects(
    verifyGroupTransition({
      previous: added,
      event: await handover(owner, other.accountId),
      actorDirectory: owner.directory,
    }),
  );
  const leave = await change(transfer, owner, {
    kind: 'leave',
    target: owner.accountId,
    members: transfer.members.filter((m) => m.accountId !== owner.accountId),
  });
  const after = await verifyGroupTransition({
    previous: transfer,
    event: leave,
    actorDirectory: owner.directory,
  });
  assert.deepEqual(after.members, [
    { accountId: next.accountId, role: 'owner', joined: 2 },
  ]);
});
