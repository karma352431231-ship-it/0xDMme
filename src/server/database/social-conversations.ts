import type pg from 'pg';
import type { SocialRelation } from '../../shared/social-dm/index.ts';

export interface SocialRelationRow {
  lo: string;
  hi: string;
  requester: string;
  state: SocialRelation['state'];
  revision: string;
}

/** The caller holds social admission and has checked identity and bilateral blocks. */
export async function openSocialConversation(input: {
  client: pg.PoolClient;
  actor: string;
  peer: string;
}): Promise<{ row: SocialRelationRow; changed: boolean; created: boolean }> {
  const { client, actor, peer } = input;
  const opened = await client.query<SocialRelationRow>(
    `INSERT INTO hash_talk.social_relations(lo,hi,requester,state,revision)
      VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved',1)
      ON CONFLICT(lo,hi) DO UPDATE SET state='approved',revision=hash_talk.social_relations.revision+1
      WHERE hash_talk.social_relations.state<>'approved'
      RETURNING lo,hi,requester,state,revision::text`,
    [actor, peer],
  );
  const row =
    opened.rows[0] ??
    (
      await client.query<SocialRelationRow>(
        'SELECT lo,hi,requester,state,revision::text FROM hash_talk.social_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
        [actor, peer],
      )
    ).rows[0];
  if (!row) throw new Error('Conversa de DM não confirmada.');
  return {
    row,
    changed: Boolean(opened.rowCount),
    created: Boolean(opened.rowCount) && row.revision === '1',
  };
}
