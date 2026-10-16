import type pg from 'pg';

/** Exact indexed counters preserve direct, profile and attachment ownership. */
export async function vaultUsage(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
): Promise<number> {
  const result = await client.query<{
    account_bytes: string | null;
    profile_id: string | null;
    profile_bytes: string | null;
    attachments: string | null;
  }>(
    `SELECT q.used_bytes::text AS account_bytes,p.id AS profile_id,pq.used_bytes::text AS profile_bytes,
     aq.used_bytes::text AS attachments
     FROM hash_talk.accounts a
     LEFT JOIN hash_talk.account_quota_usage q ON q.account_id=a.id
     LEFT JOIN hash_talk.attachment_quota_usage aq ON aq.account_id=a.id
     LEFT JOIN hash_talk.public_profiles p ON p.account_id=a.id
     LEFT JOIN hash_talk.profile_quota_usage pq ON pq.profile_id=p.id
     WHERE a.id=$1`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row) return 0;
  const profile = row.profile_id === null ? '0' : row.profile_bytes;
  const amounts = [row.account_bytes, profile, row.attachments];
  if (
    amounts.some(
      (amount) =>
        amount === null ||
        !Number.isSafeInteger(Number(amount)) ||
        Number(amount) < 0,
    )
  )
    throw new Error('Cota indisponível.');
  const bytes = amounts.reduce<number>(
    (total, amount) => total + Number(amount),
    0,
  );
  if (!Number.isSafeInteger(bytes)) throw new Error('Cota indisponível.');
  return bytes;
}
