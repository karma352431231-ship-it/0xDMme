import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { SocialDmStore, SocialContext } from './social-dm.ts';

function messageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 16)
    throw new AccountError(400, 'Lote de confirmações inválido.');
  return [...new Set(value.map(uuid))];
}
/** Only metadata of received encrypted packets; uses the existing account read privacy/epoch. */
export class SocialReadReceipts {
  private readonly social: SocialDmStore;
  constructor(social: SocialDmStore) {
    this.social = social;
  }
  async status(authority: ContactAuthority, data: Record<string, unknown>) {
    keys(data, ['peer', 'read', 'own']);
    const peer = uuid(data['peer']),
      read = messageIds(data['read']),
      own = messageIds(data['own']);
    return this.social.withActor(authority, async (context) => {
      await this.social.requireConversation(context, peer);
      if (read.length) await this.share(context, peer, read);
      return this.own(context, own, [peer]);
    });
  }
  async preview(authority: ContactAuthority, data: Record<string, unknown>) {
    keys(data, ['own']);
    const own = messageIds(data['own']);
    return this.social.withActor(authority, async (context) => {
      const result = await context.client.query<{ recipient: string }>(
        'SELECT DISTINCT recipient FROM hash_talk.social_messages WHERE sender=$1 AND id=ANY($2::uuid[]) AND body IS NOT NULL',
        [context.actor.id, own],
      );
      const allowed = await this.social.deliveryBatch(
        context,
        result.rows.map((row) => row.recipient),
      );
      return this.own(context, own, [...allowed]);
    });
  }
  private async own(context: SocialContext, ids: string[], peers: string[]) {
    const result = await context.client.query<{
      id: string;
      received: boolean;
      read: boolean;
    }>(
      `SELECT m.id,
          EXISTS(SELECT 1 FROM hash_talk.social_receipts r WHERE r.message_id=m.id AND r.profile_id=m.recipient AND r.received) AS received,
          EXISTS(SELECT 1 FROM hash_talk.social_receipts r JOIN hash_talk.public_profiles p ON p.id=r.profile_id
            JOIN hash_talk.daily_controls d ON d.account_id=p.account_id AND d.read_receipts AND d.receipt_epoch=r.read_epoch
            WHERE r.message_id=m.id AND r.profile_id=m.recipient AND r.received) AS read
          FROM hash_talk.social_messages m WHERE m.sender=$1 AND m.recipient=ANY($2::uuid[]) AND m.id=ANY($3::uuid[]) AND m.body IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.kind='dm-message' AND pr.id=m.id
            AND pr.account_id IN ($4,(SELECT account_id FROM hash_talk.public_profiles WHERE id=m.recipient)))`,
      [context.actor.id, peers, ids, context.authority.session.accountId],
    );
    return result.rows;
  }
  private async share(
    context: SocialContext,
    peer: string,
    ids: string[],
  ): Promise<void> {
    const valid = await context.client.query(
      `SELECT m.id FROM hash_talk.social_messages m JOIN hash_talk.social_receipts r
        ON r.message_id=m.id AND r.profile_id=m.recipient AND r.device_id=$3 AND r.received
        WHERE m.recipient=$1 AND m.sender=$2 AND m.id=ANY($4::uuid[]) AND m.body IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=$5 AND pr.kind='dm-message' AND pr.id=m.id)`,
      [
        context.actor.id,
        peer,
        context.authority.session.deviceId,
        ids,
        context.authority.session.accountId,
      ],
    );
    if (valid.rowCount !== ids.length)
      throw new AccountError(
        409,
        'Leitura exige DMs recebidas e preservadas neste aparelho.',
      );
    const updated = await context.client.query<{ read_epoch: number | null }>(
      `UPDATE hash_talk.social_receipts r SET read_epoch=CASE WHEN d.read_receipts THEN d.receipt_epoch ELSE NULL END
        FROM hash_talk.daily_controls d WHERE d.account_id=$1 AND r.profile_id=$2 AND r.device_id=$3 AND r.message_id=ANY($4::uuid[])
        AND r.read_epoch IS DISTINCT FROM CASE WHEN d.read_receipts THEN d.receipt_epoch ELSE NULL END RETURNING r.read_epoch`,
      [
        context.authority.session.accountId,
        context.actor.id,
        context.authority.session.deviceId,
        ids,
      ],
    );
    if (updated.rows.some((row) => row.read_epoch !== null))
      await this.social.changed(context, [peer]);
  }
}
