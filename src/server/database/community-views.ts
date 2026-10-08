import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { ContactStore } from './contacts.ts';
import { assertContentCapacity } from './vault-quota.ts';
import { postObservations } from '../../shared/community-views/index.ts';
import type { PostViews } from '../../shared/community-views/index.ts';

/** Independent per-post marks; no account, common browser identity or visit timeline. */
export class CommunityViewsStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, contacts: ContactStore, capacity: number) {
    this.pool = pool;
    this.contacts = contacts;
    this.capacity = capacity;
  }
  async observe(input: unknown): Promise<{ items: PostViews[] }> {
    const observations = postObservations(input).map((item) => ({
      community: item.community,
      post: item.post,
      hash: createHash('sha256')
        .update(`${item.post}:${item.token}`)
        .digest('hex'),
    }));
    return this.contacts.withMaintenance(async (client) => {
      // Lock in a fixed order; deletion/removal and concurrent observations serialize.
      await client.query(
        `SELECT id FROM hash_talk.community_posts WHERE
        id=ANY($1::uuid[]) OR id IN(SELECT root_id FROM hash_talk.community_posts WHERE id=ANY($1::uuid[]))
        ORDER BY id FOR UPDATE`,
        [observations.map((item) => item.post)],
      );
      const eligible = await client.query<{ id: string }>(
        `SELECT p.id FROM hash_talk.community_posts p
         JOIN jsonb_to_recordset($1::jsonb) AS i(community uuid,post uuid,hash text)
         ON p.community_id=i.community AND p.id=i.post
         WHERE NOT p.deleted AND p.active_removal IS NULL
         AND (p.root_id IS NULL OR EXISTS(SELECT 1 FROM hash_talk.community_posts r
           WHERE r.id=p.root_id AND NOT r.deleted AND r.active_removal IS NULL))
         ORDER BY p.id`,
        [JSON.stringify(observations)],
      );
      const ids = eligible.rows.map((row) => row.id);
      const inserted = await client.query(
        `WITH added AS (
          INSERT INTO hash_talk.community_post_view_marks(post_id,viewer_hash)
          SELECT i.post,i.hash FROM jsonb_to_recordset($1::jsonb)
          AS i(community uuid,post uuid,hash text) WHERE i.post=ANY($2::uuid[])
          ON CONFLICT DO NOTHING RETURNING post_id
        ) UPDATE hash_talk.community_posts p SET views=views+1
          FROM added WHERE p.id=added.post_id`,
        [JSON.stringify(observations), ids],
      );
      if (inserted.rowCount) await assertContentCapacity(client, this.capacity);
      const counts = await client.query<{ id: string; views: string }>(
        'SELECT id,views::text FROM hash_talk.community_posts WHERE id=ANY($1::uuid[]) ORDER BY id',
        [ids],
      );
      return {
        items: counts.rows.map((row) => ({
          id: row.id,
          views: Number(row.views),
        })),
      };
    });
  }
  /** Deletion retires marks in bounded batches; removed/restorable posts retain them. */
  async collect(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM hash_talk.community_post_view_marks m WHERE (m.post_id,m.viewer_hash) IN
       (SELECT m.post_id,m.viewer_hash FROM hash_talk.community_post_view_marks m
        JOIN hash_talk.community_posts p ON p.id=m.post_id WHERE p.deleted
        ORDER BY m.post_id,m.viewer_hash LIMIT 128)`,
    );
    return result.rowCount ?? 0;
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query(
      `SELECT 1 FROM hash_talk.community_post_view_marks m JOIN hash_talk.community_posts p
       ON p.id=m.post_id WHERE p.deleted LIMIT 1`,
    );
    return result.rowCount ? Date.now() : null;
  }
}
