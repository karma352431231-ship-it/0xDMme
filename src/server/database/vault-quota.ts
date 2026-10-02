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
