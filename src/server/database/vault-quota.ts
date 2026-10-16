import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import { vaultUsage } from './personal-quota.ts';
export { vaultUsage } from './personal-quota.ts';
/** Accounting reductions also take this lock before their byte-owner rows, so
 * they cannot deadlock a post admission which already owns the global ledger. */
export async function lockContentUsage(
  client: Pick<pg.PoolClient, 'query'>,
): Promise<number> {
  const result = await client.query<{ bytes: string }>(
    'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
  );
  const bytes = Number(result.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Contagem global indisponível.');
  return bytes;
}
export async function assertContentCapacity(
  client: Pick<pg.PoolClient, 'query'>,
  capacity: number,
): Promise<void> {
  const bytes = await lockContentUsage(client);
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
