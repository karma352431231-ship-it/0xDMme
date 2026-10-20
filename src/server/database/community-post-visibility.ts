import type pg from 'pg';

type Reader = Pick<pg.PoolClient, 'query'>;
/** Current attachments only: replacing a refused file can restore publication.
 * Keep a removed media row's review effective after its bytes are collected. */
export function blockedPost(alias: string): string {
  if (!/^[a-z]+$/u.test(alias)) throw new Error('Invalid post alias.');
  return `EXISTS(SELECT 1 FROM hash_talk.public_moderation pm
    WHERE pm.kind='post-media' AND pm.target=ANY(${alias}.media_ids)
      AND pm.status IN ('rejected','held','failed','discarding','expired')
      AND NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation newer
        WHERE newer.kind=pm.kind AND newer.target=pm.target AND newer.status='approved'
          AND (newer.created_at,newer.id)>(pm.created_at,pm.id)))`;
}
export function visiblePost(alias: string): string {
  return `NOT ${alias}.deleted AND ${alias}.active_removal IS NULL AND NOT ${blockedPost(alias)}`;
}
export async function blockedPosts(
  client: Reader,
  ids: string[],
): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await client.query<{ id: string }>(
    `SELECT p.id FROM hash_talk.community_posts p WHERE p.id=ANY($1::uuid[]) AND
      (${blockedPost('p')} OR EXISTS(SELECT 1 FROM hash_talk.community_posts root
        WHERE root.id=p.root_id AND NOT (${visiblePost('root')})))`,
    [ids],
  );
  return new Set(rows.rows.map((row) => row.id));
}
