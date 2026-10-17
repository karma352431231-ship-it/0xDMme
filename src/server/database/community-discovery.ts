import type { ContentCapacity } from './content-capacity.ts';
import { savedPostIds } from './community-preferences.ts';
import { visiblePost } from './community-post-visibility.ts';
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
import { feedRank, feedSelection } from './community-feed-policy.ts';
import { operatePostPreference } from './community-preferences.ts';
import { operatePostShare, sharedPostIds } from './post-sharing.ts';
import { postVotes } from './community-interactions.ts';
import { attachProfileShares } from './profile-activity-sharing.ts';
import type { PostVote } from '../../shared/community-posts/index.ts';
import { profileActivityFilter } from '../../shared/profile-social/index.ts';

type Reader = Pick<pg.PoolClient, 'query'>;
interface RankedRow {
  id: string;
  rank: string;
  created_at: Date;
}
interface FeedRow extends RankedRow {
  post_id?: string;
  shared_at?: Date | null;
  community_id: string;
  name: string;
}
function window(filter: FeedFilter, after: unknown, actor: string | null) {
  const key = actor ? `${actor}:${discoveryKey(filter)}` : discoveryKey(filter),
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
function activityWindow(profile: string, tab: string, after: string | null) {
  const filter = profileActivityFilter({ profile, tab });
  const key = JSON.stringify(filter),
    cursor = rankCursor(after, key),
    anchor = cursor?.anchor ?? new Date().toISOString();
  if (Date.parse(anchor) > Date.now() + 1000)
    throw new AccountError(400, 'Cursor no futuro.');
  return { key, cursor, anchor };
}
function activityIdentity(row: FeedRow) {
  return row.post_id ? { activityId: row.id } : {};
}
function viewerInteractions(
  actor: string | null,
  state: {
    votes: Map<string, PostVote>;
    shares: Set<string>;
    saved: Set<string>;
  },
  id: string,
) {
  return actor
    ? {
        viewerVote: state.votes.get(id)?.position ?? 0,
        viewerShared: state.shares.has(id),
        viewerSaved: state.saved.has(id),
      }
    : {};
}
export class CommunityDiscoveryStore {
  private readonly pool: pg.Pool;
  private readonly communities: CommunityStore;
  private readonly posts: (
    client: Reader,
    ids: string[],
  ) => Promise<CommunityPost[]>;
  private readonly capacity: ContentCapacity;
  private readonly ranking: CommunityRankingStore;
  constructor(options: {
    pool: pg.Pool;
    ranking: CommunityRankingStore;
    communities: CommunityStore;
    posts: (client: Reader, ids: string[]) => Promise<CommunityPost[]>;
    capacity: ContentCapacity;
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
      current = window(filter, options.after, actor);
    const rank = feedRank(filter.order);
    const found = await client.query<FeedRow>(
      `WITH candidates AS (
      SELECT p.id,p.root_id,p.author,p.community_id,c.name,p.created_at,${rank} AS rank
      FROM hash_talk.community_posts p JOIN hash_talk.communities c ON c.id=p.community_id
      LEFT JOIN hash_talk.community_post_preferences pref ON pref.post_id=p.id AND pref.profile_id=$1
      WHERE ($2 IN ('saved','hidden') OR (${visiblePost('p')}
        AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND ${visiblePost('root')}))
        AND (p.parent_id IS NULL OR (($2='following' OR $3::uuid IS NULL) AND (
          ($2='all' AND $11='mixed' AND p.author IS NOT NULL AND (p.score>=5 OR p.discussion_participants>=3)) OR
          (($2='following' OR $11<>'mixed') AND EXISTS(SELECT 1 FROM hash_talk.public_profile_follows pf WHERE pf.follower=$1 AND pf.target=p.author AND pf.following)))))))
      AND ($3::uuid IS NULL OR p.community_id=$3) AND ($4::uuid IS NULL OR p.tag_id=$4 OR EXISTS(SELECT 1 FROM hash_talk.community_post_extra_tags e WHERE e.post_id=p.id AND e.tag_id=$4))
      AND ($5::timestamptz IS NULL OR p.created_at>=$5) AND p.created_at<=$6
      AND ($2<>'following' OR (p.parent_id IS NULL AND EXISTS(SELECT 1 FROM hash_talk.community_follows f WHERE f.profile_id=$1 AND f.community_id=p.community_id))
        OR EXISTS(SELECT 1 FROM hash_talk.public_profile_follows pf WHERE pf.follower=$1 AND pf.target=p.author AND pf.following))
      AND ($2<>'saved' OR pref.saved) AND ($2<>'hidden' OR pref.hidden)
      AND ($2 IN ('saved','hidden') OR NOT coalesce(pref.hidden,false))
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.actor=$1 AND b.blocked AND
        (b.target=p.author OR b.target IN (SELECT a.author FROM hash_talk.community_posts a WHERE a.id=p.parent_id OR a.id=p.root_id)))
    ), ranked AS (${feedSelection(filter)}) SELECT * FROM ranked WHERE representative=1 AND ($7::bigint IS NULL OR (rank,created_at,id)<($7,$8::timestamptz,$9::uuid))
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
        filter.order,
      ],
    );
    return this.projectFeed(client, page(found.rows, current), {
      scope: filter.scope,
      actor,
    });
  }
  async profileActivity(
    profile: string,
    tab: string,
    after: string | null,
    reader?: { client: Reader; actor: string },
  ): Promise<FeedPage> {
    const { key, cursor, anchor } = activityWindow(profile, tab, after);
    const { client, actor } = reader ?? { client: this.pool, actor: null };
    const found = await client.query<FeedRow>(
      `WITH activity AS (
        SELECT id AS activity_id,id AS post_id,created_at,NULL::timestamptz AS shared_at FROM hash_talk.community_posts WHERE author=$1
        UNION ALL SELECT id,post_id,created_at,created_at FROM hash_talk.community_post_shares WHERE profile_id=$1 AND shared AND $3='overview'
      ) SELECT a.activity_id AS id,p.id AS post_id,p.community_id,c.name,a.created_at,a.shared_at,0::bigint AS rank
      FROM activity a JOIN hash_talk.community_posts p ON p.id=a.post_id JOIN hash_talk.communities c ON c.id=p.community_id
      WHERE true AND ${visiblePost('p')} AND a.created_at<=$2
      AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts root WHERE root.id=p.root_id AND ${visiblePost('root')}))
      AND ($3='overview' OR ($3='posts' AND p.parent_id IS NULL) OR ($3='replies' AND p.parent_id IS NOT NULL))
      AND ($4::timestamptz IS NULL OR (a.created_at,a.activity_id)<($4,$5::uuid))
      AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.actor=$7 AND b.blocked AND
        (b.target=p.author OR b.target IN (SELECT a.author FROM hash_talk.community_posts a WHERE a.id=p.parent_id OR a.id=p.root_id)))
      ORDER BY a.created_at DESC,a.activity_id DESC LIMIT $6`,
      [
        profile,
        anchor,
        tab,
        cursor?.time ?? null,
        cursor?.id ?? null,
        communityPageSize + 1,
        actor,
      ],
    );
    const result = await this.projectFeed(
      client,
      page(found.rows, { key, anchor }),
      { scope: 'all', actor: actor },
    );
    return attachProfileShares({
      rows: found.rows,
      page: result,
      viewer: actor,
      author: () => this.communities.publicIdentity(client, profile),
    });
  }
  private async projectFeed(
    client: Reader,
    result: { items: FeedRow[]; next: string | null },
    options: { scope: FeedFilter['scope']; actor: string | null } = {
      scope: 'all',
      actor: null,
    },
  ): Promise<FeedPage> {
    const { scope, actor } = options;
    const publicOnly = scope === 'all' || scope === 'following';
    const primary = await this.posts(client, [
      ...new Set(result.items.map((row) => row.post_id ?? row.id)),
    ]);
    const posts = new Map(primary.map((post) => [post.id, post]));
    const ancestors = await this.ancestors(client, primary);
    const photos = await this.communities.photoReferences(client, [
      ...new Set(result.items.map((row) => row.community_id)),
    ]);
    const owned = actor
      ? await client.query<{ id: string }>(
          'SELECT id FROM hash_talk.communities WHERE owner=$1 AND id=ANY($2::uuid[])',
          [actor, [...new Set(result.items.map((row) => row.community_id))]],
        )
      : null;
    const ownedIds = new Set(owned?.rows.map((row) => row.id));
    const ids = primary.map((post) => post.id);
    const votes = actor
      ? await postVotes(client, actor, ids)
      : new Map<string, PostVote>();
    const shares = actor
      ? await sharedPostIds(client, actor, ids)
      : new Set<string>();
    const saved = actor
      ? await savedPostIds(client, actor, ids)
      : new Set<string>();
    return {
      next: result.next,
      items: result.items.flatMap((row) => {
        const post = posts.get(row.post_id ?? row.id);
        if (!availablePost(post, publicOnly)) return [];
        const avatar = photos.get(row.community_id);
        const context = this.replyContext(post, ancestors);
        if (post.root && !context && publicOnly) return [];
        return [
          {
            post,
            ...activityIdentity(row),
            ...viewerInteractions(actor, { votes, shares, saved }, post.id),
            ...(actor ? { ownCommunity: ownedIds.has(row.community_id) } : {}),
            ...(context ? { context } : {}),
            community: {
              id: row.community_id,
              name: row.name,
              ...(avatar ? { avatar } : {}),
            },
          },
        ];
      }),
    };
  }
  private async ancestors(client: Reader, primary: CommunityPost[]) {
    const found = new Map(primary.map((post) => [post.id, post]));
    const ids = [
      ...new Set(
        primary.flatMap((post) =>
          post.root && post.parent ? [post.root, post.parent] : [],
        ),
      ),
    ].filter((id) => !found.has(id));
    // A page of 24 nested replies has at most 48 distinct ancestors.
    // Preserve the post store's per-read bound with at most two batches.
    for (let offset = 0; offset < ids.length; offset += communityPageSize) {
      const batch = await this.posts(
        client,
        ids.slice(offset, offset + communityPageSize),
      );
      for (const post of batch) found.set(post.id, post);
    }
    return found;
  }
  private replyContext(
    post: CommunityPost,
    ancestors: Map<string, CommunityPost>,
  ) {
    if (!post.root || !post.parent) return null;
    const root = ancestors.get(post.root),
      parent = ancestors.get(post.parent);
    return root?.status === 'visible' && parent ? { root, parent } : null;
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
                previousParticipants: row.previous_participants,
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
      if (operation.startsWith('discovery-share'))
        return operatePostShare(context, operation, data, this.capacity);
      return operatePostPreference(context, operation, data, this.capacity);
    });
  }
}

function availablePost(
  post: CommunityPost | undefined,
  publicOnly: boolean,
): post is CommunityPost {
  return !!post && (!publicOnly || post.status === 'visible');
}
