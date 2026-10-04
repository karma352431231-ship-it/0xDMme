import type pg from 'pg';
/** All upload domains share the existing operational budget; accepted media is governed by its vault quota. */
export async function pendingMedia(
  client: pg.PoolClient,
  accountId: string,
): Promise<{ personal: number; global: number }> {
  const result = await client.query<{ personal: number; global: number }>(
    `WITH pending AS (SELECT sender AS account FROM hash_talk.message_attachments WHERE status IN ('reserved','writing','ready')
      UNION ALL SELECT sender FROM hash_talk.group_media WHERE status IN ('reserved','writing','ready')
      UNION ALL SELECT author FROM hash_talk.status_media WHERE status IN ('reserved','writing','ready'))
      SELECT count(*) FILTER(WHERE account=$1)::integer AS personal,count(*)::integer AS global FROM pending`,
    [accountId],
  );
  const counts = result.rows[0];
  if (!counts) throw new Error('Contagem de uploads indisponível.');
  return counts;
}
