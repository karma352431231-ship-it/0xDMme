import { attachmentRefs } from '../attachments/index.ts';
import type { AttachmentRef } from '../attachments/index.ts';
import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { canonical, eventHash, fingerprint, verify } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { bytesHash } from '../vault/index.ts';
import { matrixBase64, matrixCiphertext } from './format.ts';
import { matrixBinding, verifyMatrixBinding } from './matrix.ts';
import type { MatrixBinding } from './matrix.ts';
export {
  matrixBase64,
  matrixCiphertext,
  matrixUser,
  messageRoom,
} from './format.ts';
export {
  matrixBinding,
  matrixBindingProof,
  matrixDeviceKeys,
  matrixOneTimeKey,
  verifyMatrixBinding,
} from './matrix.ts';
export type { MatrixBinding, MatrixDeviceKeys } from './matrix.ts';

export const messagePageSize = 16;
export interface RecoveryKey {
  version: 1;
  id: string;
  accountId: string;
  deviceId: string;
  epoch: number;
  authorityRevision: number;
  directory: string;
  publicKey: string;
  capsule: { hash: string; bytes: number; ciphertext: string };
  signature: string;
}
export interface RoomKeyArchive {
  accountId: string;
  keyId: string;
  ciphertext: string;
  ephemeral: string;
  mac: string;
}
export interface MessagePacket {
  kind: 'text' | 'profile' | 'attachment';
  attachments?: AttachmentRef[];
  version: 1;
  id: string;
  sender: string;
  recipient: string;
  deviceId: string;
  senderDirectory: string;
  recipientDirectory: string;
  senderRevision: number;
  recipientRevision: number;
  content: {
    algorithm: 'm.megolm.v1.aes-sha2';
    sender_key: string;
    session_id: string;
    device_id: string;
    ciphertext: string;
  };
  binding: MatrixBinding;
  archives: RoomKeyArchive[];
  signature: string;
}
export interface MessageProof {
  deviceId: string;
  directory: string;
  payload: Record<string, unknown>;
  signature: string;
}
export function messageProof(input: unknown): MessageProof {
  const data = object(input);
  keys(data, ['deviceId', 'directory', 'payload', 'signature']);
  if (base64(data['signature'], 64).length !== 64)
    throw new AccountError(400, 'Assinatura de mensagem inválida.');
  return {
    deviceId: uuid(data['deviceId']),
    directory: fingerprint(data['directory']),
    payload: object(data['payload']),
    signature: data['signature'] as string,
  };
}
export function messageBody(
  account: string,
  device: string,
  operation: string,
  proof: Pick<MessageProof, 'directory' | 'payload'>,
): string {
  return canonical([
    '0xdmme-message-operation',
    1,
    account,
    device,
    operation,
    { directory: proof.directory, payload: proof.payload },
  ]);
}
export function messagePacket(input: unknown): MessagePacket {
  const data = object(input);
  keys(data, [
    ...(Object.hasOwn(data, 'attachments') ? ['attachments'] : []),
    'version',
    'kind',
    'id',
    'sender',
    'recipient',
    'deviceId',
    'senderDirectory',
    'recipientDirectory',
    'senderRevision',
    'recipientRevision',
    'content',
    'binding',
    'archives',
    'signature',
  ]);
  const refs =
    data['kind'] === 'attachment'
      ? attachmentRefs(data['attachments'])
      : undefined;
  if (data['kind'] !== 'attachment' && Object.hasOwn(data, 'attachments'))
    throw new AccountError(400, 'Referência fora de mensagem de anexo.');
  const content = megolmContent(data['content']);
  if (
    data['version'] !== 1 ||
    !Array.isArray(data['archives']) ||
    data['archives'].length !== 2
  )
    throw new AccountError(400, 'Pacote de mensagem inválido.');
  const sender = uuid(data['sender']),
    recipient = uuid(data['recipient']),
    deviceId = uuid(data['deviceId']);
  const archives = (data['archives'] as unknown[]).map(roomKeyArchive);
  assertDestinations({ sender, recipient, archives, deviceId, content });
  if (base64(data['signature'], 64).length !== 64)
    throw new AccountError(400, 'Assinatura de pacote inválida.');
  return {
    version: 1,
    ...(refs ? { attachments: refs } : {}),
    kind: messageKind(data['kind']),
    id: uuid(data['id']),
    sender,
    recipient,
    deviceId,
    senderDirectory: fingerprint(data['senderDirectory']),
    recipientDirectory: fingerprint(data['recipientDirectory']),
    senderRevision: positive(data['senderRevision']),
    recipientRevision: positive(data['recipientRevision']),
    content,
    binding: matrixBinding(data['binding']),
    archives,
    signature: data['signature'] as string,
  };
}
export function messageKind(value: unknown): MessagePacket['kind'] {
  if (value !== 'text' && value !== 'profile' && value !== 'attachment')
    throw new AccountError(400, 'Tipo de mensagem inválido.');
  return value;
}
function assertDestinations(c: {
  sender: string;
  recipient: string;
  archives: RoomKeyArchive[];
  deviceId: string;
  content: MessagePacket['content'];
}): void {
  const { sender, recipient, archives, deviceId, content } = c;
  if (
    sender === recipient ||
    archives[0]?.accountId !== sender ||
    archives[1]?.accountId !== recipient ||
    content.device_id !== deviceId
  )
    throw new AccountError(400, 'Destinatários de mensagem divergentes.');
}
export function megolmContent(input: unknown): MessagePacket['content'] {
  const content = object(input);
  keys(content, [
    'algorithm',
    'sender_key',
    'session_id',
    'device_id',
    'ciphertext',
  ]);
  if (content['algorithm'] !== 'm.megolm.v1.aes-sha2')
    throw new AccountError(400, 'Algoritmo de mensagem inválido.');
  return {
    algorithm: 'm.megolm.v1.aes-sha2',
    sender_key: matrixBase64(content['sender_key'], 32),
    session_id: matrixBase64(content['session_id'], 32),
    device_id: uuid(content['device_id']),
    ciphertext: matrixCiphertext(content['ciphertext']),
  };
}
export function packetProof(packet: MessagePacket): string {
  const { signature, ...unsigned } = packet;
  void signature;
  return canonical(['0xdmme-message-packet', 1, unsigned]);
}
export async function verifyPacket(
  input: unknown,
  senderEvent: DirectoryEvent,
): Promise<MessagePacket> {
  const packet = messagePacket(input);
  const signer = senderEvent.devices.find((d) => d.id === packet.deviceId);
  if (
    !signer ||
    senderEvent.accountId !== packet.sender ||
    senderEvent.revision !== packet.senderRevision ||
    (await eventHash(senderEvent)) !== packet.senderDirectory
  )
    throw new AccountError(403, 'Mensagem sem autoridade verificada.');
  await verify(signer.signing, packet.signature, packetProof(packet));
  const binding = await verifyMatrixBinding(packet.binding, senderEvent);
  if (
    binding.accountId !== packet.sender ||
    binding.deviceId !== packet.deviceId ||
    binding.public.keys[`curve25519:${packet.deviceId}`] !==
      packet.content.sender_key
  )
    throw new AccountError(403, 'Chave Matrix de origem divergente.');
  return packet;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 128
  )
    throw new AccountError(400, 'Época de recuperação inválida.');
  return value;
}
export function recoveryKey(input: unknown): RecoveryKey {
  const data = object(input);
  keys(data, [
    'version',
    'id',
    'accountId',
    'deviceId',
    'epoch',
    'authorityRevision',
    'directory',
    'publicKey',
    'capsule',
    'signature',
  ]);
  if (data['version'] !== 1)
    throw new AccountError(400, 'Versão de recuperação inválida.');
  const capsule = object(data['capsule']);
  keys(capsule, ['hash', 'bytes', 'ciphertext']);
  const ciphertext = base64(capsule['ciphertext'], 1024);
  if (ciphertext.length < 29 || capsule['bytes'] !== ciphertext.length)
    throw new AccountError(400, 'Cápsula de recuperação inválida.');
  if (base64(data['signature'], 64).length !== 64)
    throw new AccountError(400, 'Assinatura de recuperação inválida.');
  return {
    version: 1,
    id: uuid(data['id']),
    accountId: uuid(data['accountId']),
    deviceId: uuid(data['deviceId']),
    epoch: positive(data['epoch']),
    authorityRevision: positive(data['authorityRevision']),
    directory: fingerprint(data['directory']),
    publicKey: matrixBase64(data['publicKey'], 32),
    capsule: {
      hash: fingerprint(capsule['hash']),
      bytes: ciphertext.length,
      ciphertext: capsule['ciphertext'] as string,
    },
    signature: data['signature'] as string,
  };
}
export function recoveryKeyProof(key: RecoveryKey): string {
  const { signature, ...unsigned } = key;
  void signature;
  return canonical(['0xdmme-message-recovery', 1, unsigned]);
}
export async function verifyRecoveryKey(
  input: unknown,
  event: DirectoryEvent,
): Promise<RecoveryKey> {
  const key = recoveryKey(input);
  const device = event.devices.find((d) => d.id === key.deviceId);
  if (
    !device ||
    key.accountId !== event.accountId ||
    key.epoch !== event.epoch ||
    key.authorityRevision !== event.revision ||
    key.directory !== (await eventHash(event))
  )
    throw new AccountError(
      403,
      'Chave de recuperação sem autoridade verificada.',
    );
  if (
    (await bytesHash(base64(key.capsule.ciphertext, 1024))) !== key.capsule.hash
  )
    throw new AccountError(400, 'Cápsula de recuperação corrompida.');
  await verify(device.signing, key.signature, recoveryKeyProof(key));
  return key;
}
export function roomKeyArchive(input: unknown): RoomKeyArchive {
  const data = object(input);
  keys(data, ['accountId', 'keyId', 'ciphertext', 'ephemeral', 'mac']);
  const ciphertext = matrixCiphertext(data['ciphertext'], 8192);
  return {
    accountId: uuid(data['accountId']),
    keyId: uuid(data['keyId']),
    ciphertext,
    ephemeral: matrixBase64(data['ephemeral'], 32),
    mac: matrixBase64(data['mac'], 8),
  };
}
