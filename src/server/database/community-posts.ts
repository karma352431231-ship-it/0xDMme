import type pg from 'pg';
import { sharedPostIds } from './post-sharing.ts';
import { withPostInteractions } from './community-interaction-view.ts';
import { queueWatchedPost } from './profile-notifications.ts';
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
import {
  postContent,
  postCursor,
  replyPreview,
} from '../../shared/community-posts/index.ts';
import type {
  ReplyNotificationPage,
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
  postExtraTags,
  postTags,
  replaceExtraTags,
  requirePostTags,
  requireRootContent,
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
import { withinPostEditWindow } from '../../shared/community-posts/index.ts';
import { postAuthorBadges } from './community-badges.ts';
import type { CommunityBadge } from '../../shared/community-badges/index.ts';
/** The first tag lives on the post row; the rest come in order from the extras table. */
function rowTags(row: PostRow, extras: Map<string, string[]>): string[] {
  return row.tag_id ? [row.tag_id, ...(extras.get(row.id) ?? [])] : [];
}
function content(
  row: PostRow,
  own: boolean,
  extras: Map<string, string[]>,
): PostContent | null {
  // Reviewers keep their existing text authority; media references remain author-only until moderation is ready.
  if (!own && !row.text) return null;
  return {
    title: row.title,
    text: row.text,
    tags: rowTags(row, extras),
    ...(own && row.media_ids?.length ? { media: row.media_ids } : {}),
  };
}
function sameMedia(
  current: string[] | undefined,
  next: string[] | undefined,
): boolean {
  return JSON.stringify(current ?? []) === JSON.stringify(next ?? []);
}
function sameContent(
  row: PostRow,
  value: PostContent,
  tags: string[],
): boolean {
  return (
    row.title === value.title &&
    row.text === value.text &&
    JSON.stringify(tags) === JSON.stringify(value.tags) &&
    sameMedia(row.media_ids, value.media)
  );
}
async function writeEditedContent(
  context: CommunityContext,
  row: PostRow,
  value: PostContent,
): Promise<void> {
  const edited = await context.client.query(
    "UPDATE hash_talk.community_posts SET title=$2,text=$3,tag_id=$4,media_ids=$5,edited_at=clock_timestamp(),revision=revision+1 WHERE id=$1 AND created_at>clock_timestamp()-interval '1 hour' RETURNING id",
    [row.id, value.title, value.text, value.tags[0] ?? null, value.media ?? []],
  );
  if (!edited.rowCount)
    throw new AccountError(
      403,
      'A postagem só pode ser editada na primeira hora.',
    );
}
function requireEditWindow(row: PostRow): void {
  if (!withinPostEditWindow(row.created_at))
    throw new AccountError(
      403,
      'A postagem só pode ser editada na primeira hora.',
    );
}
interface PostLookup {
  authors: Map<string, PublicProfile>;
  tags: Map<string, PostTag>;
  extras: Map<string, string[]>;
  media: Map<string, PublicPostMedia[]>;
  badges: Map<string, CommunityBadge[]>;
}
function editable(row: PostRow, own: boolean, canPost: boolean): boolean {
  return (
    own &&
    canPost &&
    !row.deleted &&
    !row.active_removal &&
    withinPostEditWindow(row.created_at)
  );
}
function visibleFields(row: PostRow, lookup: PostLookup) {
  const media = lookup.media.get(row.id);
  return {
    title: row.title,
    text: row.text,
    author: row.author ? (lookup.authors.get(row.author) ?? null) : null,
    tags: rowTags(row, lookup.extras).flatMap((id) => {
      const tag = lookup.tags.get(id);
      return tag ? [tag] : [];
    }),
    ...(media?.length ? { media } : {}),
    authorBadges: lookup.badges.get(`${row.community_id}/${row.author}`) ?? [],
  };
}
function requireCreateRetry(
  row: PostRow,
  expected: {
    community: string;
    actor: string;
    content: PostContent;
    parent: PostRow | null;
    tags: string[];
  },
): void {
  const fields = [
    [row.community_id, expected.community],
    [row.author, expected.actor],
    [row.title, expected.content.title],
    [row.text, expected.content.text],
    [JSON.stringify(expected.tags), JSON.stringify(expected.content.tags)],
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
  if (value.title || value.tags.length)
    throw new AccountError(400, 'Resposta não admite título/tag.');
  return parent;
}
/** The first tag goes on the row, the others to the extras table. */
async function insertPost(
  context: CommunityContext,
  input: { id: string; value: PostContent; parent: PostRow | null },
): Promise<void> {
  const { id, value, parent } = input;
  await context.client.query(
    'INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,tag_id,parent_id,root_id,media_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      id,
      context.row.id,
      context.actor.id,
      value.title,
      value.text,
      value.tags[0] ?? null,
      parent?.id ?? null,
      parent ? (parent.root_id ?? parent.id) : null,
      value.media ?? [],
    ],
  );
  await replaceExtraTags(context, id, value.tags.slice(1));
}
/** A retried create with the same id must repeat the same post exactly. */
async function createdBefore(
  context: CommunityContext,
  id: string,
  expected: { content: PostContent; parent: PostRow | null },
): Promise<boolean> {
  const previous = await context.client.query<PostRow>(
    `SELECT ${columns} FROM hash_talk.community_posts WHERE id=$1`,
    [id],
  );
  const old = previous.rows[0];
  if (!old) return false;
  requireCreateRetry(old, {
    community: context.row.id,
    actor: context.actor.id,
    ...expected,
    tags: rowTags(old, await postExtraTags(context.client, [old.id])),
  });
  return true;
}
/** Posts need a title and tags; replies carry neither. */
async function requireTagged(
  context: CommunityContext,
  value: PostContent,
  input: { root: boolean; previous: string[] },
): Promise<void> {
  if (!input.root) {
    if (value.title || value.tags.length)
      throw new AccountError(400, 'Resposta não admite título/tag.');
    return;
  }
  await requireRootContent(context, value);
  await requirePostTags(context, value.tags, input.previous);
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
      extras = await postExtraTags(
        client,
        rows.filter((row) => row.tag_id).map((row) => row.id),
      ),
      tags = await postTags(
        client,
        rows.flatMap((row) => rowTags(row, extras)),
      );
    const media = await this.media.references(
      client,
      rows
        .filter((row) => !row.deleted && !row.active_removal)
        .map((row) => row.id),
    );
    const badges = await postAuthorBadges(
      client,
      rows.flatMap((row) =>
        row.author && !row.deleted && !row.active_removal
          ? [{ community: row.community_id, author: row.author }]
          : [],
      ),
    );
    return { authors, tags, extras, media, badges };
  }
  private view(row: PostRow, lookup: PostLookup): CommunityPost {
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
        : { author: null, title: '', text: '', tags: [] }),
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
  /** One bounded read with the same privacy rules as any public post view. */
  private async withPreviews(
    client: Pick<pg.PoolClient, 'query'>,
    page: ReplyNotificationPage,
  ): Promise<ReplyNotificationPage> {
    const posts = new Map(
      (
        await this.readMany(
          client,
          page.items.map((item) => item.reply),
        )
      ).map((post) => [post.id, post]),
    );
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        preview: replyPreview(posts.get(item.reply)),
      })),
    };
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
      viewer?: string;
    },
  ): Promise<PostRow[]> {
    const [time, id] = (options.after ?? '').split('/');
    const found = await client.query<PostRow>(
      `SELECT ${columns} FROM hash_talk.community_posts WHERE community_id=$1 AND ($9 OR parent_id=$8::uuid OR ($8::uuid IS NULL AND parent_id IS NULL)) AND (parent_id IS NOT NULL OR NOT deleted)
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid))
      AND ($4::uuid IS NULL OR tag_id=$4 OR EXISTS(SELECT 1 FROM hash_talk.community_post_extra_tags e WHERE e.post_id=community_posts.id AND e.tag_id=$4))
      AND ($5::uuid IS NULL OR author=$5) AND ($8::uuid IS NOT NULL OR $5::uuid IS NOT NULL OR (active_removal IS NOT NULL)=$6)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.actor=$10 AND b.target=author AND b.blocked)
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
        options.viewer ?? null,
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
    const shared = await sharedPostIds(
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
        shared: shared.has(row.id),
        canEdit: editable(row, own, canPost),
        canDelete: own && !row.deleted,
        content:
          restricted && !row.deleted ? content(row, own, lookup.extras) : null,
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
    if (await createdBefore(context, id, { content: value, parent })) return;
    await requireTagged(context, value, { root: !parent, previous: [] });
    await insertPost(context, { id, value, parent });
    await this.media.replace(context, { post: id, ids: value.media ?? [] });
    await queueWatchedPost(context.client, context.actor.id);
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
    const current = rowTags(row, await postExtraTags(context.client, [row.id]));
    await requireTagged(context, value, {
      root: !row.parent_id,
      previous: current,
    });
    if (sameContent(row, value, current)) return;
    requireEditWindow(row);
    // Expiry removes bytes while preserving the post/reply link and its text.
    // Editing text need not reattach historical IDs whose bytes were discarded.
    if (!sameMedia(row.media_ids, ids))
      await this.media.replace(context, {
        post: row.id,
        ids,
      });
    await writeEditedContent(context, row, value);
    await replaceExtraTags(context, row.id, value.tags.slice(1));
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
    await replaceExtraTags(context, row.id, []);
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
    if (operation === 'post-notifications')
      return this.communities.withActor(authority, async (context) => {
        const page = await replyNotifications(context, operation, data);
        return 'items' in page ? this.withPreviews(context.client, page) : page;
      });
    if (operation === 'post-notifications-read')
      return this.communities.withActor(authority, async (context) => {
        const result = await replyNotifications(context, operation, data);
        await assertContentCapacity(context.client, this.capacity);
        return result;
      });
    return this.communities.withContext(
      authority,
      uuid(data['id']),
      async (context) => {
        if (operation === 'post-public') {
          keys(data, ['id', 'post']);
          await this.requireVisibleTo(context, uuid(data['post']));
          return (
            await withPostInteractions(context.client, context.actor.id, [
              await this.read(context.row.id, uuid(data['post'])),
            ])
          )[0]!;
        }
        if (operation === 'post-replies') {
          keys(data, ['id', 'post', 'after']);
          const result = page(
            await this.rows(context.client, {
              community: context.row.id,
              parent: uuid(data['post']),
              after: postCursor(data['after']),
              tag: null,
              author: null,
              removed: false,
              viewer: context.actor.id,
            }),
          );
          const lookup = await this.lookups(context.client, result.items);
          return {
            ...result,
            items: await withPostInteractions(
              context.client,
              context.actor.id,
              result.items.map((row) => this.view(row, lookup)),
            ),
          };
        }
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
  private async requireVisibleTo(
    context: CommunityContext,
    id: string,
  ): Promise<void> {
    const blocked = await context.client.query(
      'SELECT 1 FROM hash_talk.community_posts p JOIN hash_talk.social_blocks b ON b.target=p.author AND b.actor=$1 AND b.blocked WHERE p.id=$2',
      [context.actor.id, id],
    );
    if (blocked.rowCount)
      throw new AccountError(404, 'Postagem indisponível para este perfil.');
  }
}
