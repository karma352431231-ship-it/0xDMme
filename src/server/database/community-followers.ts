import type pg from 'pg';
import { AccountError, uuid } from '../../shared/account/index.ts';
import {
  communityCursor,
  communityPageSize,
} from '../../shared/communities/index.ts';
import { communityFollowerTab } from '../../shared/community-followers/index.ts';
import type { CommunityFollowers } from '../../shared/community-followers/index.ts';
import type { PublicProfileStore } from './public-profile.ts';
/** Public graph projection; signed variants filter blocks and authorize the viewer elsewhere. */
export class CommunityFollowerStore {
  private readonly profiles: PublicProfileStore;
  constructor(profiles: PublicProfileStore) {
    this.profiles = profiles;
  }
  async read(input: {
    client: Pick<pg.PoolClient, 'query'>;
    id: unknown;
    tab: unknown;
    after: unknown;
    viewer?: string | null;
  }): Promise<CommunityFollowers> {
    const id = uuid(input.id),
      tab = communityFollowerTab(input.tab),
      after = communityCursor(input.after),
      viewer = input.viewer ?? null;
    const exists = await input.client.query<{ owner: string | null }>(
      'SELECT owner FROM hash_talk.communities WHERE id=$1',
      [id],
    );
    if (!exists.rowCount)
      throw new AccountError(404, 'Comunidade indisponível.');
    if (tab === 'known' && !viewer) return { items: [], total: 0, next: null };
    const result = await input.client.query<{ total: string; ids: string[] }>(
      `WITH eligible AS (
        SELECT f.profile_id AS id FROM (
          SELECT profile_id FROM hash_talk.community_follows WHERE community_id=$1 AND $3<>'staff'
          UNION SELECT owner FROM hash_talk.communities WHERE id=$1 AND owner IS NOT NULL AND $3='staff'
          UNION SELECT profile_id FROM hash_talk.community_moderators WHERE community_id=$1 AND $3='staff'
        ) f WHERE ($3<>'known' OR EXISTS(SELECT 1 FROM hash_talk.public_profile_follows pf WHERE pf.follower=$2 AND pf.target=f.profile_id AND pf.following))
        AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=$2 AND b.target=f.profile_id) OR (b.target=$2 AND b.actor=f.profile_id))))
      ) SELECT (SELECT count(*) FROM eligible)::text AS total,
        ARRAY(SELECT id FROM eligible WHERE ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5) AS ids`,
      [id, viewer, tab, after, communityPageSize + 1],
    );
    const row = result.rows[0]!,
      ids = row.ids.slice(0, communityPageSize),
      profiles = await this.profiles.identities(input.client, ids);
    const moderators = await input.client.query<{ profile_id: string }>(
      'SELECT profile_id FROM hash_talk.community_moderators WHERE community_id=$1 AND profile_id=ANY($2::uuid[])',
      [id, ids],
    );
    const staff = new Set(moderators.rows.map((item) => item.profile_id));
    const owner = exists.rows[0]!.owner;
    return {
      items: ids
        .filter((id) => profiles.has(id))
        .map((id) => ({
          ...profiles.get(id)!,
          role: id === owner ? 'owner' : staff.has(id) ? 'moderator' : null,
        })),
      total: Number(row.total),
      next: row.ids.length > communityPageSize ? ids.at(-1)! : null,
    };
  }
}
