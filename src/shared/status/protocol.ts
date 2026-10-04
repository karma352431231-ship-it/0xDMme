import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verify,
} from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { attachmentRefs } from '../attachments/index.ts';
import type { AttachmentRef } from '../attachments/index.ts';
import { integer } from '../vault/index.ts';
import type { RoomKeyArchive } from '../messages/index.ts';
import {
  roomKeyArchive,
  megolmContent,
  matrixBase64,
} from '../messages/index.ts';
export interface StatusPacket {
  version: 1;
  id: string;
  author: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  kind: 'text' | 'photo';
  publishedAt: number;
  audienceHead: string;
  senderKey: string;
  signingKey: string;
  content: Record<string, unknown>;
  attachments?: AttachmentRef[];
  signature: string;
}
export interface StatusRecipient {
  accountId: string;
  directory: string;
  authorityRevision: number;
  archive: RoomKeyArchive;
}
export interface StatusEnvelope {
  version: 1;
  id: string;
  author: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  contentHash: string;
  recipient: StatusRecipient;
  signature: string;
}
function positive(input: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const result = integer(input, max);
  if (!result) throw new AccountError(400, 'Revisão de status inválida.');
  return result;
}
function bytes(input: unknown, size: number): string {
  if (base64(input, size).length !== size)
    throw new AccountError(400, 'Chave ou assinatura de status inválida.');
  return input as string;
}
export function statusPacket(input: unknown): StatusPacket {
  const d = object(input);
  keys(d, [
    'version',
    'id',
    'author',
    'deviceId',
    'directory',
    'authorityRevision',
    'kind',
    'publishedAt',
    'audienceHead',
    'senderKey',
    'signingKey',
    'content',
    'signature',
    ...(d['kind'] === 'photo' ? ['attachments'] : []),
  ]);
  if (d['version'] !== 1 || (d['kind'] !== 'text' && d['kind'] !== 'photo'))
    throw new AccountError(400, 'Status inválido.');
  const content = megolmContent(d['content']);
  if (
    content['sender_key'] !== matrixBase64(d['senderKey'], 32) ||
    content['device_id'] !== d['deviceId']
  )
    throw new AccountError(400, 'Origem de status divergente.');
  return {
    version: 1,
    id: uuid(d['id']),
    author: uuid(d['author']),
    deviceId: uuid(d['deviceId']),
    directory: fingerprint(d['directory']),
    authorityRevision: positive(d['authorityRevision'], 128),
    kind: d['kind'],
    publishedAt: integer(d['publishedAt'], Number.MAX_SAFE_INTEGER),
    audienceHead: fingerprint(d['audienceHead']),
    senderKey: matrixBase64(d['senderKey'], 32),
    signingKey: matrixBase64(d['signingKey'], 32),
    content,
    ...(d['kind'] === 'photo'
      ? { attachments: attachmentRefs(d['attachments']) }
      : {}),
    signature: bytes(d['signature'], 64),
  };
}
export function statusEnvelope(input: unknown): StatusEnvelope {
  const d = object(input);
  keys(d, [
    'version',
    'id',
    'author',
    'deviceId',
    'directory',
    'authorityRevision',
    'contentHash',
    'recipient',
    'signature',
  ]);
  if (d['version'] !== 1)
    throw new AccountError(400, 'Destinatário de status inválido.');
  const r = object(d['recipient']);
  keys(r, ['accountId', 'directory', 'authorityRevision', 'archive']);
  const recipient = {
    accountId: uuid(r['accountId']),
    directory: fingerprint(r['directory']),
    authorityRevision: positive(r['authorityRevision'], 128),
    archive: roomKeyArchive(r['archive']),
  };
  if (recipient.accountId !== recipient.archive.accountId)
    throw new AccountError(400, 'Destinatário de status divergente.');
  return {
    version: 1,
    id: uuid(d['id']),
    author: uuid(d['author']),
    deviceId: uuid(d['deviceId']),
    directory: fingerprint(d['directory']),
    authorityRevision: positive(d['authorityRevision'], 128),
    contentHash: fingerprint(d['contentHash']),
    recipient,
    signature: bytes(d['signature'], 64),
  };
}
export function statusEnvelopes(input: unknown): StatusEnvelope[] {
  if (!Array.isArray(input) || !input.length || input.length > 16)
    throw new AccountError(400, 'Página de destinatários inválida.');
  const result = input.map(statusEnvelope);
  if (new Set(result.map((r) => r.recipient.accountId)).size !== result.length)
    throw new AccountError(400, 'Destinatário repetido.');
  return result;
}
function proof(domain: string, input: StatusPacket | StatusEnvelope): string {
  const { signature: ignored, ...body } = input;
  void ignored;
  return canonical([domain, 1, body]);
}
export function statusPacketProof(packet: StatusPacket): string {
  return proof('0xdmme-status', packet);
}
export function statusEnvelopeProof(envelope: StatusEnvelope): string {
  return proof('0xdmme-status-recipient', envelope);
}
export async function statusEnvelopeHash(
  envelope: StatusEnvelope,
): Promise<string> {
  return digest(canonical(statusEnvelope(envelope)));
}
/** Publication transcript is private to the author; readers receive only their own signed capsule. */
export async function statusAudienceHead(
  previous: string | null,
  envelopes: StatusEnvelope[],
): Promise<string> {
  return digest(
    canonical([previous, await Promise.all(envelopes.map(statusEnvelopeHash))]),
  );
}
async function signing(
  input: StatusPacket | StatusEnvelope,
  event: DirectoryEvent,
): Promise<string> {
  const signer = event.devices.find((d) => d.id === input.deviceId);
  if (
    !signer ||
    event.accountId !== input.author ||
    event.revision !== input.authorityRevision ||
    (await eventHash(event)) !== input.directory
  )
    throw new AccountError(403, 'Status sem autoridade de origem.');
  return signer.signing;
}
export async function verifyStatusPacket(
  input: unknown,
  event: DirectoryEvent,
): Promise<StatusPacket> {
  const packet = statusPacket(input);
  await verify(
    await signing(packet, event),
    packet.signature,
    statusPacketProof(packet),
  );
  return packet;
}
export async function verifyStatusEnvelope(
  input: unknown,
  event: DirectoryEvent,
): Promise<StatusEnvelope> {
  const envelope = statusEnvelope(input);
  await verify(
    await signing(envelope, event),
    envelope.signature,
    statusEnvelopeProof(envelope),
  );
  return envelope;
}
export function statusRoom(id: string): string {
  return `!status_${uuid(id)}:0xdmme.app`;
}
