import type pg from 'pg';

type Reader = Pick<pg.PoolClient, 'query'>;
/** Current attachments only: replacing a refused file can restore publication.
 * Keep a removed media row's review effective after its bytes are collected. */
export function blockedPost(alias: string): string {
  if (!/^[a-z]+$/u.test(alias)) throw new Error('Invalid post alias.');
  return `hash_talk.public_post_media_blocked(${alias}.media_ids)`;
}
export function visiblePost(alias: string): string {
  if (!/^[a-z]+$/u.test(alias)) throw new Error('Invalid post alias.');
  return `hash_talk.public_post_is_visible(${alias}.deleted,${alias}.active_removal,${alias}.media_ids)`;
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
