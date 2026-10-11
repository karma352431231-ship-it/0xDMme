import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { revision } from '../contacts/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verify,
} from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';

import { groupLink, verifyGroupLink } from './links.ts';
import type { GroupLink } from './links.ts';

export const groupParticipantLimit = 200;
export const groupPageSize = 16;
export type GroupRole = 'owner' | 'admin' | 'member';
export interface GroupMember {
  accountId: string;
  role: GroupRole;
  joined: number;
}
export interface GroupConsent {
  version: 1;
  kind: 'invite' | 'transfer';
  id: string;
  groupId: string;
  head: string;
  actor: string;
  target: string;
  targetDirectory: string;
  targetRevision: number;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  signature: string;
}
export interface GroupEvent {
  version: 1;
  groupId: string;
  revision: number;
  epoch: number;
  previous: string | null;
  kind:
    | 'create'
    | 'join'
    | 'add'
    | 'link-join'
    | 'leave'
    | 'remove'
    | 'role'
    | 'transfer'
    | 'delete';
  actor: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  target: string | null;
  owner: string;
  members: GroupMember[];
  consent: GroupConsent | null;
  link?: GroupLink;
  signature: string;
}
function signature(value: unknown): string {
  if (base64(value, 64).length !== 64)
    throw new AccountError(400, 'Assinatura de grupo inválida.');
  return value as string;
}
function positive(value: unknown): number {
  const valid = revision(value);
  if (!valid) throw new AccountError(400, 'Revisão do grupo inválida.');
  return valid;
}
export function groupMember(value: unknown): GroupMember {
  const data = object(value);
  keys(data, ['accountId', 'role', 'joined']);
  if (!['owner', 'admin', 'member'].includes(String(data['role'])))
    throw new AccountError(400, 'Função de grupo inválida.');
  return {
    accountId: uuid(data['accountId']),
    role: data['role'] as GroupRole,
    joined: positive(data['joined']),
  };
}
export function groupConsent(value: unknown): GroupConsent {
  const data = object(value);
  keys(data, [
    'version',
    'kind',
    'id',
    'groupId',
    'head',
    'actor',
    'target',
    'targetDirectory',
    'targetRevision',
    'deviceId',
    'directory',
    'authorityRevision',
    'signature',
  ]);
  if (
    data['version'] !== 1 ||
    (data['kind'] !== 'invite' && data['kind'] !== 'transfer')
  )
    throw new AccountError(400, 'Convite ou transferência inválidos.');
  return {
    version: 1,
    kind: data['kind'],
    id: uuid(data['id']),
    groupId: uuid(data['groupId']),
    head: fingerprint(data['head']),
    actor: uuid(data['actor']),
    target: uuid(data['target']),
    targetDirectory: fingerprint(data['targetDirectory']),
    targetRevision: positive(data['targetRevision']),
    deviceId: uuid(data['deviceId']),
    directory: fingerprint(data['directory']),
    authorityRevision: positive(data['authorityRevision']),
    signature: signature(data['signature']),
  };
}
export function groupEvent(value: unknown): GroupEvent {
  const data = object(value);
  keys(data, [
    'version',
    'groupId',
    'revision',
    'epoch',
    'previous',
    'kind',
    'actor',
    'deviceId',
    'directory',
    'authorityRevision',
    'target',
    'owner',
    'members',
    'consent',
    'signature',
    ...(data['kind'] === 'link-join' ? ['link'] : []),
  ]);
  const kind = groupKind(data['kind']);
  if (
    data['version'] !== 1 ||
    !Array.isArray(data['members']) ||
    data['members'].length > groupParticipantLimit
  )
    throw new AccountError(400, 'Diretório de grupo inválido.');
  const event: GroupEvent = {
    version: 1,
    groupId: uuid(data['groupId']),
    revision: positive(data['revision']),
    epoch: positive(data['epoch']),
    previous: data['previous'] === null ? null : fingerprint(data['previous']),
    kind,
    actor: uuid(data['actor']),
    deviceId: uuid(data['deviceId']),
    directory: fingerprint(data['directory']),
    authorityRevision: positive(data['authorityRevision']),
    target: data['target'] === null ? null : uuid(data['target']),
    owner: uuid(data['owner']),
    members: data['members'].map(groupMember),
    consent: data['consent'] === null ? null : groupConsent(data['consent']),
    signature: signature(data['signature']),
  };
  if (kind === 'link-join') event.link = groupLink(data['link']);
  assertMembers(event);
  return event;
}
function groupKind(value: unknown): GroupEvent['kind'] {
  if (
    typeof value !== 'string' ||
    ![
      'create',
      'join',
      'add',
      'link-join',
      'leave',
      'remove',
      'role',
      'transfer',
      'delete',
    ].includes(value)
  )
    throw new AccountError(400, 'Alteração de grupo inválida.');
  return value as GroupEvent['kind'];
}
function assertMembers(event: GroupEvent): void {
  const ordered = event.members.map((m) => m.accountId);
  if (
    canonical(ordered) !== canonical([...new Set(ordered)].sort()) ||
    event.members.some((m) => m.joined > event.epoch)
  )
    throw new AccountError(400, 'Participação repetida ou inconsistente.');
  const owners = event.members.filter((m) => m.role === 'owner');
  if (event.kind === 'delete') {
    if (event.members.length)
      throw new AccountError(400, 'Grupo excluído ainda tem membros.');
    return;
  }
  if (owners.length !== 1 || owners[0]?.accountId !== event.owner)
    throw new AccountError(400, 'Propriedade do grupo divergente.');
}
export function groupEventProof(event: GroupEvent): string {
  const { signature: ignored, ...unsigned } = event;
  void ignored;
  return canonical(['0xdmme-group-directory', 1, unsigned]);
}
export function groupConsentProof(consent: GroupConsent): string {
  const { signature: ignored, ...unsigned } = consent;
  void ignored;
  return canonical(['0xdmme-group-consent', 1, unsigned]);
}
export async function groupEventHash(event: GroupEvent): Promise<string> {
  return digest(canonical(groupEvent(event)));
}
async function authorizedSigner(
  input: {
    actor: string;
    deviceId: string;
    directory: string;
    authorityRevision: number;
  },
  directory: DirectoryEvent,
): Promise<string> {
  const signer = directory.devices.find((d) => d.id === input.deviceId);
  if (
    !signer ||
    directory.accountId !== input.actor ||
    directory.revision !== input.authorityRevision ||
    (await eventHash(directory)) !== input.directory
  )
    throw new AccountError(403, 'Grupo sem autoridade de aparelho verificada.');
  return signer.signing;
}
export async function verifyGroupConsent(
  input: unknown,
  directory: DirectoryEvent,
): Promise<GroupConsent> {
  const consent = groupConsent(input);
  await verify(
    await authorizedSigner(consent, directory),
    consent.signature,
    groupConsentProof(consent),
  );
  return consent;
}
export function groupManager(state: GroupEvent, account: string): boolean {
  return (
    state.kind !== 'delete' &&
    state.members.some((m) => m.accountId === account && m.role !== 'member')
  );
}
function rejectTransition(): never {
  throw new AccountError(
    403,
    'Mudança de participação ou propriedade não autorizada.',
  );
}
function assertGenesis(event: GroupEvent): void {
  if (
    event.kind !== 'create' ||
    event.revision !== 1 ||
    event.epoch !== 1 ||
    event.previous !== null ||
    event.actor !== event.owner ||
    event.target !== null ||
    event.consent !== null
  )
    rejectTransition();
  if (
    canonical(event.members) !==
    canonical([{ accountId: event.owner, role: 'owner', joined: 1 }])
  )
    rejectTransition();
}
function matchingConsent(
  previous: GroupEvent,
  event: GroupEvent,
): GroupConsent {
  const consent = event.consent;
  if (
    !consent ||
    consent.groupId !== event.groupId ||
    consent.target !== event.actor ||
    !groupManager(previous, consent.actor)
  )
    rejectTransition();
  return consent;
}
function expectedJoin(previous: GroupEvent, event: GroupEvent): GroupMember[] {
  const consent = matchingConsent(previous, event);
  if (
    consent.kind !== 'invite' ||
    event.target !== event.actor ||
    previous.members.some((m) => m.accountId === event.actor)
  )
    rejectTransition();
  return [
    ...previous.members,
    { accountId: event.actor, role: 'member' as const, joined: event.epoch },
  ];
}
function expectedAdmission(
  previous: GroupEvent,
  event: GroupEvent,
): GroupMember[] {
  const issuer = event.kind === 'add' ? event.actor : event.link?.actor;
  if (
    !issuer ||
    !groupManager(previous, issuer) ||
    !event.target ||
    event.consent !== null ||
    previous.members.some((m) => m.accountId === event.target)
  )
    rejectTransition();
  if (event.kind === 'link-join' && event.target !== event.actor)
    rejectTransition();
  return [
    ...previous.members,
    { accountId: event.target, role: 'member', joined: event.epoch },
  ];
}
function expectedRemoval(
  previous: GroupEvent,
  event: GroupEvent,
): GroupMember[] {
  const target = previous.members.find((m) => m.accountId === event.target);
  if (!target || target.role === 'owner' || event.consent !== null)
    rejectTransition();
  if (event.kind === 'leave') {
    if (event.target !== event.actor) rejectTransition();
  } else if (!groupManager(previous, event.actor)) rejectTransition();
  return previous.members.filter((m) => m.accountId !== event.target);
}
function expectedRole(previous: GroupEvent, event: GroupEvent): GroupMember[] {
  const before = previous.members.find((m) => m.accountId === event.target);
  const after = event.members.find((m) => m.accountId === event.target);
  if (
    event.actor !== previous.owner ||
    !before ||
    !after ||
    before.role === 'owner' ||
    after.role === 'owner' ||
    before.role === after.role ||
    event.consent !== null
  )
    rejectTransition();
  return previous.members.map((m) =>
    m.accountId === event.target ? { ...m, role: after.role } : m,
  );
}
function expectedTransfer(
  previous: GroupEvent,
  event: GroupEvent,
): GroupMember[] {
  const consent = matchingConsent(previous, event);
  if (
    consent.kind !== 'transfer' ||
    consent.actor !== previous.owner ||
    event.target !== event.actor ||
    event.owner !== event.actor ||
    !previous.members.some(
      (m) => m.accountId === event.actor && m.role !== 'owner',
    )
  )
    rejectTransition();
  return previous.members.map((m) => {
    if (m.accountId === previous.owner)
      return { ...m, role: 'member' as const };
    if (m.accountId === event.actor) return { ...m, role: 'owner' as const };
    return m;
  });
}
function expectedDeletion(
  previous: GroupEvent,
  event: GroupEvent,
): GroupMember[] {
  if (
    event.actor !== previous.owner ||
    event.target !== null ||
    event.consent !== null
  )
    rejectTransition();
  return [];
}
function expectedMembers(
  previous: GroupEvent,
  event: GroupEvent,
): GroupMember[] {
  switch (event.kind) {
    case 'join':
      return expectedJoin(previous, event);
    case 'add':
    case 'link-join':
      return expectedAdmission(previous, event);
    case 'leave':
    case 'remove':
      return expectedRemoval(previous, event);
    case 'role':
      return expectedRole(previous, event);
    case 'transfer':
      return expectedTransfer(previous, event);
    case 'delete':
      return expectedDeletion(previous, event);
    default:
      return rejectTransition();
  }
}

