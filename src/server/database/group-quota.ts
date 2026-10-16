import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import {
  groupContentQuota,
  groupTextQuota,
  groupMediaQuota,
} from '../../shared/group-quota/index.ts';

async function groupUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<{ text: number; media: number; acceptedMedia: number }> {
  const result = await client.query<{
    text: string | null;
    media: string | null;
    accepted: string | null;
  }>(
    `SELECT q.text_bytes::text AS text,q.media_bytes::text AS media,
     q.accepted_media_bytes::text AS accepted FROM hash_talk.groups g
     LEFT JOIN hash_talk.group_quota_usage q ON q.group_id=g.id WHERE g.id=$1`,
    [groupId],
  );
  const row = result.rows[0];
  if (!row) return { text: 0, media: 0, acceptedMedia: 0 };
  const amounts = [row.text, row.media, row.accepted];
  if (
    amounts.some(
      (value) =>
        value === null ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 0,
    )
  )
    throw new Error('Cota de grupo indisponível.');
  return {
    text: Number(row.text),
    media: Number(row.media),
    acceptedMedia: Number(row.accepted),
  };
}
/** Shared group metadata/ciphertext, independent of every member's personal vault. */
export async function groupTextUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<number> {
  return (await groupUsage(client, groupId)).text;
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
  return (await groupUsage(client, groupId)).media;
}
/** Retention considers accepted media only; reservations remain charged above. */
export async function groupAcceptedMediaUsage(
  client: Pick<pg.PoolClient, 'query'>,
  groupId: string,
): Promise<number> {
  return (await groupUsage(client, groupId)).acceptedMedia;
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
