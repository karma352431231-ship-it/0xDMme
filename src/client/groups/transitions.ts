import { eventHash } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  groupConsentProof,
  groupEventProof,
  groupEventHash,
} from '../../shared/groups/index.ts';
import type {
  GroupConsent,
  GroupEvent,
  GroupMember,
} from '../../shared/groups/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
function actor(a: VaultAuthority) {
  return {
    actor: a.session.accountId,
    deviceId: a.session.deviceId,
    directory: a.directory,
    authorityRevision: a.events.length,
  };
}
export async function createGroupEvent(
  a: VaultAuthority,
  groupId: string,
): Promise<GroupEvent> {
  return signedGroup(a, {
    version: 1,
    groupId,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    ...actor(a),
    owner: a.session.accountId,
    members: [{ accountId: a.session.accountId, role: 'owner', joined: 1 }],
    target: null,
    consent: null,
    signature: '',
  });
}
export async function proposeGroupConsent(input: {
  authority: VaultAuthority;
  state: GroupEvent;
  target: DirectoryEvent;
  kind: GroupConsent['kind'];
}): Promise<GroupConsent> {
  const { authority, state, target, kind } = input;
  const consent: GroupConsent = {
    version: 1,
    id: crypto.randomUUID(),
    kind,
    groupId: state.groupId,
    head: await groupEventHash(state),
    ...actor(authority),
    target: target.accountId,
    targetDirectory: await eventHash(target),
    targetRevision: target.revision,
    signature: '',
  };
  consent.signature = await authority.sign(groupConsentProof(consent));
  return consent;
}
export async function changeGroupEvent(input: {
  authority: VaultAuthority;
  state: GroupEvent;
  kind: Exclude<GroupEvent['kind'], 'create'>;
  target: string | null;
  consent?: GroupConsent;
  role?: 'admin' | 'member';
}): Promise<GroupEvent> {
  const { authority, state, kind, target } = input;
  let members: GroupMember[] = state.members.map((m) => ({ ...m })),
    owner = state.owner;
  if (kind === 'join')
    members.push({
      accountId: authority.session.accountId,
      role: 'member',
      joined: state.epoch + 1,
    });
  else if (kind === 'leave' || kind === 'remove')
    members = members.filter((m) => m.accountId !== target);
  else if (kind === 'delete') members = [];
  else if (kind === 'role')
    members = members.map((m) =>
      m.accountId === target ? { ...m, role: input.role ?? 'member' } : m,
    );
  else if (kind === 'transfer') {
    owner = authority.session.accountId;
    members = transferRoles(members, state.owner, owner);
  }
  members.sort((a, b) => a.accountId.localeCompare(b.accountId));
  return signedGroup(authority, {
    version: 1,
    groupId: state.groupId,
    revision: state.revision + 1,
    epoch: state.epoch + 1,
    previous: await groupEventHash(state),
    kind,
    ...actor(authority),
    target,
    owner,
    members,
    consent: input.consent ?? null,
    signature: '',
  });
}
function transferRoles(
  members: GroupMember[],
  oldOwner: string,
  newOwner: string,
): GroupMember[] {
  return members.map((m) => {
    if (m.accountId === oldOwner) return { ...m, role: 'member' };
    if (m.accountId === newOwner) return { ...m, role: 'owner' };
    return m;
  });
}
async function signedGroup(
  a: VaultAuthority,
  event: GroupEvent,
): Promise<GroupEvent> {
  event.signature = await a.sign(groupEventProof(event));
  return event;
}
