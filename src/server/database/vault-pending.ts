import type pg from 'pg';

/** A bounded preview is independent of admission; always include the local draft. */
export async function pendingVaultCommits(
  client: Pick<pg.PoolClient, 'query'>,
  input: { accountId: string; pendingId: string | null },
): Promise<unknown[]> {
  const preferred = input.pendingId
    ? await client.query<{ commit: unknown }>(
        "SELECT commit FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2 AND state<>'accepted'",
        [input.accountId, input.pendingId],
      )
    : null;
  const preview = await client.query<{ commit: unknown }>(
    "SELECT commit FROM hash_talk.vault_operations WHERE account_id=$1 AND state<>'accepted' AND ($2::uuid IS NULL OR id<>$2) ORDER BY id LIMIT $3",
    [input.accountId, input.pendingId, preferred?.rowCount ? 3 : 4],
  );
  return [...(preferred?.rows ?? []), ...preview.rows].map((r) => r.commit);
}
