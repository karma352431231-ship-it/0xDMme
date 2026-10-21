import type pg from 'pg';

/** The transaction owns both the push job and generic post-COMMIT wakeups.
 * SQL batches at most 64 account IDs per frame, even without push consent. */
async function queueRecipients(
  client: Pick<pg.PoolClient, 'query'>,
  source: { query: string; value: string },
): Promise<void> {
  await client.query(
    `WITH recipients AS MATERIALIZED (${source.query}),
    pushed AS (
      UPDATE hash_talk.push_subscriptions s SET pending=true,generation=generation+1,attempts=0,next_attempt=now()
      WHERE EXISTS(SELECT 1 FROM recipients r WHERE r.account_id=s.account_id) RETURNING s.account_id
    ), batches AS (
      SELECT account_id,(row_number() OVER(ORDER BY account_id)-1)/64 AS batch FROM recipients
    ) SELECT pg_notify('hash_talk_content_changes',json_build_object(
      'accounts',json_agg(account_id),'removed',false,'authorization',false,'categories',json_build_array('activity'))::text)
      FROM batches GROUP BY batch`,
    [source.value],
  );
}
export function queueReplyNotice(
  client: Pick<pg.PoolClient, 'query'>,
  recipient: string,
): Promise<void> {
  return queueRecipients(client, {
    query: 'SELECT account_id FROM hash_talk.public_profiles WHERE id=$1',
    value: recipient,
  });
}
export function queueWatchedPost(
  client: Pick<pg.PoolClient, 'query'>,
  author: string,
): Promise<void> {
  return queueRecipients(client, {
    query: `SELECT pp.account_id FROM hash_talk.public_profile_follows f JOIN hash_talk.public_profiles pp ON pp.id=f.follower
      WHERE f.target=$1 AND f.following AND f.notifications
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=f.follower AND b.target=$1) OR (b.actor=$1 AND b.target=f.follower)))`,
    value: author,
  });
}

/** In-app Activity only; no new Web Push subscription or delivery consent. */
export async function wakePublicActivity(
  client: Pick<pg.PoolClient, 'query'>,
  recipient: string,
): Promise<void> {
  await client.query(
    `SELECT pg_notify('hash_talk_content_changes',json_build_object('accounts',json_build_array(account_id),'removed',false,'authorization',false,'categories',json_build_array('activity'))::text) FROM hash_talk.public_profiles WHERE id=$1`,
    [recipient],
  );
}
