import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { SocialDmStore } from './social-dm.ts';

/** Bounded incoming metadata only. Local read cursors never leave the device. */
export async function socialUnread(input: {
  social: SocialDmStore;
  authority: ContactAuthority;
  data: Record<string, unknown>;
}): Promise<{ peer: string; sequences: number[] }[]> {
  keys(input.data, ['peers']);
  const raw = input.data['peers'];
  if (!Array.isArray(raw) || raw.length > 16)
    throw new AccountError(400, 'Invalid DM page.');
  const peers = [...new Set(raw.map(uuid))];
  return input.social.withActor(input.authority, async (context) => {
    const allowed = await input.social.deliveryBatch(context, peers);
    const result = await context.client.query<{
      peer: string;
      sequences: string[];
    }>(
      `SELECT p.peer,array_agg(messages.sequence::text) AS sequences FROM
        unnest($2::uuid[]) AS p(peer)
        CROSS JOIN LATERAL (
          SELECT m.sequence FROM hash_talk.social_messages m
          WHERE m.recipient=$1 AND m.sender=p.peer
            AND m.body IS NOT NULL AND m.body->'relation' IS NULL
            AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r
              WHERE r.account_id=$3 AND r.kind='dm-message' AND r.id=m.id)
          ORDER BY m.sequence DESC LIMIT 100
        ) messages GROUP BY p.peer`,
      [context.actor.id, [...allowed], context.authority.session.accountId],
    );
    return result.rows.map((row) => ({
      peer: row.peer,
      sequences: row.sequences.map(Number),
    }));
  });
}
