import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import {
  groupContentQuota,
  groupTextQuota,
  groupMediaQuota,
} from '../../shared/group-quota/index.ts';

/** Shared group metadata/ciphertext, independent of every member's personal vault. */
export async function groupTextUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<number> {
  const rows = await client.query<{ bytes: string }>(
    `SELECT (
    coalesce((SELECT sum(charge) FROM hash_talk.group_events WHERE group_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_members WHERE group_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_consents WHERE group_id=$1),0)
    + coalesce((SELECT charge FROM hash_talk.groups WHERE id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_key_sets WHERE group_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_packets WHERE group_id=$1),0)
    + coalesce((SELECT sum(charge) FROM hash_talk.group_matrix_envelopes WHERE group_id=$1),0)
    + coalesce((SELECT sum(text_charge) FROM hash_talk.group_media WHERE group_id=$1),0)
    + coalesce((SELECT charge FROM hash_talk.group_cleanups WHERE group_id=$1),0)
    )::text AS bytes`,
    [groupId],
  );
  const bytes = Number(rows.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Cota de grupo indisponível.');
  return bytes;
}
export async function assertGroupTextQuota(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<void> {
  if ((await groupTextUsage(client, groupId)) > groupTextQuota)
    throw new AccountError(413, 'Cota de texto/controle do grupo cheia.');
}
export async function assertGroupContentQuota(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<void> {
  if ((await groupTextUsage(client, groupId)) > groupContentQuota)
    throw new AccountError(
      413,
      'Espaço de conteúdo do grupo cheio. A margem restante é administrativa.',
    );
}
export async function groupMediaUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<number> {
  const result = await client.query<{ bytes: string }>(
    'SELECT coalesce(sum(bytes),0)::text AS bytes FROM hash_talk.group_media WHERE group_id=$1',
    [groupId],
  );
  const bytes = Number(result.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Cota de mídia indisponível.');
  return bytes;
}
export async function assertGroupMediaQuota(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<void> {
  if ((await groupMediaUsage(client, groupId)) > groupMediaQuota)
    throw new AccountError(
      413,
      'Cota de mídia do grupo cheia. Aguarde a limpeza ou exporte e limpe o cofre.',
    );
}
