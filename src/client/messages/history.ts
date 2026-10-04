export { pinFor } from '../peer-identity/index.ts';
export type { PeerPin } from '../peer-identity/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verify,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  messageBody,
  messageKind,
  messageProof,
  messagePageSize,
  messagePacket,
} from '../../shared/messages/index.ts';
import type {
  MessageProof,
  MessagePacket,
} from '../../shared/messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { messageRelation } from '../../shared/daily/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
export interface MessageItem {
  relation?: MessageRelation;
  deletion_account?: string;
  removal_id?: string;
  removal_hash?: string;
  kind: 'text' | 'profile' | 'attachment';
  id: string;
  sender: string;
  recipient: string;
  sequence: number;
  hash: string;
  deleted: boolean;
  deletion: MessageProof | null;
  removal?: MessageProof | null;
  removal_sequence?: number;
  sender_revision: number;
  recipient_revision: number;
  queue_active: boolean;
  status: 'pending' | 'received' | 'revoked' | null;
}
/** A root deletion cannot graft its valid proof onto an unrelated cached packet. */
export function assertRemovalIdentity(
  item: Pick<MessageItem, 'id' | 'hash' | 'relation'>,
  cached: { id: string; hash: string; relation?: MessageRelation } | null,
): void {
  if (!cached) return;
  if (
    cached.id !== item.id ||
    cached.hash !== item.hash ||
    canonical(cached.relation ?? null) !== canonical(item.relation ?? null)
  )
    throw new Error('Exclusão divergente da mensagem já autenticada.');
}
/** JSON object order is not preserved by the transport/database. Normalize
 * through the shared packet contract before binding it to the signed index. */
export async function indexedPacket(
  input: unknown,
  item: Pick<MessageItem, 'id' | 'hash'>,
): Promise<MessagePacket> {
  const packet = messagePacket(input);
  if (
    packet.id !== item.id ||
    (await digest(JSON.stringify(packet))) !== item.hash
  )
    throw new Error('Mensagem divergente do índice.');
  return packet;
}
export type { Api } from '../peer-identity/index.ts';
export { peerHistory } from '../peer-identity/index.ts';
export function messageItems(
  input: unknown,
  maximum = messagePageSize,
): {
  items: MessageItem[];
  next: number | null;
} {
  const data = object(input),
    raw = data['items'];
  if (!Array.isArray(raw) || raw.length > maximum)
    throw new Error('Índice de mensagens inválido.');
  const items = raw.map((value) => {
    const row = object(value);
    if (
      typeof row['deleted'] !== 'boolean' ||
      typeof row['queue_active'] !== 'boolean' ||
      !['pending', 'received', 'revoked', null].includes(
        row['status'] as string | null,
      )
    )
      throw new Error('Estado de mensagem inválido.');
    return {
      ...(row['relation'] == null
        ? {}
        : { relation: messageRelation(row['relation']) }),
      ...(row['deletion_account'] == null
        ? {}
        : { deletion_account: uuid(row['deletion_account']) }),
      ...(row['removal_id'] == null
        ? {}
        : {
            removal_id: uuid(row['removal_id']),
            removal_hash: fingerprint(row['removal_hash']),
          }),
      kind: messageKind(row['kind']),
      id: uuid(row['id']),
      sender: uuid(row['sender']),
      recipient: uuid(row['recipient']),
      sequence: integer(row['sequence'], Number.MAX_SAFE_INTEGER),
      hash: fingerprint(row['hash']),
      deleted: row['deleted'],
      deletion: row['deletion'] === null ? null : messageProof(row['deletion']),
      removal: row['removal'] == null ? null : messageProof(row['removal']),
      removal_sequence:
        row['removal_sequence'] == null
          ? 0
          : integer(Number(row['removal_sequence']), Number.MAX_SAFE_INTEGER),
      sender_revision: integer(row['sender_revision'], 128),
      recipient_revision: integer(row['recipient_revision'], 128),
      queue_active: row['queue_active'],
      status: row['status'] as MessageItem['status'],
    };
  });
  return {
    items,
    next:
      data['next'] === null
        ? null
        : integer(data['next'], Number.MAX_SAFE_INTEGER),
  };
}
export async function verifyDeletion(
  item: MessageItem,
  history: DirectoryEvent[],
): Promise<void> {
  const proof = item.deletion,
    revision = Number(proof?.payload['revision']),
    event = history[revision - 1],
    device = event?.devices.find((d) => d.id === proof?.deviceId);
  if (
    !proof ||
    !event ||
    !device ||
    event.accountId !== (item.deletion_account ?? item.sender) ||
    (await eventHash(event)) !== proof.directory ||
    !validDeletionTarget(item, proof)
  )
    throw new Error('Exclusão não autenticada.');
  await verify(
    device.signing,
    proof.signature,
    messageBody(event.accountId, proof.deviceId, 'delete', proof),
  );
}
function validDeletionTarget(item: MessageItem, proof: MessageProof): boolean {
  if (proof.payload['id'] === item.id)
    return proof.payload['hash'] === item.hash;
  const relation = item.relation;
  if (!relation) return false;
  return (
    relation.id === proof.payload['id'] &&
    relation.hash === proof.payload['hash'] &&
    relation.author === item.deletion_account
  );
}
