import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
  communityRevision,
} from '../../shared/communities/index.ts';
import { postTagLabel } from '../../shared/community-posts/index.ts';
import type { PostTag, TagPage } from '../../shared/community-posts/index.ts';
import { requireCommunityManager } from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';

export async function seedCommunityTags(
  client: pg.PoolClient,
  community: string,
): Promise<void> {
  await client.query(
    'INSERT INTO hash_talk.community_tags(id,community_id,label) SELECT unnest($1::uuid[]),$2,unnest($3::text[])',
    [
      [randomUUID(), randomUUID(), randomUUID()],
      community,
      ['Discussão', 'Opinião', 'Memes'],
    ],
  );
}
export async function communityTagPage(
  client: Pick<pg.PoolClient, 'query'>,
  options: { community: string; after: string | null; all: boolean },
): Promise<TagPage> {
  const found = await client.query<PostTag>(
    'SELECT id,label,active,revision FROM hash_talk.community_tags WHERE community_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3 OR active) ORDER BY id LIMIT $4',
    [options.community, options.after, options.all, communityPageSize + 1],
  );
  const items = found.rows.slice(0, communityPageSize);
  return {
    items,
    next:
      found.rows.length > communityPageSize ? (items.at(-1)?.id ?? null) : null,
  };
}
export async function postTags(
  client: Pick<pg.PoolClient, 'query'>,
  ids: string[],
): Promise<Map<string, PostTag>> {
  const found = await client.query<PostTag>(
    'SELECT id,label,active,revision FROM hash_talk.community_tags WHERE id=ANY($1::uuid[])',
    [ids],
  );
  return new Map(found.rows.map((row) => [row.id, row]));
}
export async function requirePostTag(
  context: CommunityContext,
  id: string | null,
  previous: string | null = null,
): Promise<void> {
  if (id === null) return;
  const found = await context.client.query<{ active: boolean }>(
    'SELECT active FROM hash_talk.community_tags WHERE community_id=$1 AND id=$2',
    [context.row.id, id],
  );
  if (!found.rows[0] || (!found.rows[0].active && id !== previous))
    throw new AccountError(400, 'Tag indisponível nesta comunidade.');
}
export async function operatePostTag(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<TagPage | null> {
  await requireCommunityManager(context);
  if (operation === 'tag-list') {
    keys(data, ['id', 'after']);
    return communityTagPage(context.client, {
      community: context.row.id,
      after: communityCursor(data['after']),
      all: true,
    });
  }
  const id = uuid(data['tag']),
    label = postTagLabel(data['label']);
  if (operation === 'tag-create') {
    keys(data, ['id', 'tag', 'label']);
    const previous = await context.client.query<PostTag>(
      'SELECT id,label,active,revision FROM hash_talk.community_tags WHERE id=$1',
      [id],
    );
    if (previous.rows[0]) {
      const same = await context.client.query(
        'SELECT 1 FROM hash_talk.community_tags WHERE id=$1 AND community_id=$2 AND label=$3',
        [id, context.row.id, label],
      );
      if (!same.rowCount)
        throw new AccountError(409, 'Identificador de tag já utilizado.');
      return null;
    }
    await uniqueLabel(context, id, label);
    await context.client.query(
      'INSERT INTO hash_talk.community_tags(id,community_id,label) VALUES($1,$2,$3)',
      [id, context.row.id, label],
    );
  } else {
    if (operation !== 'tag-edit')
      throw new AccountError(404, 'Operação de tag indisponível.');
    keys(data, ['id', 'tag', 'revision', 'label', 'active']);
    const active = communityBoolean(data['active']),
      revision = communityRevision(data['revision']);
    await uniqueLabel(context, id, label);
    const updated = await context.client.query(
      'UPDATE hash_talk.community_tags SET label=$3,active=$4,revision=revision+1 WHERE id=$1 AND community_id=$2 AND revision=$5 AND (label<>$3 OR active<>$4)',
      [id, context.row.id, label, active, revision],
    );
    if (!updated.rowCount) {
      const unchanged = await context.client.query(
        'SELECT 1 FROM hash_talk.community_tags WHERE id=$1 AND community_id=$2 AND revision=$3 AND label=$4 AND active=$5',
        [id, context.row.id, revision, label, active],
      );
      if (!unchanged.rowCount)
        throw new AccountError(
          409,
          'A tag mudou. Recarregue antes de continuar.',
        );
      return null;
    }
  }
  await assertContentCapacity(context.client, capacity);
  return null;
}
async function uniqueLabel(
  context: CommunityContext,
  id: string,
  label: string,
): Promise<void> {
  const found = await context.client.query(
    'SELECT 1 FROM hash_talk.community_tags WHERE community_id=$1 AND lower(label)=lower($2) AND id<>$3',
    [context.row.id, label, id],
  );
  if (found.rowCount)
    throw new AccountError(
      409,
      'Já existe uma tag com esse nome nesta comunidade.',
    );
}
