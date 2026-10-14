import { AccountError, keys, object, uuid } from '../account/index.ts';
import { eventHash, fingerprint, verify } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { messageBody, messageProof } from '../messages/index.ts';
import type { MessageRelation } from '../daily/index.ts';
import { integer } from '../vault/index.ts';

export function groupDeletion(input: unknown) {
  const value = object(input);
  keys(value, ['type', 'accountId', 'proof']);
  if (value['type'] !== 'message')
    throw new AccountError(400, 'Exclusão de grupo inválida.');
  return {
    type: 'message' as const,
    accountId: uuid(value['accountId']),
    proof: messageProof(value['proof']),
  };
}
export async function verifyGroupDeletion(
  input: unknown,
  expected: {
    groupId: string;
    id: string;
    hash: string;
    sender: string;
    relation?: MessageRelation;
  },
  events: DirectoryEvent[],
): Promise<void> {
  const deletion = groupDeletion(input),
    proof = deletion.proof,
    payload = proof.payload;
  keys(payload, ['groupId', 'head', 'id', 'hash', 'revision']);
  const revision = integer(payload['revision'], 128),
    origin = events[revision - 1];
  const target = expected.relation ?? {
    id: expected.id,
    hash: expected.hash,
    author: expected.sender,
  };
  if (
    uuid(payload['groupId']) !== expected.groupId ||
    uuid(payload['id']) !== target.id ||
    fingerprint(payload['hash']) !== target.hash ||
    deletion.accountId !== target.author ||
    !origin ||
    origin.accountId !== deletion.accountId ||
    (await eventHash(origin)) !== proof.directory
  )
    throw new Error('Exclusão de outra mensagem, grupo ou autor.');
  fingerprint(payload['head']);
  const device = origin.devices.find((row) => row.id === proof.deviceId);
  if (!device) throw new Error('Exclusão sem aparelho autorizado.');
  await verify(
    device.signing,
    proof.signature,
    messageBody(
      deletion.accountId,
      proof.deviceId,
      'group-message-delete',
      proof,
    ),
  );
}
