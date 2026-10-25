import type { ContentCapacity } from './content-capacity.ts';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
  communityRevision,
} from '../../shared/communities/index.ts';
import {
  defaultPostTags,
  postTagLabel,
} from '../../shared/community-posts/index.ts';
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
    [defaultPostTags.map(() => randomUUID()), community, [...defaultPostTags]],
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
/** Every chosen tag must belong to the community and be active, unless the post already had it. */
export async function requirePostTags(
  context: CommunityContext,
  ids: readonly string[],
  previous: readonly string[] = [],
): Promise<void> {
  if (!ids.length) return;
  const found = await context.client.query<{ id: string; active: boolean }>(
    'SELECT id,active FROM hash_talk.community_tags WHERE community_id=$1 AND id=ANY($2::uuid[])',
    [context.row.id, ids],
  );
  const known = new Map(found.rows.map((row) => [row.id, row.active]));
  for (const id of ids)
    if (!known.has(id) || (!known.get(id) && !previous.includes(id)))
      throw new AccountError(400, 'Tag unavailable in this community.');
}
/**
 * A post (not a reply) needs a title, and at least one tag whenever the
 * community offers any active tag.
 */
export async function requireRootContent(
  context: CommunityContext,
  value: { title: string; tags: readonly string[] },
): Promise<void> {
  if (!value.title.trim())
    throw new AccountError(400, 'Give your post a title.');
  if (value.tags.length) return;
  const offered = await context.client.query(
    'SELECT 1 FROM hash_talk.community_tags WHERE community_id=$1 AND active LIMIT 1',
    [context.row.id],
  );
  if (offered.rows.length)
    throw new AccountError(400, 'Choose at least one tag.');
}
/** Tags after the first, per post and in order (the first lives on the post row). */
export async function postExtraTags(
  client: Pick<pg.PoolClient, 'query'>,
  posts: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!posts.length) return result;
  const found = await client.query<{ post_id: string; tag_id: string }>(
    'SELECT post_id,tag_id FROM hash_talk.community_post_extra_tags WHERE post_id=ANY($1::uuid[]) ORDER BY post_id,position',
    [posts],
  );
  for (const row of found.rows)
    result.set(row.post_id, [...(result.get(row.post_id) ?? []), row.tag_id]);
  return result;
}
/** Replaces the extra tags of a post; an empty list removes them. */
export async function replaceExtraTags(
  context: CommunityContext,
  post: string,
  extras: readonly string[],
): Promise<void> {
  await context.client.query(
    'DELETE FROM hash_talk.community_post_extra_tags WHERE post_id=$1',
    [post],
  );
  if (!extras.length) return;
  await context.client.query(
    `INSERT INTO hash_talk.community_post_extra_tags(community_id,post_id,tag_id,position)
     SELECT $1,$2,tag,position FROM unnest($3::uuid[]) WITH ORDINALITY AS chosen(tag,position)`,
    [context.row.id, post, extras],
  );
}
export async function operatePostTag(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: ContentCapacity,
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
        throw new AccountError(409, 'Tag identifier already used.');
      return null;
    }
    await uniqueLabel(context, id, label);
    await context.client.query(
      'INSERT INTO hash_talk.community_tags(id,community_id,label) VALUES($1,$2,$3)',
      [id, context.row.id, label],
    );
  } else {
    if (operation !== 'tag-edit')
      throw new AccountError(404, 'Tag operation unavailable.');
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
          'The tag changed. Reload before continuing.',
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
      'This community already has a tag with this name.',
    );
}
