import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityCursor,
  communityPageSize,
} from '../../shared/communities/index.ts';
import { postContent, postCursor } from '../../shared/community-posts/index.ts';
import type {
  CommunityPost,
  PostContent,
  PostPage,
  PostState,
  PostTag,
  PrivatePostPage,
} from '../../shared/community-posts/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { CommunityStore } from './communities.ts';
import type { ContactAuthority } from './contacts.ts';
import {
  activeSanction,
  communityRole,
  requireCommunityManager,
  requireCommunityParticipation,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';
import {
  communityTagPage,
  operatePostTag,
  postTags,
  requirePostTag,
} from './community-post-tags.ts';
import {
  postModeration,
  removalRows,
  removalView,
} from './community-post-moderation.ts';
import {
  loadPost,
  currentPost,
  postColumns as columns,
} from './community-post-authority.ts';
import type { PostRow } from './community-post-authority.ts';
function content(row: PostRow): PostContent {
  return { title: row.title, text: row.text, tag: row.tag_id };
}
function editable(row: PostRow, own: boolean, canPost: boolean): boolean {
  return own && canPost && !row.deleted && !row.active_removal;
}
function visibleFields(
  row: PostRow,
  lookup: { authors: Map<string, PublicProfile>; tags: Map<string, PostTag> },
) {
  return {
    title: row.title,
    text: row.text,
    author: row.author ? (lookup.authors.get(row.author) ?? null) : null,
    tag: row.tag_id ? (lookup.tags.get(row.tag_id) ?? null) : null,
  };
}
function page(rows: PostRow[]) {
  const items = rows.slice(0, communityPageSize),
    last = items.at(-1);
  return {
    items,
    next:
      rows.length > communityPageSize && last
        ? `${last.created_at.toISOString()}/${last.id}`
        : null,
  };
}
export class CommunityPostStore {
  private readonly pool: pg.Pool;
  private readonly communities: CommunityStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: number;
  constructor(options: {
    pool: pg.Pool;
    communities: CommunityStore;
    profiles: PublicProfileStore;
    capacity: number;
  }) {
    this.pool = options.pool;
    this.communities = options.communities;
    this.profiles = options.profiles;
    this.capacity = options.capacity;
  }
  private async lookups(client: Pick<pg.PoolClient, 'query'>, rows: PostRow[]) {
    const authors = await this.profiles.identities(
        client,
        rows.flatMap((row) => (row.author ? [row.author] : [])),
      ),
      tags = await postTags(
        client,
        rows.flatMap((row) => (row.tag_id ? [row.tag_id] : [])),
      );
    return { authors, tags };
  }
  private view(
    row: PostRow,
    lookup: { authors: Map<string, PublicProfile>; tags: Map<string, PostTag> },
  ): CommunityPost {
    const status = row.deleted
        ? 'deleted'
        : row.active_removal
          ? 'removed'
          : 'visible',
      visible = status === 'visible';
    return {
      id: row.id,
      community: row.community_id,
      ...(visible
        ? visibleFields(row, lookup)
        : { author: null, title: '', text: '', tag: null }),
      createdAt: row.created_at.toISOString(),
      editedAt: row.edited_at?.toISOString() ?? null,
      revision: row.revision,
      status,
    };
  }
  async read(community: string, id: string): Promise<CommunityPost> {
    const found = await this.pool.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE community_id=$1 AND id=$2`,
      [community, id],
    );
    if (!found.rows[0]) throw new AccountError(404, 'Post indisponível.');
    return this.view(found.rows[0], await this.lookups(this.pool, found.rows));
  }
  async tags(community: string, after: string | null) {
    return communityTagPage(this.pool, { community, after, all: false });
  }
  private async rows(
    client: Pick<pg.PoolClient, 'query'>,
    options: {
      community: string;
      after: string | null;
      tag: string | null;
      author: string | null;
      removed: boolean;
    },
  ): Promise<PostRow[]> {
    const [time, id] = (options.after ?? '').split('/');
    const found = await client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE community_id=$1 AND NOT deleted
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) AND ($4::uuid IS NULL OR tag_id=$4)
      AND ($5::uuid IS NULL OR author=$5) AND ($5::uuid IS NOT NULL OR (active_removal IS NOT NULL)=$6)
      ORDER BY created_at DESC,id DESC LIMIT $7`,
      [
        options.community,
        time || null,
        id || null,
        options.tag,
        options.author,
        options.removed,
        communityPageSize + 1,
      ],
    );
    return found.rows;
  }
  async list(
    community: string,
    after: string | null,
    tag: string | null,
  ): Promise<PostPage> {
    const result = page(
        await this.rows(this.pool, {
          community,
          after,
          tag,
          author: null,
          removed: false,
        }),
      ),
      lookup = await this.lookups(this.pool, result.items);
    return {
      ...result,
      items: result.items.map((row) => this.view(row, lookup)),
    };
  }
  private async states(
    context: CommunityContext,
    rows: PostRow[],
  ): Promise<PostState[]> {
    const lookup = await this.lookups(context.client, rows),
      manager = (await communityRole(context)) !== 'participant',
      canPost = !context.row.archived && !(await activeSanction(context)),
      removals = await removalRows(
        context.client,
        rows.flatMap((row) => (row.active_removal ? [row.active_removal] : [])),
      );
    return rows.map((row) => {
      const own = row.author === context.actor.id,
        restricted = own || manager;
      return {
        post: this.view(row, lookup),
        own,
        manager,
        canEdit: editable(row, own, canPost),
        canDelete: own && !row.deleted,
        content: restricted && !row.deleted ? content(row) : null,
        removal:
          restricted && row.active_removal
            ? removalView(removals.get(row.active_removal) ?? null)
            : null,
      };
    });
  }
  private async state(
    context: CommunityContext,
    id: string,
  ): Promise<PostState> {
    return (await this.states(context, [await loadPost(context, id)]))[0]!;
  }
  private async ownPage(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<PrivatePostPage> {
    keys(data, ['id', 'scope', 'after', 'tag']);
    const scope = data['scope'];
    if (scope !== 'own' && scope !== 'removed')
      throw new AccountError(400, 'Lista de posts inválida.');
    if (scope === 'removed') await requireCommunityManager(context);
    const result = page(
      await this.rows(context.client, {
        community: context.row.id,
        after: postCursor(data['after']),
        tag: communityCursor(data['tag']),
        author: scope === 'own' ? context.actor.id : null,
        removed: scope === 'removed',
      }),
    );
    return { ...result, items: await this.states(context, result.items) };
  }
  private async create(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'post', 'content']);
    await requireCommunityParticipation(context);
    const id = uuid(data['post']),
      value = postContent(data['content']);
    const previous = await context.client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE id=$1`,
      [id],
    );
    const old = previous.rows[0];
    if (old) {
      if (
        old.community_id !== context.row.id ||
        old.author !== context.actor.id ||
        old.deleted ||
        old.title !== value.title ||
        old.text !== value.text ||
        old.tag_id !== value.tag
      )
        throw new AccountError(409, 'Identificador de post já utilizado.');
      return;
    }
    await requirePostTag(context, value.tag);
    await context.client.query(
      'INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,tag_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        id,
        context.row.id,
        context.actor.id,
        value.title,
        value.text,
        value.tag,
      ],
    );
    await assertContentCapacity(context.client, this.capacity);
  }
  private async edit(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'post', 'revision', 'content']);
    const row = await loadPost(context, uuid(data['post'])),
      value = postContent(data['content']);
    if (row.author !== context.actor.id)
      throw new AccountError(403, 'Somente o autor pode editar o post.');
    await requireCommunityParticipation(context);
    if (row.deleted || row.active_removal)
      throw new AccountError(
        409,
        'Post excluído ou oculto não pode ser editado.',
      );
    currentPost(row, data['revision']);
    await requirePostTag(context, value.tag, row.tag_id);
    if (
      row.title === value.title &&
      row.text === value.text &&
      row.tag_id === value.tag
    )
      return;
    await context.client.query(
      'UPDATE hash_talk.community_posts SET title=$2,text=$3,tag_id=$4,edited_at=clock_timestamp(),revision=revision+1 WHERE id=$1',
      [row.id, value.title, value.text, value.tag],
    );
    await assertContentCapacity(context.client, this.capacity);
  }
  private async remove(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'post', 'revision']);
    const row = await loadPost(context, uuid(data['post']));
    if (row.author !== context.actor.id)
      throw new AccountError(403, 'Somente o autor pode excluir o post.');
    if (row.deleted) return;
    currentPost(row, data['revision']);
    await context.client.query(
      "UPDATE hash_talk.community_posts SET title='',text='',tag_id=NULL,active_removal=NULL,deleted=true,revision=revision+1 WHERE id=$1",
      [row.id],
    );
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.communities.withContext(
      authority,
      uuid(data['id']),
      async (context) => {
        if (operation.startsWith('tag-')) {
          const result = await operatePostTag(
            context,
            operation,
            data,
            this.capacity,
          );
          return result ?? { saved: true };
        }
        if (operation === 'post-page') return this.ownPage(context, data);
        const id = uuid(data['post']);
        switch (operation) {
          case 'post-state':
            keys(data, ['id', 'post']);
            break;
          case 'post-create':
            await this.create(context, data);
            break;
          case 'post-edit':
            await this.edit(context, data);
            break;
          case 'post-delete':
            await this.remove(context, data);
            break;
          default: {
            const result = await postModeration(
              context,
              operation,
              data,
              this.capacity,
            );
            if (result !== undefined) return result;
          }
        }
        return this.state(context, id);
      },
    );
  }
}
