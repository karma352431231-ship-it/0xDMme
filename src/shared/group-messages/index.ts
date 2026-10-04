import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { attachmentRefs } from '../attachments/index.ts';
import type { AttachmentRef } from '../attachments/index.ts';
import { revision } from '../contacts/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verify,
} from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import {
  groupCanRead,
  groupEventHash,
  groupParticipantLimit,
} from '../groups/index.ts';
import type { GroupEvent } from '../groups/index.ts';
import {
  matrixBinding,
  megolmContent,
  roomKeyArchive,
  matrixBase64,
  verifyMatrixBinding,
} from '../messages/index.ts';
import type {
  MatrixBinding,
  MessagePacket,
  RoomKeyArchive,
} from '../messages/index.ts';

export interface GroupDestination {
  accountId: string;
  directory: string;
  authorityRevision: number;
}
// Even 200 accounts with 32 devices fit in thirteen bounded key/send batches.
// These are transport budgets, independent of participation eligibility.
export const groupDeviceBatchSize = 512;
export interface GroupPacket {
  version: 1;
  id: string;
  groupId: string;
  head: string;
  epoch: number;
  kind: 'text' | 'attachment' | 'profile';
  sender: string;
  deviceId: string;
  binding: MatrixBinding;
  content: MessagePacket['content'];
  keyHash: string;
  directory: string;
  authorityRevision: number;
  attachments?: AttachmentRef[];
  signature: string;
}
/** One signed recovery bundle per Megolm session/audience, referenced by messages. */
export interface GroupKeys {
  version: 1;
  groupId: string;
  head: string;
  epoch: number;
  sender: string;
  deviceId: string;
  sessionId: string;
  binding: MatrixBinding;
  destinations: GroupDestination[];
  archives: RoomKeyArchive[];
  signature: string;
}
export interface GroupEncryptedMessage {
  packet: GroupPacket;
  keys: GroupKeys;
}
function positive(value: unknown): number {
  const number = revision(value);
  if (!number) throw new AccountError(400, 'Época ou revisão inválida.');
  return number;
}
export function groupDestination(value: unknown): GroupDestination {
  const data = object(value);
  keys(data, ['accountId', 'directory', 'authorityRevision']);
  return {
    accountId: uuid(data['accountId']),
    directory: fingerprint(data['directory']),
    authorityRevision: positive(data['authorityRevision']),
  };
}
export function groupPacket(value: unknown): GroupPacket {
  const data = object(value);
  keys(data, [
    'version',
    'id',
    'groupId',
    'head',
    'epoch',
    'kind',
    'sender',
    'deviceId',
    'binding',
    'content',
    'keyHash',
    'directory',
    'authorityRevision',
    'signature',
    ...(data['kind'] === 'attachment' ? ['attachments'] : []),
  ]);
  if (
    data['version'] !== 1 ||
    (data['kind'] !== 'text' &&
      data['kind'] !== 'attachment' &&
      data['kind'] !== 'profile')
  )
    throw new AccountError(400, 'Pacote de grupo inválido.');
  const packet: GroupPacket = {
    version: 1,
    id: uuid(data['id']),
    groupId: uuid(data['groupId']),
    head: fingerprint(data['head']),
    epoch: positive(data['epoch']),
    kind: data['kind'],
    sender: uuid(data['sender']),
    deviceId: uuid(data['deviceId']),
    binding: matrixBinding(data['binding']),
    content: megolmContent(data['content']),
    keyHash: fingerprint(data['keyHash']),
    directory: fingerprint(data['directory']),
    authorityRevision: positive(data['authorityRevision']),
    signature: checkedSignature(data['signature']),
    ...(data['kind'] === 'attachment'
      ? { attachments: attachmentRefs(data['attachments']) }
      : {}),
  };
  if (packet.deviceId !== packet.content.device_id)
    throw new AccountError(
      400,
      'Destinatários ou origem de grupo divergentes.',
    );
  return packet;
}
export function groupKeys(value: unknown): GroupKeys {
  const data = object(value);
  keys(data, [
    'version',
    'groupId',
    'head',
    'epoch',
    'sender',
    'deviceId',
    'sessionId',
    'binding',
    'destinations',
    'archives',
    'signature',
  ]);
  if (data['version'] !== 1)
    throw new AccountError(400, 'Recuperação de grupo inválida.');
  const bundle: GroupKeys = {
    version: 1,
    groupId: uuid(data['groupId']),
    head: fingerprint(data['head']),
    epoch: positive(data['epoch']),
    sender: uuid(data['sender']),
    deviceId: uuid(data['deviceId']),
    sessionId: matrixBase64(data['sessionId'], 32),
    binding: matrixBinding(data['binding']),
    destinations: destinations(data['destinations']),
    archives: archives(data['archives']),
    signature: checkedSignature(data['signature']),
  };
  if (
    canonical(bundle.destinations.map((d) => d.accountId)) !==
      canonical(bundle.archives.map((a) => a.accountId)) ||
    !bundle.destinations.some((d) => d.accountId === bundle.sender)
  )
    throw new AccountError(400, 'Recuperação não corresponde à audiência.');
  return bundle;
}
export function groupKeysProof(bundle: GroupKeys): string {
  const { signature, ...unsigned } = bundle;
  void signature;
  return canonical(['0xdmme-group-keys', 1, unsigned]);
}
export function groupKeysHash(bundle: GroupKeys): Promise<string> {
  return digest(canonical(bundle));
}
export async function verifyGroupKeys(
  input: unknown,
  senderEvent: DirectoryEvent,
): Promise<GroupKeys> {
  const bundle = groupKeys(input),
    sender = bundle.destinations.find((d) => d.accountId === bundle.sender);
  if (!sender) throw new AccountError(403, 'Origem da recuperação ausente.');
  await verifyOrigin(
    { ...bundle, ...sender, accountId: bundle.sender },
    senderEvent,
    groupKeysProof(bundle),
  );
  await verifyMatrixBinding(bundle.binding, senderEvent);
  if (
    bundle.binding.accountId !== bundle.sender ||
    bundle.binding.deviceId !== bundle.deviceId
  )
    throw new AccountError(403, 'Vínculo de recuperação divergente.');
  return bundle;
}
async function verifyOrigin(
  input: {
    accountId: string;
    deviceId: string;
    directory: string;
    authorityRevision: number;
    signature: string;
  },
  senderEvent: DirectoryEvent,
  proof: string,
): Promise<void> {
  const signer = senderEvent.devices.find((d) => d.id === input.deviceId);
  if (
    !signer ||
    senderEvent.accountId !== input.accountId ||
    senderEvent.revision !== input.authorityRevision ||
    (await eventHash(senderEvent)) !== input.directory
  )
    throw new AccountError(403, 'Mensagem de grupo sem autoridade verificada.');
  await verify(signer.signing, input.signature, proof);
}
function destinations(value: unknown): GroupDestination[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > groupParticipantLimit
  )
    throw new AccountError(400, 'Audiência de grupo inválida.');
  const result = value.map(groupDestination),
    accounts = result.map((d) => d.accountId);
  if (canonical(accounts) !== canonical([...new Set(accounts)].sort()))
    throw new AccountError(
      400,
      'Audiência de grupo repetida ou fora de ordem.',
    );
  return result;
}
function archives(value: unknown): RoomKeyArchive[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > groupParticipantLimit
  )
    throw new AccountError(400, 'Recuperação de grupo inválida.');
  return value.map(roomKeyArchive);
}
function checkedSignature(value: unknown): string {
  if (base64(value, 64).length !== 64)
    throw new AccountError(400, 'Assinatura de grupo inválida.');
  return value as string;
}
export function groupPacketProof(packet: GroupPacket): string {
  const { signature, ...unsigned } = packet;
  void signature;
  return canonical(['0xdmme-group-message', 1, unsigned]);
}
export async function verifyGroupPacket(
  input: unknown,
  senderEvent: DirectoryEvent,
): Promise<GroupPacket> {
  const packet = groupPacket(input);
  await verifyOrigin(
    { ...packet, accountId: packet.sender },
    senderEvent,
    groupPacketProof(packet),
  );
  const binding = await verifyMatrixBinding(packet.binding, senderEvent);
  if (
    binding.accountId !== packet.sender ||
    binding.deviceId !== packet.deviceId ||
    binding.public.keys[`curve25519:${packet.deviceId}`] !==
      packet.content.sender_key
  )
    throw new AccountError(403, 'Chave Matrix de grupo divergente.');
  return packet;
}
/** Verifies the exact event/audience used to encrypt, independently of transport routing. */
export async function assertGroupPacketPeriod(
  packet: GroupPacket,
  state: GroupEvent,
  bundle: GroupKeys,
): Promise<void> {
  if (
    state.groupId !== packet.groupId ||
    state.epoch !== packet.epoch ||
    (await groupEventHash(state)) !== packet.head ||
    !groupCanRead(state, packet.sender, packet.epoch)
  )
    throw new AccountError(403, 'Mensagem de outro período de participação.');
  await assertGroupKeysPeriod(bundle, state);
  if (
    packet.keyHash !== (await groupKeysHash(bundle)) ||
    packet.content.session_id !== bundle.sessionId ||
    packet.sender !== bundle.sender ||
    packet.deviceId !== bundle.deviceId ||
    canonical(packet.binding) !== canonical(bundle.binding)
  )
    throw new AccountError(403, 'Mensagem e recuperação de grupo divergentes.');
}
export async function assertGroupKeysPeriod(
  bundle: GroupKeys,
  state: GroupEvent,
): Promise<void> {
  if (
    bundle.groupId !== state.groupId ||
    bundle.epoch !== state.epoch ||
    bundle.head !== (await groupEventHash(state))
  )
    throw new AccountError(
      403,
      'Recuperação de outro período de participação.',
    );
  if (
    canonical(state.members.map((m) => m.accountId)) !==
    canonical(bundle.destinations.map((d) => d.accountId))
  )
    throw new AccountError(
      403,
      'Mensagem não corresponde aos membros autorizados.',
    );
}
export function groupTitle(input: unknown): string {
  const value = object(input);
  if (
    value['version'] !== 1 ||
    typeof value['title'] !== 'string' ||
    !value['title'].trim() ||
    value['title'].length > 160
  )
    throw new Error('Nome de grupo inválido.');
  return value['title'].trim();
}
