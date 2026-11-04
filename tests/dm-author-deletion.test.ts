import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupParticipant } from './fixtures/group-participant.ts';
import {
  dmDeletionPacket,
  verifyDmDeletion,
} from '../src/shared/dm-deletion/index.ts';
import { messageBody } from '../src/shared/messages/index.ts';
await test('author deletion is bound to public identity, recipient, content hash and signed device history', async () => {
  const sender = await groupParticipant({ deviceName: 'Deletion contract' });
  const recipient = crypto.randomUUID(),
    id = crypto.randomUUID(),
    hash = 'a'.repeat(64);
  const unsigned = {
    deviceId: sender.deviceId,
    directory: sender.head,
    payload: { id, hash, recipient, revision: 1 },
  };
  const proof = {
    ...unsigned,
    signature: await sender.authority.sign(
      messageBody(sender.accountId, sender.deviceId, 'dm-delete', unsigned),
    ),
  };
  const packet = dmDeletionPacket({
    version: 1,
    kind: 'deleted',
    id,
    hash,
    sender: sender.accountId,
    recipient,
    senderRevision: 1,
    proof,
  });
  await verifyDmDeletion(packet, [sender.directory]);
  await assert.rejects(
    verifyDmDeletion({ ...packet, sender: crypto.randomUUID() }, [
      sender.directory,
    ]),
  );
  assert.throws(() => dmDeletionPacket({ ...packet, hash: 'b'.repeat(64) }));
  const changed = {
    ...packet,
    proof: { ...proof, payload: { ...proof.payload, hash: 'b'.repeat(64) } },
    hash: 'b'.repeat(64),
  };
  await assert.rejects(verifyDmDeletion(changed, [sender.directory]));
  assert.equal(
    JSON.stringify(packet).includes(sender.authority.session.csrf),
    false,
  );
});
