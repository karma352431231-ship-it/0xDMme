import type pg from 'pg';
import type { MessageProof } from '../../shared/messages/index.ts';
import { recordMessageChanges } from './message-changes.ts';

/** Atomically removes automatic copies and records both owners' checkpoints.
 * The caller must authorize the sender and hold every participant lock. */
export async function deleteMessageCopies(
  client: Pick<pg.PoolClient, 'query'>,
  input: { id: string; proof: MessageProof; sender: string; recipient: string },
): Promise<void> {
  // One original and at most 64 related actions; all automatic copies leave together.
  const changed = await client.query<{ id: string }>(
    "UPDATE hash_talk.message_packets SET body=NULL,deletion=$2::jsonb,queue_active=false,sender_charge=$3,recipient_charge=$3,charge=$3,deletion_revision=$4,deletion_account=$5 WHERE (id=$1 OR relation->>'id'=$1::text) AND body IS NOT NULL RETURNING id",
    [
      input.id,
      JSON.stringify(input.proof),
      Buffer.byteLength(JSON.stringify(input.proof)) + 512,
      input.proof.payload['revision'],
      input.sender,
    ],
  );
  await client.query(
    "DELETE FROM hash_talk.message_references WHERE message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text)",
    [input.id],
  );
  await client.query(
    "DELETE FROM hash_talk.message_reads WHERE message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text)",
    [input.id],
  );
  await client.query(
    "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1 AND status='accepted'",
    [input.id],
  );
  await recordMessageChanges(
    client,
    [input.sender, input.recipient],
    changed.rows.map((item) => item.id),
    'remove',
  );
}
