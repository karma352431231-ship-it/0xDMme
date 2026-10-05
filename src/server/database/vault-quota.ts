import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
export async function vaultUsage(
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
export async function assertContentCapacity(
  client: Pick<pg.PoolClient, 'query'>,
  capacity: number,
): Promise<void> {
  const result = await client.query<{ bytes: string }>(
    'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
  );
  const bytes = Number(result.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Contagem global indisponível.');
  if (bytes > capacity)
    throw new AccountError(
      503,
      'Capacidade global ocupada pelos dados usados ou uploads em andamento. Retome depois.',
    );
}
export async function assertVaultQuota(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
): Promise<void> {
  if ((await vaultUsage(client, accountId)) > vaultQuota)
    throw new AccountError(
      413,
      'Cofre cheio. Preserve ou exclua conteúdo antes de aceitar novos dados.',
    );
}
