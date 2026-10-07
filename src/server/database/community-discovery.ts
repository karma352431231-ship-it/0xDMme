import type pg from 'pg';
import { AccountError, keys } from '../../shared/account/index.ts';
import { communityPageSize } from '../../shared/communities/index.ts';
import {
  discoveryKey,
  discoveryWindow,
  feedFilter,
  rankCursor,
} from '../../shared/community-discovery/index.ts';
import type {
  ExploreFilter,
  ExplorePage,
  FeedFilter,
  FeedPage,
  RankCursor,
} from '../../shared/community-discovery/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { CommunityStore } from './communities.ts';
import type { ContactAuthority } from './contacts.ts';
import { operatePostPreference } from './community-preferences.ts';

type Reader = Pick<pg.PoolClient, 'query'>;
interface RankedRow {
  id: string;
  rank: string;
  created_at: Date;
}
interface FeedRow extends RankedRow {
  community_id: string;
  name: string;
}
interface ExploreRow extends RankedRow {
  activity: string;
}
function window(filter: FeedFilter | ExploreFilter, after: unknown) {
  const key = discoveryKey(filter),
    cursor = rankCursor(after, key),
    anchor = cursor?.anchor ?? new Date().toISOString();
  if (Date.parse(anchor) > Date.now() + 1000)
    throw new AccountError(400, 'Cursor no futuro.');
  return { key, cursor, anchor, since: discoveryWindow(filter.period, anchor) };
}
function page<T extends RankedRow>(
  rows: T[],
  current: { key: string; anchor: string },
) {
  const items = rows.slice(0, communityPageSize),
    last = items.at(-1);
  const next: RankCursor | null =
    rows.length > communityPageSize && last
      ? {
          filter: current.key,
          anchor: current.anchor,
          rank: Number(last.rank),
          time: last.created_at.toISOString(),
          id: last.id,
        }
      : null;
  return { items, next: next ? JSON.stringify(next) : null };
}
export class CommunityDiscoveryStore {
  private readonly pool: pg.Pool;
  private readonly communities: CommunityStore;
  private readonly posts: (
    client: Reader,
    ids: string[],
  ) => Promise<CommunityPost[]>;
  private readonly capacity: number;
  constructor(options: {
    pool: pg.Pool;
    communities: CommunityStore;
    posts: (client: Reader, ids: string[]) => Promise<CommunityPost[]>;
    capacity: number;
  }) {
    this.pool = options.pool;
    this.communities = options.communities;
    this.posts = options.posts;
    this.capacity = options.capacity;
  }
  async feed(filter: FeedFilter, after: string | null): Promise<FeedPage> {
    if (filter.scope !== 'all')
      throw new AccountError(403, 'Feed restrito à própria conta.');
    return this.feedRows(this.pool, { filter, after, actor: null });
  }
  private async feedRows(
    client: Reader,
    options: { filter: FeedFilter; after: unknown; actor: string | null },
  ): Promise<FeedPage> {
    const { filter, actor } = options,
      current = window(filter, options.after);
    const rank = {
      recent: '0::bigint',
      votes: 'p.score::bigint',
      replies: 'p.replies::bigint',
    }[filter.order];
    const found = await client.query<FeedRow>(
      `WITH ranked AS (
      SELECT p.id,p.community_id,c.name,p.created_at,${rank} AS rank
      FROM hash_talk.community_posts p JOIN hash_talk.communities c ON c.id=p.community_id
      LEFT JOIN hash_talk.community_post_preferences pref ON pref.post_id=p.id AND pref.profile_id=$1
      WHERE ($2 IN ('saved','hidden') OR (p.parent_id IS NULL AND NOT p.deleted AND p.active_removal IS NULL))
      AND ($3::uuid IS NULL OR p.community_id=$3) AND ($4::uuid IS NULL OR p.tag_id=$4)
      AND ($5::timestamptz IS NULL OR p.created_at>=$5) AND p.created_at<=$6
      AND ($2<>'following' OR EXISTS(SELECT 1 FROM hash_talk.community_follows f WHERE f.profile_id=$1 AND f.community_id=p.community_id))
      AND ($2<>'saved' OR pref.saved) AND ($2<>'hidden' OR pref.hidden)
      AND ($2 IN ('saved','hidden') OR NOT coalesce(pref.hidden,false))
    ) SELECT * FROM ranked WHERE ($7::bigint IS NULL OR (rank,created_at,id)<($7,$8::timestamptz,$9::uuid))
      ORDER BY rank DESC,created_at DESC,id DESC LIMIT $10`,
      [
        actor,
        filter.scope,
        filter.community,
        filter.tag,
        current.since,
        current.anchor,
        current.cursor?.rank ?? null,
        current.cursor?.time ?? null,
        current.cursor?.id ?? null,
        communityPageSize + 1,
      ],
    );
    const result = page(found.rows, current),
      posts = new Map(
        (
          await this.posts(
            client,
            result.items.map((row) => row.id),
          )
        ).map((post) => [post.id, post]),
      ),
      photos = await this.communities.photoReferences(client, [
        ...new Set(result.items.map((row) => row.community_id)),
      ]);
    return {
      next: result.next,
      items: result.items.flatMap((row) => {
        const post = posts.get(row.id);
        const avatar = photos.get(row.community_id);
        return post
          ? [
              {
                post,
                community: {
                  id: row.community_id,
                  name: row.name,
                  ...(avatar ? { avatar } : {}),
                },
              },
            ]
          : [];
      }),
    };
  }
  async explore(
    filter: ExploreFilter,
    after: string | null,
  ): Promise<ExplorePage> {
    const current = window(filter, after),
      rank = filter.order === 'size' ? 'coalesce(f.n,0)' : 'coalesce(a.n,0)';
    const found = await this.pool.query<ExploreRow>(
      `WITH follows AS (
      SELECT community_id,count(*) AS n FROM hash_talk.community_follows GROUP BY community_id
    ), activity AS (
      SELECT p.community_id,count(*) AS n FROM hash_talk.community_posts p
      LEFT JOIN hash_talk.community_posts root ON root.id=p.root_id
      WHERE NOT p.deleted AND p.active_removal IS NULL AND (p.root_id IS NULL OR (NOT root.deleted AND root.active_removal IS NULL))
      AND ($1::timestamptz IS NULL OR p.created_at>=$1) AND p.created_at<=$2 GROUP BY p.community_id
    ), ranked AS (
      SELECT c.id,${rank} AS rank,coalesce(a.n,0) AS activity,$2::timestamptz AS created_at
      FROM hash_talk.communities c LEFT JOIN follows f ON f.community_id=c.id LEFT JOIN activity a ON a.community_id=c.id
    ) SELECT * FROM ranked WHERE ($3::bigint IS NULL OR (rank,id)<($3,$4::uuid)) ORDER BY rank DESC,id DESC LIMIT $5`,
      [
        current.since,
        current.anchor,
        current.cursor?.rank ?? null,
        current.cursor?.id ?? null,
        communityPageSize + 1,
      ],
    );
    const result = page(found.rows, current),
      groups = new Map(
        (
          await this.communities.readMany(
            this.pool,
            result.items.map((row) => row.id),
          )
        ).map((group) => [group.id, group]),
      );
    return {
      next: result.next,
      items: result.items.flatMap((row) => {
        const community = groups.get(row.id);
        return community ? [{ community, activity: Number(row.activity) }] : [];
      }),
    };
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (operation === 'discovery-feed') {
      keys(data, ['filter', 'after']);
      const filter = feedFilter(data['filter']);
      return this.communities.withReader(authority, (context) => {
        if (!context.actor && filter.scope !== 'all')
          throw new AccountError(
            403,
            'Crie seu perfil público em Perfil para organizar suas listas.',
          );
        return this.feedRows(context.client, {
          filter,
          after: data['after'],
          actor: context.actor?.id ?? null,
        });
      });
    }
    return this.communities.withActor(authority, async (context) => {
      return operatePostPreference(context, operation, data, this.capacity);
    });
  }
}
