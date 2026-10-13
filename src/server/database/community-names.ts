import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
/** The unique index is the concurrency guard; expose a useful conflict message. */
export async function writeCommunityName(
  client: pg.PoolClient,
  sql: string,
  values: unknown[],
): Promise<void> {
  try {
    await client.query(sql, values);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === 'community_unique_name'
    )
      throw new AccountError(
        409,
        'Já existe uma comunidade com esse nome. Escolha outro.',
      );
    throw error;
  }
}
