import type pg from 'pg';
import { AccountError, keys } from '../../shared/account/index.ts';
import { communityPageSize } from '../../shared/communities/index.ts';
import {
  discoveryKey,
  discoveryWindow,
  exploreCursor,
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
import type { CommunityRankingStore } from './community-ranking.ts';
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
  private readonly ranking: CommunityRankingStore;
  constructor(options: {
    pool: pg.Pool;
    ranking: CommunityRankingStore;
    communities: CommunityStore;
    posts: (client: Reader, ids: string[]) => Promise<CommunityPost[]>;
    capacity: number;
  }) {
    this.pool = options.pool;
    this.ranking = options.ranking;
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
    const key = discoveryKey(filter),
      cursor = exploreCursor(after, key);
    const result = await this.ranking.page(filter, cursor);
    const rows = result.rows.slice(0, communityPageSize),
      last = rows.at(-1);
    const groups = new Map(
      (
        await this.communities.readMany(
          this.pool,
          rows.map((r) => r.community_id),
        )
      ).map((g) => [g.id, g]),
    );
    return {
      generation: result.head.id,
      cutoff: result.head.cutoff.toISOString(),
      expiresAt: result.head.expires_at.toISOString(),
      next:
        result.rows.length > communityPageSize && last
          ? JSON.stringify({
              filter: key,
              generation: result.head.id,
              rank: Number(last.rank),
              id: last.community_id,
            })
          : null,
      items: rows.flatMap((row) => {
        const community = groups.get(row.community_id);
        return community && (filter.order === 'size' || !community.archived)
          ? [
              {
                community,
                activity: row.contributions,
                participants: row.participants,
                upvotes: row.upvotes,
                historyComplete: row.history_complete,
              },
            ]
          : [];
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