/** Checks exact membership effects; eligibility and replay consumption belong to the atomic store admission. */
async function assertContinuity(
  previous: GroupEvent,
  event: GroupEvent,
): Promise<void> {
  if (
    previous.kind === 'delete' ||
    event.groupId !== previous.groupId ||
    event.revision !== previous.revision + 1 ||
    event.epoch !== previous.epoch + 1 ||
    event.previous !== (await groupEventHash(previous))
  )
    rejectTransition();
  if (event.kind !== 'transfer' && event.owner !== previous.owner)
    rejectTransition();
  const expected = expectedMembers(previous, event).sort((a, b) =>
    a.accountId.localeCompare(b.accountId),
  );
  if (canonical(event.members) !== canonical(expected)) rejectTransition();
}

interface TransitionOrigins {
  actorDirectory: DirectoryEvent;
  consentDirectory?: DirectoryEvent;
  targetDirectory?: DirectoryEvent;
  linkDirectory?: DirectoryEvent;
  linkAnchor?: GroupEvent;
}
async function verifyTransitionLink(
  event: GroupEvent,
  input: TransitionOrigins,
): Promise<void> {
  if (!event.link) return;
  const anchor = input.linkAnchor;
  if (
    !input.linkDirectory ||
    !anchor ||
    anchor.groupId !== event.groupId ||
    !groupManager(anchor, event.link.actor) ||
    (await groupEventHash(anchor)) !== event.link.head ||
    event.link.groupId !== event.groupId
  )
    rejectTransition();
  await verifyGroupLink(event.link, input.linkDirectory);
}
async function verifyTransitionConsent(
  event: GroupEvent,
  input: TransitionOrigins,
): Promise<void> {
  if (!event.consent) return;
  if (!input.consentDirectory) rejectTransition();
  await verifyGroupConsent(event.consent, input.consentDirectory);
  const target = input.targetDirectory ?? input.actorDirectory;
  if (
    target.accountId !== event.actor ||
    target.revision !== event.consent.targetRevision ||
    (await eventHash(target)) !== event.consent.targetDirectory
  )
    rejectTransition();
}
export async function verifyGroupTransition(input: {
  previous: GroupEvent | null;
  event: unknown;
  actorDirectory: DirectoryEvent;
  consentDirectory?: DirectoryEvent;
  targetDirectory?: DirectoryEvent;
  linkDirectory?: DirectoryEvent;
  linkAnchor?: GroupEvent;
}): Promise<GroupEvent> {
  const event = groupEvent(input.event),
    previous = input.previous;
  if (!previous) assertGenesis(event);
  else await assertContinuity(previous, event);
  await verifyTransitionConsent(event, input);
  await verifyTransitionLink(event, input);
  await verify(
    await authorizedSigner(event, input.actorDirectory),
    event.signature,
    groupEventProof(event),
  );
  return event;
}

/** Reentry's joined epoch replaces its former interval. Kept local/exported copies are independent. */
export function groupCanRead(
  state: GroupEvent,
  account: string,
  packetEpoch: number,
): boolean {
  const epoch = positive(packetEpoch),
    member = state.members.find((m) => m.accountId === account);
  return (
    state.kind !== 'delete' &&
    !!member &&
    epoch >= member.joined &&
    epoch <= state.epoch
  );
}

export function groupRoom(groupId: string, epoch: number): string {
  return `!group_${uuid(groupId)}_${positive(epoch)}:0xdmme.app`;
}
