import type pg from 'pg';

/** The pre-counter personal quota contract, retained as an independent regression oracle. */
export async function referenceVaultUsage(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
): Promise<number> {
  const result = await client.query<{ bytes: string }>(
    `SELECT (
    coalesce((SELECT sum(charge) FROM hash_talk.vault_operations WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.organizations WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.representative_credentials WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.organization_domains WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.daily_controls WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.message_reads WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.conversation_controls WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.device_presence WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.push_subscriptions WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.push_controls WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.call_controls WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.message_attachments WHERE (sender=$1 OR recipient=$1) AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=$1 AND r.kind='message' AND r.id=message_id)),0)
    + coalesce((SELECT sum(charge-retained_bytes) FROM hash_talk.personal_removals WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.message_recovery_keys WHERE account_id=$1),0)
    + coalesce((SELECT sum(sender_charge) FROM hash_talk.message_packets WHERE sender=$1),0)
    + coalesce((SELECT sum(recipient_charge) FROM hash_talk.message_packets WHERE recipient=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.matrix_devices WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.matrix_one_time_keys WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.matrix_envelopes WHERE account_id=$1),0)
    + coalesce((SELECT sum(s.charge) FROM (
      SELECT profile_id AS profile,charge FROM hash_talk.social_directories
      UNION ALL SELECT profile_id,charge FROM hash_talk.social_recovery
      UNION ALL SELECT profile_id,charge FROM hash_talk.social_matrix_devices
      UNION ALL SELECT profile_id,charge FROM hash_talk.social_matrix_keys
      UNION ALL SELECT recipient,charge FROM hash_talk.social_matrix_envelopes
      UNION ALL SELECT profile_id,charge FROM hash_talk.social_personal_secrets
      UNION ALL SELECT sender,sender_charge FROM hash_talk.social_media
      UNION ALL SELECT recipient,recipient_charge FROM hash_talk.social_media
      UNION ALL SELECT sender,sender_charge FROM hash_talk.social_messages
      UNION ALL SELECT recipient,recipient_charge FROM hash_talk.social_messages
    ) s JOIN hash_talk.public_profiles p ON p.id=s.profile WHERE p.account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_controls WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_reads WHERE account_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.status_posts WHERE author=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.status_recipients WHERE author=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.status_pages WHERE author=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.status_media WHERE author=$1),0)
    + coalesce((SELECT octet_length(profile_ciphertext)+12+512 FROM hash_talk.accounts WHERE id=$1),0)
    )::text AS bytes`,
    [accountId],
  );
  const bytes = Number(result.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes)) throw new Error('Cota indisponível.');
  return bytes;
}
