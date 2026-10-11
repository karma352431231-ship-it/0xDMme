import type pg from 'pg';
import { groupLink } from '../../shared/groups/links.ts';
import type { GroupLink } from '../../shared/groups/links.ts';

export async function storedGroupLink(
  client: pg.PoolClient,
  groupId: string,
): Promise<GroupLink | null> {
  const result = await client.query<{ proof: unknown }>(
    'SELECT proof FROM hash_talk.group_links WHERE group_id=$1 FOR UPDATE',
    [groupId],
  );
  return result.rows[0] ? groupLink(result.rows[0].proof) : null;
}
export async function saveGroupLink(
  client: pg.PoolClient,
  link: GroupLink,
): Promise<void> {
  const proof = JSON.stringify(link);
  await client.query(
    'INSERT INTO hash_talk.group_links(group_id,proof,charge) VALUES($1,$2::jsonb,$3) ON CONFLICT(group_id) DO UPDATE SET proof=excluded.proof,charge=excluded.charge WHERE hash_talk.group_links.proof<>excluded.proof',
    [link.groupId, proof, Buffer.byteLength(proof) + 512],
  );
}
export async function deleteGroupLink(
  client: pg.PoolClient,
  groupId: string,
): Promise<void> {
  await client.query('DELETE FROM hash_talk.group_links WHERE group_id=$1', [
    groupId,
  ]);
}
export async function groupLinkUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<number> {
  const result = await client.query<{ charge: number }>(
    'SELECT charge FROM hash_talk.group_links WHERE group_id=$1',
    [groupId],
  );
  return result.rows[0]?.charge ?? 0;
}
