import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { postPreference } from '../../shared/community-discovery/index.ts';
import type { PostPreference } from '../../shared/community-discovery/index.ts';
import { assertContentCapacity } from './vault-quota.ts';
function shouldWrite(old: PostPreference, desired: PostPreference): boolean {
  const same = old.saved === desired.saved && old.hidden === desired.hidden;
  if (old.revision === desired.revision) return !same;
  if (same && old.revision === desired.revision + 1) return false;
  throw new AccountError(
    409,
    'Preferência mudou. Recarregue antes de continuar.',
  );
}

export async function operatePostPreference(
  context: { client: pg.PoolClient; actor: { id: string } },
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<PostPreference> {
  const writing = operation === 'discovery-preference-set';
  if (!writing && operation !== 'discovery-preference')
    throw new AccountError(404, 'Preferência indisponível.');
  keys(data, writing ? ['id', 'post', 'preference'] : ['id', 'post']);
  const post = uuid(data['post']),
    community = uuid(data['id']);
  const found = await context.client.query(
    'SELECT 1 FROM hash_talk.community_posts WHERE id=$1 AND community_id=$2',
    [post, community],
  );
  if (!found.rowCount) throw new AccountError(404, 'Post indisponível.');
  const result = await context.client.query<PostPreference>(
    'SELECT saved,hidden,revision FROM hash_talk.community_post_preferences WHERE profile_id=$1 AND post_id=$2 FOR UPDATE',
    [context.actor.id, post],
  );
  const old = result.rows[0] ?? { saved: false, hidden: false, revision: 0 };
  if (!writing) return old;
  const desired = postPreference(data['preference']);
  if (!shouldWrite(old, desired)) return old;
  const saved = await context.client.query<PostPreference>(
    'INSERT INTO hash_talk.community_post_preferences(profile_id,post_id,saved,hidden,revision) VALUES($1,$2,$3,$4,1) ON CONFLICT(profile_id,post_id) DO UPDATE SET saved=EXCLUDED.saved,hidden=EXCLUDED.hidden,revision=hash_talk.community_post_preferences.revision+1 RETURNING saved,hidden,revision',
    [context.actor.id, post, desired.saved, desired.hidden],
  );
  if (!result.rowCount) await assertContentCapacity(context.client, capacity);
  return saved.rows[0]!;
}
