import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import { vaultUsage } from './personal-quota.ts';
export { vaultUsage } from './personal-quota.ts';
export {
  lockContentUsage,
  assertContentCapacity,
  assertContentReclamationCapacity,
} from './content-capacity.ts';
export async function assertVaultQuota(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
): Promise<void> {
  if ((await vaultUsage(client, accountId)) > vaultQuota)
    throw new AccountError(
      413,
      'Vault full. Preserve or delete content before accepting new data.',
    );
}
