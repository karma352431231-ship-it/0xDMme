import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
} from '../../shared/communities/index.ts';
import { postCount } from '../../shared/community-posts/index.ts';
import type {
  ProfileFollow,
  ProfileSummary,
} from '../../shared/profile-social/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { CommunityStore } from './communities.ts';
import type { CommunityDiscoveryStore } from './community-discovery.ts';
import type { ContactAuthority } from './contacts.ts';
import { assertContentCapacity } from './vault-quota.ts';

/** Public pages and private follow operations use stable public profile IDs. */
interface ProfileSocialOptions {
  pool: pg.Pool;
  profiles: PublicProfileStore;
  communities: CommunityStore;
  discovery: CommunityDiscoveryStore;
  capacity: number;
}
export class ProfileSocialStore {
  private readonly options: ProfileSocialOptions;
  constructor(options: ProfileSocialOptions) {
    this.options = options;
  }
  private async profile(handle: string) {
    const profile = await this.options.profiles.read(handle);
    if (!profile) throw new AccountError(404, 'Perfil público indisponível.');
    return profile;
  }
  async summary(handle: string): Promise<ProfileSummary> {
    const profile = await this.profile(handle);
    const stats = await this.options.pool.query<{
      created_at: Date | null;
      posts: string;
      replies: string;
      conversations: string;
      communities: string;
      followers: string;
    }>(
      `WITH eligible AS (SELECT p.* FROM hash_talk.community_posts p
        WHERE p.author=$1 AND NOT p.deleted AND p.active_removal IS NULL
        AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts r WHERE r.id=p.root_id AND NOT r.deleted AND r.active_removal IS NULL)))
       SELECT created_at,
        (SELECT count(*) FROM eligible WHERE parent_id IS NULL) AS posts,
        (SELECT count(*) FROM eligible WHERE parent_id IS NOT NULL) AS replies,
        (SELECT count(*) FROM eligible e WHERE e.parent_id IS NULL AND EXISTS(
          SELECT 1 FROM hash_talk.community_posts r WHERE r.root_id=e.id AND r.author<>$1 AND NOT r.deleted AND r.active_removal IS NULL)) AS conversations,
        (SELECT count(*) FROM hash_talk.community_follows WHERE profile_id=$1) AS communities,
        (SELECT count(*) FROM hash_talk.public_profile_follows WHERE target=$1 AND following) AS followers
       FROM hash_talk.public_profiles WHERE id=$1`,
      [profile.id],
    );
    const row = stats.rows[0];
    if (!row) throw new AccountError(404, 'Perfil público indisponível.');
    return {
      profile,
      createdAt: row.created_at?.toISOString() ?? null,
      banner: await this.options.profiles.banners.reference(profile.id),
      posts: Number(row.posts),
      replies: Number(row.replies),
      conversations: Number(row.conversations),
      communities: Number(row.communities),
      followers: Number(row.followers),
    };
  }
  async memberships(handle: string, after: string | null) {
    const profile = await this.profile(handle);
    const rows = await this.options.pool.query<{ community_id: string }>(
      'SELECT community_id FROM hash_talk.community_follows WHERE profile_id=$1 AND ($2::uuid IS NULL OR community_id>$2) ORDER BY community_id LIMIT $3',
      [profile.id, communityCursor(after), communityPageSize + 1],
    );
    const ids = rows.rows
      .slice(0, communityPageSize)
      .map((row) => row.community_id);
    return {
      items: await this.options.communities.readMany(this.options.pool, ids),
      next: rows.rows.length > communityPageSize ? ids.at(-1)! : null,
    };
  }
  async activity(handle: string, tab: string, after: string | null) {
    const profile = await this.profile(handle);
    return this.options.discovery.profileActivity(profile.id, tab, after);
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<ProfileFollow> {
    const changing = operation === 'follow';
    keys(data, changing ? ['target', 'following', 'revision'] : ['target']);
    const target = uuid(data['target']);
    return this.options.communities.withActor(authority, async (context) => {
      const actor = context.actor.id;
      if (target === actor)
        throw new AccountError(409, 'Você já está no seu próprio perfil.');
      // Canonical order also prevents reciprocal follows from taking opposite locks.
      const exists = await context.client.query<{ id: string }>(
        'SELECT id FROM hash_talk.public_profiles WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[actor, target]],
      );
      if (!exists.rows.some((row) => row.id === target))
        throw new AccountError(404, 'Perfil público indisponível.');
      const found = await context.client.query<ProfileFollow>(
        'SELECT following,revision FROM hash_talk.public_profile_follows WHERE follower=$1 AND target=$2',
        [actor, target],
      );
      const old = found.rows[0] ?? { following: false, revision: 0 };
      if (!changing) return old;
      const following = communityBoolean(data['following']),
        revision = postCount(data['revision']);
      if (old.revision === revision + 1 && old.following === following)
        return old;
      if (old.revision !== revision)
        throw new AccountError(
          409,
          'A escolha de seguir mudou. Recarregue antes de tentar novamente.',
        );
      if (old.following === following) return old;
      const result = await context.client.query<ProfileFollow>(
        `INSERT INTO hash_talk.public_profile_follows(follower,target,following,revision) VALUES($1,$2,$3,1)
        ON CONFLICT(follower,target) DO UPDATE SET following=$3,revision=hash_talk.public_profile_follows.revision+1 RETURNING following,revision`,
        [actor, target, following],
      );
      await assertContentCapacity(context.client, this.options.capacity);
      return result.rows[0]!;
    });
  }
}
