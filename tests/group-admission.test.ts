import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupParticipant } from './fixtures/group-participant.ts';
import { canonical, digest, sign } from '../src/shared/devices/index.ts';
import {
  groupEvent,
  groupEventHash,
  groupEventProof,
  groupCanRead,
  verifyGroupTransition,
} from '../src/shared/groups/index.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import {
  groupLinkProof,
  readGroupInvitation,
  groupInvitationUrl,
} from '../src/shared/groups/links.ts';
import type { GroupLink } from '../src/shared/groups/links.ts';

type Participant = Awaited<ReturnType<typeof groupParticipant>>;
function fields(p: Participant) {
  return {
    actor: p.accountId,
    deviceId: p.deviceId,
    directory: p.head,
    authorityRevision: 1,
  };
}
async function signed(p: Participant, event: GroupEvent): Promise<GroupEvent> {
  event.signature = await sign(p.signing, groupEventProof(event));
  return event;
}
async function genesis(p: Participant): Promise<GroupEvent> {
  return signed(p, {
    version: 1,
    groupId: crypto.randomUUID(),
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    ...fields(p),
    target: null,
    owner: p.accountId,
    members: [{ accountId: p.accountId, role: 'owner', joined: 1 }],
    consent: null,
    signature: '',
  });
}
async function admission(
  previous: GroupEvent,
  p: Participant,
  target: string,
  link?: GroupLink,
): Promise<GroupEvent> {
  return signed(p, {
    ...previous,
    ...fields(p),
    revision: previous.revision + 1,
    epoch: previous.epoch + 1,
    previous: await groupEventHash(previous),
    kind: link ? 'link-join' : 'add',
    target,
    consent: null,
    ...(link ? { link } : {}),
    members: [
      ...previous.members,
      {
        accountId: target,
        role: 'member' as const,
        joined: previous.epoch + 1,
      },
    ].sort((a, b) => a.accountId.localeCompare(b.accountId)),
  });
}
async function grant(p: Participant, state: GroupEvent): Promise<GroupLink> {
  const link: GroupLink = {
    version: 1,
    id: crypto.randomUUID(),
    groupId: state.groupId,
    head: await groupEventHash(state),
    ...fields(p),
    tokenHash: await digest('a'.repeat(64)),
    signature: '',
  };
  link.signature = await sign(p.signing, groupLinkProof(link));
  return link;
}
await test('admin adiciona diretamente; membro não adiciona, não promove nem libera histórico anterior', async () => {
  const owner = await groupParticipant(),
    member = await groupParticipant(),
    third = await groupParticipant(),
    first = await genesis(owner);
  const added = await admission(first, owner, member.accountId);
  assert.deepEqual(
    await verifyGroupTransition({
      previous: first,
      event: added,
      actorDirectory: owner.directory,
    }),
    added,
  );
  assert.equal(groupCanRead(added, member.accountId, 1), false);
  assert.equal(groupCanRead(added, member.accountId, 2), true);
  await assert.rejects(
    verifyGroupTransition({
      previous: added,
      event: await admission(added, member, third.accountId),
      actorDirectory: member.directory,
    }),
  );
  const escalated = await admission(first, owner, member.accountId);
  escalated.members = escalated.members.map((m) =>
    m.accountId === member.accountId ? { ...m, role: 'admin' } : m,
  );
  await signed(owner, escalated);
  await assert.rejects(
    verifyGroupTransition({
      previous: first,
      event: escalated,
      actorDirectory: owner.directory,
    }),
  );
});
await test('entrada por link exige concessão assinada, âncora válida e emissor ainda administrador', async () => {
  const owner = await groupParticipant(),
    member = await groupParticipant(),
    first = await genesis(owner),
    link = await grant(owner, first),
    joined = await admission(first, member, member.accountId, link);
  const input = {
    previous: first,
    event: joined,
    actorDirectory: member.directory,
    linkDirectory: owner.directory,
    linkAnchor: first,
  };
  assert.deepEqual(await verifyGroupTransition(input), joined);
  await assert.rejects(
    verifyGroupTransition({ ...input, linkAnchor: await genesis(owner) }),
  );
  await assert.rejects(
    verifyGroupTransition({
      ...input,
      event: await admission(first, member, member.accountId, {
        ...link,
        tokenHash: 'b'.repeat(64),
      }),
    }),
  );
  await assert.rejects(
    verifyGroupTransition({
      ...input,
      event: await admission(first, member, owner.accountId, link),
    }),
  );
  const previous = {
    ...first,
    members: first.members.map((m) => ({ ...m, role: 'member' as const })),
    owner: member.accountId,
  };
  await assert.rejects(verifyGroupTransition({ ...input, previous }));
});
await test('eventos antigos conservam bytes canônicos; segredo do link não entra no evento', async () => {
  const owner = await groupParticipant(),
    member = await groupParticipant(),
    first = await genesis(owner);
  assert.equal(canonical(groupEvent(first)), canonical(first));
  assert.equal(Object.hasOwn(groupEvent(first), 'link'), false);
  assert.throws(() => groupEvent({ ...first, kind: ['create'] }));
  const link = await grant(owner, first),
    joined = await admission(first, member, member.accountId, link);
  assert.equal(canonical(joined).includes('a'.repeat(64)), false);
  const url = groupInvitationUrl(
    'https://0xdmme.app',
    first.groupId,
    'a'.repeat(64),
  );
  assert.deepEqual(readGroupInvitation(url), {
    groupId: first.groupId,
    token: 'a'.repeat(64),
  });
  assert.equal(new URL(url).search, '');
  assert.throws(() =>
    readGroupInvitation(url.replace('0xdmme.app', 'example.com')),
  );
  assert.throws(() => groupEvent({ ...first, link }));
});
