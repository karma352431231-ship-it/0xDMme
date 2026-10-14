import type pg from 'pg';
import { AccountError, uuid } from '../../shared/account/index.ts';
import { publicModerationDetails } from '../../shared/moderation-details/index.ts';
import { postReviewContext } from './community-post-review-context.ts';

/** Owner was authenticated by the public-profile module in this transaction. */
export async function readModerationDetails(
  client: pg.PoolClient,
  input: { owner: string; id: string },
) {
  const result = await client.query<{
    value: Record<string, unknown>;
    kind: string;
    target: string;
  }>(
    `SELECT kind,target,json_build_object(
      'notice',json_build_object('id',id,'kind',kind,'target',target,'status',status,
        'createdAt',created_at,'expiresAt',expires_at,'appeal',appeal,'decision',decision,
        'afterPublication',publication_phase='after','warning',warned_at IS NOT NULL,
        'unreviewed',publication_mode='unreviewed'),
      'policy',policy,'automaticVerdict',automatic_verdict,'frames',frames) AS value
     FROM hash_talk.public_moderation WHERE id=$1 AND owner=$2`,
    [uuid(input.id), uuid(input.owner)],
  );
  const row = result.rows[0];
  if (!row)
    throw new AccountError(404, 'Análise indisponível para esta conta.');
  const post =
    row.kind === 'post-media'
      ? await postReviewContext(client, {
          owner: input.owner,
          media: row.target,
        })
      : null;
  return publicModerationDetails({ ...row.value, post });
}
