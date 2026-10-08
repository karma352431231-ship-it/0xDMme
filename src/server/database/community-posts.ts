import type pg from 'pg';
import {
  postVotes,
  setPostVote,
  requireReplyTarget,
  admitReplyNotification,
  replyNotifications,
} from './community-interactions.ts';
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
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { CommunityMediaStore } from './community-media.ts';
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
function content(row: PostRow, own: boolean): PostContent | null {
  // Reviewers keep their existing text authority; media references remain author-only until moderation is ready.
  if (!own && !row.text) return null;
  return {
    title: row.title,
    text: row.text,
    tag: row.tag_id,
    ...(own && row.media_ids?.length ? { media: row.media_ids } : {}),
  };
}
function sameMedia(
  current: string[] | undefined,
  next: string[] | undefined,
): boolean {
  return JSON.stringify(current ?? []) === JSON.stringify(next ?? []);
}
function sameContent(row: PostRow, value: PostContent): boolean {
  return (
    row.title === value.title &&
    row.text === value.text &&
    row.tag_id === value.tag &&
    sameMedia(row.media_ids, value.media)
  );
}
function editable(row: PostRow, own: boolean, canPost: boolean): boolean {
  return own && canPost && !row.deleted && !row.active_removal;
}
function visibleFields(
  row: PostRow,
  lookup: {
    authors: Map<string, PublicProfile>;
    tags: Map<string, PostTag>;
    media: Map<string, PublicPostMedia[]>;
  },
) {
  const media = lookup.media.get(row.id);
  return {
    title: row.title,
    text: row.text,
    author: row.author ? (lookup.authors.get(row.author) ?? null) : null,
    tag: row.tag_id ? (lookup.tags.get(row.tag_id) ?? null) : null,
    ...(media?.length ? { media } : {}),
  };
}
function requireCreateRetry(
  row: PostRow,
  expected: {
    community: string;
    actor: string;
    content: PostContent;
    parent: PostRow | null;
  },
): void {
  const fields = [
    [row.community_id, expected.community],
    [row.author, expected.actor],
    [row.title, expected.content.title],
    [row.text, expected.content.text],
    [row.tag_id, expected.content.tag],
    [row.parent_id, expected.parent?.id ?? null],
    [
      JSON.stringify(row.media_ids ?? []),
      JSON.stringify(expected.content.media ?? []),
    ],
  ];
  if (row.deleted || fields.some(([actual, value]) => actual !== value))
    throw new AccountError(409, 'Identificador de post já utilizado.');
}
async function createParent(
  context: CommunityContext,
  data: Record<string, unknown>,
  value: PostContent,
): Promise<PostRow | null> {
  if (!Object.hasOwn(data, 'parent')) return null;
  const parent = await loadPost(context, uuid(data['parent']));
  await requireReplyTarget(context, parent);
  if (value.title || value.tag)
    throw new AccountError(400, 'Resposta não admite título/tag.');
  return parent;
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
  private readonly media: CommunityMediaStore;
  constructor(options: {
    pool: pg.Pool;
    communities: CommunityStore;
    profiles: PublicProfileStore;
    capacity: number;
    media: CommunityMediaStore;
  }) {
    this.pool = options.pool;
    this.communities = options.communities;
    this.profiles = options.profiles;
    this.capacity = options.capacity;
    this.media = options.media;
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
    const media = await this.media.references(
      client,
      rows
        .filter((row) => !row.deleted && !row.active_removal)
        .map((row) => row.id),
    );
    return { authors, tags, media };
  }
  private view(
    row: PostRow,
    lookup: {
      authors: Map<string, PublicProfile>;
      tags: Map<string, PostTag>;
      media: Map<string, PublicPostMedia[]>;
    },
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
      parent: row.parent_id,
      root: row.root_id,
      score: row.score,
      replies: row.replies,
      views: visible ? Number(row.views) : 0,
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
  /** Bounded projection for discovery; markers retain the same privacy rules. */
  async readMany(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<CommunityPost[]> {
    if (ids.length > communityPageSize)
      throw new AccountError(400, 'Página muito grande.');
    const found = await client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    const lookup = await this.lookups(client, found.rows);
    return found.rows.map((row) => this.view(row, lookup));
  }
  async tags(community: string, after: string | null) {
    return communityTagPage(this.pool, { community, after, all: false });
  }
  private async rows(
    client: Pick<pg.PoolClient, 'query'>,
    options: {
      community: string;
      parent?: string | null;
      after: string | null;
      tag: string | null;
      author: string | null;
      removed: boolean;
    },
  ): Promise<PostRow[]> {
    const [time, id] = (options.after ?? '').split('/');
    const found = await client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE community_id=$1 AND ($9 OR parent_id=$8::uuid OR ($8::uuid IS NULL AND parent_id IS NULL)) AND (parent_id IS NOT NULL OR NOT deleted)
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) AND ($4::uuid IS NULL OR tag_id=$4)
      AND ($5::uuid IS NULL OR author=$5) AND ($8::uuid IS NOT NULL OR $5::uuid IS NOT NULL OR (active_removal IS NOT NULL)=$6)
      ORDER BY created_at DESC,id DESC LIMIT $7`,
      [
        options.community,
        time || null,
        id || null,
        options.tag,
        options.author,
        options.removed,
        communityPageSize + 1,
        options.parent ?? null,
        options.author !== null || options.removed,
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
  async replies(
    community: string,
    parent: string,
    after: string | null,
  ): Promise<PostPage> {
    // Read the parent marker as well; no hidden/deleted content is needed to navigate its children.
    await this.read(community, parent);
    const result = page(
      await this.rows(this.pool, {
        community,
        parent,
        after,
        tag: null,
        author: null,
        removed: false,
      }),
    );
    const lookup = await this.lookups(this.pool, result.items);
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
    const votes = await postVotes(
      context.client,
      context.actor.id,
      rows.map((row) => row.id),
    );
    return rows.map((row) => {
      const own = row.author === context.actor.id,
        restricted = own || manager;
      return {
        post: this.view(row, lookup),
        own,
        manager,
        vote: votes.get(row.id) ?? { position: 0, revision: 0 },
        canEdit: editable(row, own, canPost),
        canDelete: own && !row.deleted,
        content: restricted && !row.deleted ? content(row, own) : null,
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
    const replying = Object.hasOwn(data, 'parent');
    keys(
      data,
      replying
        ? ['id', 'post', 'content', 'parent']
        : ['id', 'post', 'content'],
    );
    await requireCommunityParticipation(context);
    const id = uuid(data['post']),
      value = postContent(data['content']),
      parent = await createParent(context, data, value);
    const previous = await context.client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE id=$1`,
      [id],
    );
    const old = previous.rows[0];
    if (old) {
      requireCreateRetry(old, {
        community: context.row.id,
        actor: context.actor.id,
        content: value,
        parent,
      });
      return;
    }
    await requirePostTag(context, value.tag);
    await context.client.query(
      'INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,tag_id,parent_id,root_id,media_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        context.row.id,
        context.actor.id,
        value.title,
        value.text,
        value.tag,
        parent?.id ?? null,
        parent ? (parent.root_id ?? parent.id) : null,
        value.media ?? [],
      ],
    );
    await this.media.replace(context, { post: id, ids: value.media ?? [] });
    if (parent) {
      await context.client.query(
        'UPDATE hash_talk.community_posts SET replies=replies+1 WHERE id=$1',
        [parent.id],
      );
      await admitReplyNotification(context, parent, id);
    }
    await assertContentCapacity(context.client, this.capacity);
  }
  private async edit(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'post', 'revision', 'content']);
    const row = await loadPost(context, uuid(data['post'])),
      value = postContent(data['content']),
      ids = value.media ?? [];
    if (row.author !== context.actor.id)
      throw new AccountError(403, 'Somente o autor pode editar o post.');
    await requireCommunityParticipation(context);
    if (row.deleted || row.active_removal)
      throw new AccountError(
        409,
        'Post excluído ou oculto não pode ser editado.',
      );
    currentPost(row, data['revision']);
    if (row.parent_id && (value.title || value.tag))
      throw new AccountError(400, 'Resposta não admite título/tag.');
    await requirePostTag(context, value.tag, row.tag_id);
    if (sameContent(row, value)) return;
    // Expiry removes bytes while preserving the post/reply link and its text.
    // Editing text need not reattach historical IDs whose bytes were discarded.
    if (!sameMedia(row.media_ids, ids))
      await this.media.replace(context, {
        post: row.id,
        ids,
      });
    await context.client.query(
      'UPDATE hash_talk.community_posts SET title=$2,text=$3,tag_id=$4,media_ids=$5,edited_at=clock_timestamp(),revision=revision+1 WHERE id=$1',
      [row.id, value.title, value.text, value.tag, ids],
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
    await this.media.replace(context, { post: row.id, ids: [] });
    await context.client.query(
      "UPDATE hash_talk.community_posts SET title='',text='',tag_id=NULL,active_removal=NULL,media_ids='{}',deleted=true,revision=revision+1 WHERE id=$1",
      [row.id],
    );
  }
  private async apply(
    context: CommunityContext,
    operation: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    switch (operation) {
      case 'post-state':
        keys(data, ['id', 'post']);
        break;
      case 'post-vote':
        await setPostVote(context, data, this.capacity);
        break;
      case 'reply-create':
        if (!Object.hasOwn(data, 'parent'))
          throw new AccountError(400, 'Resposta exige pai.');
        await this.create(context, data);
        break;
      case 'post-create':
        if (Object.hasOwn(data, 'parent'))
          throw new AccountError(400, 'Post não admite pai.');
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
    return undefined;
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (
      operation === 'post-notifications' ||
      operation === 'post-notifications-read'
    )
      return this.communities.withActor(authority, (context) =>
        replyNotifications(context, operation, data),
      );
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
        const result = await this.apply(context, operation, data);
        if (result !== undefined) return result;
        return this.state(context, id);
      },
    );
  }
}
