import { AccountError, keys, object, uuid } from '../account/index.ts';
import {
  eventHash,
  fingerprint,
  verify,
  verifyHistory,
} from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { messageBody, messageProof } from '../messages/index.ts';
import type { MessageProof } from '../messages/index.ts';
import { integer } from '../vault/index.ts';

/** A compact author-signed replacement for accepted ciphertext, using only the public DM identity. */
export interface DmDeletionPacket {
  version: 1;
  kind: 'deleted';
  id: string;
  hash: string;
  sender: string;
  recipient: string;
  senderRevision: number;
  proof: MessageProof;
}
export function dmDeletionProof(input: unknown): MessageProof {
  const proof = messageProof(input);
  keys(proof.payload, ['id', 'hash', 'recipient', 'revision']);
  uuid(proof.payload['id']);
  fingerprint(proof.payload['hash']);
  uuid(proof.payload['recipient']);
  if (!integer(proof.payload['revision'], 128))
    throw new AccountError(400, 'Invalid deletion revision.');
  return proof;
}
export function dmDeletionPacket(input: unknown): DmDeletionPacket {
  const row = object(input);
  keys(row, [
    'version',
    'kind',
    'id',
    'hash',
    'sender',
    'recipient',
    'senderRevision',
    'proof',
  ]);
  const proof = dmDeletionProof(row['proof']);
  if (
    row['version'] !== 1 ||
    row['kind'] !== 'deleted' ||
    row['id'] !== proof.payload['id'] ||
    row['hash'] !== proof.payload['hash'] ||
    row['recipient'] !== proof.payload['recipient'] ||
    row['senderRevision'] !== proof.payload['revision']
  )
    throw new AccountError(400, 'Deletion does not match its signed target.');
  return {
    version: 1,
    kind: 'deleted',
    id: uuid(row['id']),
    hash: fingerprint(row['hash']),
    sender: uuid(row['sender']),
    recipient: uuid(row['recipient']),
    senderRevision: integer(row['senderRevision'], 128),
    proof,
  };
}
export async function verifyDmDeletion(
  packet: DmDeletionPacket,
  events: DirectoryEvent[],
): Promise<void> {
  const history = events.slice(0, packet.senderRevision);
  const current = await verifyHistory(history, packet.sender);
  const device = current?.devices.find(
    (device) => device.id === packet.proof.deviceId,
  );
  if (
    !current ||
    current.revision !== packet.senderRevision ||
    !device ||
    (await eventHash(current)) !== packet.proof.directory
  )
    throw new Error('Public message deletion is not authenticated.');
  await verify(
    device.signing,
    packet.proof.signature,
    messageBody(packet.sender, device.id, 'dm-delete', packet.proof),
  );
}
