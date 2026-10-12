import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { postShareState } from '../../shared/post-sharing/index.ts';
import type { PostShareState } from '../../shared/post-sharing/index.ts';
import { assertContentCapacity } from './vault-quota.ts';

/** Caller owns the actor transaction/lock. CAS makes duplicate requests safe. */
export async function operatePostShare(
  context: { client: pg.PoolClient; actor: { id: string } },
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<PostShareState> {
  const writing = operation === 'discovery-share-set';
  if (!writing && operation !== 'discovery-share')
    throw new AccountError(404, 'Compartilhamento indisponível.');
  keys(data, writing ? ['id', 'post', 'state'] : ['id', 'post']);
  const post = uuid(data['post']),
    community = uuid(data['id']);
  const found = await context.client.query<{ visible: boolean }>(
    `SELECT NOT p.deleted AND p.active_removal IS NULL
      AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND NOT root.deleted AND root.active_removal IS NULL))
      AND (p.parent_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts parent WHERE parent.id=p.parent_id AND NOT parent.deleted AND parent.active_removal IS NULL))
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$3 AND (b.target=p.author OR b.target IN(SELECT ancestor.author FROM hash_talk.community_posts ancestor WHERE ancestor.id=p.parent_id OR ancestor.id=p.root_id))) OR (b.target=$3 AND b.actor=p.author))) AS visible
    FROM hash_talk.community_posts p WHERE p.id=$1 AND p.community_id=$2`,
    [post, community, context.actor.id],
  );
  if (!found.rowCount) throw new AccountError(404, 'Postagem indisponível.');
  const result = await context.client.query<PostShareState>(
    'SELECT shared,revision FROM hash_talk.community_post_shares WHERE profile_id=$1 AND post_id=$2 FOR UPDATE',
    [context.actor.id, post],
  );
  const old = result.rows[0] ?? { shared: false, revision: 0 };
  if (!writing) return old;
  const desired = postShareState(data['state']);
  if (!shouldShare(old, desired, found.rows[0]!.visible)) return old;
  const saved = await context.client.query<PostShareState>(
    `INSERT INTO hash_talk.community_post_shares(id,profile_id,post_id,shared,revision) VALUES($1,$2,$3,$4,1)
      ON CONFLICT(profile_id,post_id) DO UPDATE SET shared=$4,revision=hash_talk.community_post_shares.revision+1,
      created_at=CASE WHEN $4 THEN clock_timestamp() ELSE hash_talk.community_post_shares.created_at END RETURNING shared,revision`,
    [crypto.randomUUID(), context.actor.id, post, desired.shared],
  );
  if (!result.rowCount) await assertContentCapacity(context.client, capacity);
  return saved.rows[0]!;
}
/** One bounded read for a page; never fetch interaction state once per card. */
export async function sharedPostIds(
  client: Pick<pg.PoolClient, 'query'>,
  actor: string,
  ids: string[],
): Promise<Set<string>> {
  const rows = await client.query<{ post_id: string }>(
    'SELECT post_id FROM hash_talk.community_post_shares WHERE profile_id=$1 AND shared AND post_id=ANY($2::uuid[])',
    [actor, ids],
  );
  return new Set(rows.rows.map((row) => row.post_id));
}

function shouldShare(
  old: PostShareState,
  desired: PostShareState,
  visible: boolean,
): boolean {
  if (desired.shared && !visible)
    throw new AccountError(403, 'Postagem indisponível para compartilhar.');
  if (old.revision === desired.revision + 1 && old.shared === desired.shared)
    return false;
  if (old.revision !== desired.revision)
    throw new AccountError(409, 'O compartilhamento mudou. Recarregue.');
  return old.shared !== desired.shared;
}
