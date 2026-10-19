import { createHash } from 'node:crypto';
import type pg from 'pg';
import { postObservations } from '../../shared/community-views/index.ts';
import type { ContactStore } from './contacts.ts';
import type { ContentCapacity } from './content-capacity.ts';
import { visiblePost } from './community-post-visibility.ts';
import { assertContentCapacity } from './vault-quota.ts';
import { aggregateRetention } from './post-ranking-signals.ts';

/** Anonymous click receipts are separate from persistent public repost relations. */
export async function receiveShareClicks(
  input: unknown,
  context: { contacts: ContactStore; capacity: ContentCapacity },
): Promise<{ accepted: true }> {
  const items = postObservations(input).map((item) => ({
    ...item,
    hash: createHash('sha256')
      .update(`${item.post}:${item.token}`)
      .digest('hex'),
  }));
  await context.contacts.withMaintenance(async (client) => {
    await client.query(
      `SELECT id FROM hash_talk.community_posts WHERE id=ANY($1::uuid[])
      OR id IN(SELECT root_id FROM hash_talk.community_posts WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE`,
      [items.map((i) => i.post)],
    );
    const inserted = await client.query(
      `INSERT INTO hash_talk.community_share_clicks(post_id,token_hash)
      SELECT p.id,i.hash FROM jsonb_to_recordset($1::jsonb) i(community uuid,post uuid,hash text)
      JOIN hash_talk.community_posts p ON p.id=i.post AND p.community_id=i.community
      LEFT JOIN hash_talk.community_posts root ON root.id=p.root_id
      WHERE ${visiblePost('p')} AND (p.root_id IS NULL OR (${visiblePost('root')}))
      ON CONFLICT DO NOTHING`,
      [JSON.stringify(items)],
    );
    if (inserted.rowCount)
      await assertContentCapacity(client, context.capacity);
  });
  return { accepted: true };
}
/** Source retention shares the producer's cutoff, including interrupted rounds. */
export async function collectPostSignals(
  client: Pick<pg.PoolClient, 'query'>,
  cutoff: Date,
): Promise<void> {
  await client.query(
    `DELETE FROM hash_talk.community_post_engagement WHERE (post_id,at) IN
    (SELECT post_id,at FROM hash_talk.community_post_engagement WHERE at<$1::timestamptz-${aggregateRetention} ORDER BY at LIMIT 256)`,
    [cutoff],
  );
  await client.query(
    `DELETE FROM hash_talk.community_share_clicks WHERE (post_id,token_hash) IN
    (SELECT post_id,token_hash FROM hash_talk.community_share_clicks WHERE at<$1::timestamptz-interval '720 hours' ORDER BY at LIMIT 256)`,
    [cutoff],
  );
}
