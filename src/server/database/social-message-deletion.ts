import { AccountError } from '../../shared/account/index.ts';
import {
  dmDeletionProof,
  verifyDmDeletion,
} from '../../shared/dm-deletion/index.ts';
import type { DmDeletionPacket } from '../../shared/dm-deletion/index.ts';
import type {
  MessageProof,
  MessagePacket,
} from '../../shared/messages/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { SocialDmStore } from './social-dm.ts';
import type { SocialCryptoStore } from './social-crypto.ts';

interface StoredMessage {
  hash: string;
  sender: string;
  recipient: string;
  body: MessagePacket | DmDeletionPacket | null;
  charge: number;
}
function ownTarget(
  row: StoredMessage | undefined,
  actor: string,
  proof: MessageProof,
): StoredMessage {
  if (!row || row.sender !== actor)
    throw new AccountError(404, 'Own message unavailable.');
  if (
    row.hash !== proof.payload['hash'] ||
    row.recipient !== proof.payload['recipient']
  )
    throw new AccountError(409, 'Deletion content does not match.');
  return row;
}
/** Author-only, hash-bound, idempotent deletion. Ciphertext and media leave in the participants' existing transaction. */
export class SocialMessageDeletion {
  private readonly social: SocialDmStore;
  private readonly crypto: SocialCryptoStore;
  constructor(social: SocialDmStore, crypto: SocialCryptoStore) {
    this.social = social;
    this.crypto = crypto;
  }
  async remove(authority: ContactAuthority, input: unknown): Promise<void> {
    const proof = dmDeletionProof(input),
      id = String(proof.payload['id']);
    await this.social.withMessageMutation(authority, id, async (context) => {
      const result = await context.client.query<StoredMessage>(
        'SELECT hash,sender,recipient,body,charge FROM hash_talk.social_messages WHERE id=$1 FOR UPDATE',
        [id],
      );
      const row = ownTarget(result.rows[0], context.actor.id, proof);
      if (!row.body || row.body.kind === 'deleted') return;
      if (row.body.relation)
        throw new AccountError(400, 'Select an original message.');
      const device = await this.crypto.ownDevice(context);
      const current = await this.crypto.ready(context);
      if (
        proof.deviceId !== device ||
        proof.payload['revision'] !== current.revision
      )
        throw new AccountError(409, 'DM devices changed. Try again.');
      const deletion: DmDeletionPacket = {
        version: 1,
        kind: 'deleted',
        id,
        hash: row.hash,
        sender: row.sender,
        recipient: row.recipient,
        senderRevision: current.revision,
        proof,
      };
      const history = await context.client.query<{ body: DirectoryEvent }>(
        'SELECT body FROM hash_talk.social_directories WHERE profile_id=$1 AND revision<=$2 ORDER BY revision',
        [row.sender, current.revision],
      );
      await verifyDmDeletion(
        deletion,
        history.rows.map((row) => row.body),
      );
      const body = JSON.stringify(deletion),
        charge = Buffer.byteLength(body) + 512;
      if (charge > row.charge)
        throw new Error('Deletion exceeds the accepted metadata budget.');
      const actions = await context.client.query<{ id: string }>(
        "UPDATE hash_talk.social_messages SET body=NULL,personal_collected=true,charge=512,sender_charge=0,recipient_charge=0 WHERE body->'relation'->>'id'=$1::text AND body IS NOT NULL RETURNING id",
        [id],
      );
      await context.client.query(
        'UPDATE hash_talk.social_messages SET body=$2::jsonb,charge=$3,sender_charge=least(sender_charge,$3),recipient_charge=least(recipient_charge,$3) WHERE id=$1',
        [id, body, charge],
      );
      await context.client.query(
        'DELETE FROM hash_talk.social_receipts WHERE message_id=ANY($1::uuid[])',
        [[id, ...actions.rows.map((row) => row.id)]],
      );
      await context.client.query(
        "UPDATE hash_talk.social_media SET status='deleting',writer=NULL,sender_charge=0,recipient_charge=0 WHERE message_id=$1 AND status='accepted'",
        [id],
      );
      await this.social.removalLimits(context, [row.sender, row.recipient]);
      await this.social.removed(context, [row.sender, row.recipient]);
    });
  }
}
