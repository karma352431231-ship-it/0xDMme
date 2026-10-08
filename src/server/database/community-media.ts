import type pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import {
  communityMediaLimits,
  communityMediaSet,
  communityMediaPartBytes,
  communityMediaResult,
} from '../../shared/community-media/index.ts';
import type {
  CommunityMediaSource,
  CommunityMediaResult,
  CommunityMediaState,
} from '../../shared/community-media/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { CommunityStore } from './communities.ts';
import { requireCommunityParticipation } from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import { assertContentCapacity } from './vault-quota.ts';
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';
import { publicModerationRetentionMs } from '../../shared/public-moderation/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';

interface MediaRow {
  id: string;
  community_id: string;
  author: string | null;
  source: CommunityMediaSource;
  received: string[];
  status: CommunityMediaState['status'] | 'deleting';
  result: CommunityMediaResult | null;
  writer: string | null;
  post_id: string | null;
  error: string | null;
  expires_at: Date;
  created_at: Date;
  result_hash: string | null;
  thumbnail_hash: string | null;
  moderation_review: string | null;
  moderationStatus?: string | null;
  moderationExpires?: Date | null;
}
export interface PublicModerationMediaCandidate {
  id: string;
  result: CommunityMediaResult;
  resultHash: string;
  thumbnailHash: string;
}
function mediaHash(
  result: CommunityMediaResult,
  hashes: { resultHash: string; thumbnailHash: string },
): string {
  return createHash('sha256')
    .update(canonical({ version: 'prepared-media-v1', result, ...hashes }))
    .digest('hex');
}
function matchesReview(
  row: MediaRow | undefined,
  review: PublicModerationSubject,
): row is MediaRow & {
  result: CommunityMediaResult;
  result_hash: string;
  thumbnail_hash: string;
} {
  return row?.author === review.owner && matchesMediaBytes(row, review);
}
function matchesMediaBytes(
  row: MediaRow | undefined,
  review: PublicModerationSubject,
): row is MediaRow & {
  result: CommunityMediaResult;
  result_hash: string;
  thumbnail_hash: string;
} {
  return (
    row !== undefined &&
    review.kind === 'post-media' &&
    row.id === review.target &&
    row.moderation_review === review.id &&
    ['ready', 'attached'].includes(row.status) &&
    preparedHash(row) === review.contentHash
  );
}
function preparedHash(row: MediaRow): string | null {
  if (!row.result || !row.result_hash || !row.thumbnail_hash) return null;
  return mediaHash(row.result, {
    resultHash: row.result_hash,
    thumbnailHash: row.thumbnail_hash,
  });
}
function state(row: MediaRow): CommunityMediaState {
  if (row.status === 'deleting')
    throw new AccountError(404, 'Mídia indisponível.');
  return {
    source: row.source,
    received: row.received.length,
    status: row.status,
    result: row.result,
    error: row.error,
  };
}
function requirePart(row: MediaRow, index: number | null): void {
  const parts = Math.ceil(row.source.bytes / communityMediaPartBytes);
  if (index === null && row.received.length !== parts)
    throw new AccountError(409, 'Upload incompleto.');
  if (index !== null && index >= parts)
    throw new AccountError(400, 'Parte inexistente.');
}
function requireMediaLifetime(row: MediaRow): void {
  if (['removed', 'discarding', 'expired'].includes(row.moderationStatus ?? ''))
    throw new AccountError(404, 'Mídia indisponível.');
  if (!row.post_id && row.expires_at.getTime() <= Date.now())
    throw new AccountError(410, 'Upload expirou. Inicie outro envio.');
  if (
    row.moderationExpires &&
    row.moderationStatus !== 'approved' &&
    row.moderationExpires.getTime() <= Date.now()
  )
    throw new AccountError(
      410,
      'Mídia sem aprovação expirou. Envie outro arquivo.',
    );
}
function requireMediaAttachment(
  row: MediaRow,
  context: CommunityContext,
  post: string,
): void {
  if (
    row.author !== context.actor.id ||
    row.community_id !== context.row.id ||
    !['ready', 'attached'].includes(row.status) ||
    (row.post_id && row.post_id !== post)
  )
    throw new AccountError(403, 'Mídia não disponível para esta postagem.');
  if (!row.moderation_review)
    throw new AccountError(409, 'Mídia sem análise vigente.');
  requireMediaLifetime(row);
}
export class CommunityMediaStore {
  private readonly pool: pg.Pool;
  private readonly communities: CommunityStore;
  private readonly capacity: number;
  private readonly moderation: PublicModerationStore;
  constructor(
    pool: pg.Pool,
    communities: CommunityStore,
    capacity: number,
    moderation: PublicModerationStore,
  ) {
    this.pool = pool;
    this.communities = communities;
    this.capacity = capacity;
    this.moderation = moderation;
  }
  private async owned(
    context: CommunityContext,
    id: string,
  ): Promise<MediaRow> {
    const found = await context.client.query<MediaRow>(
      'SELECT m.*,r.status AS "moderationStatus",r.expires_at AS "moderationExpires" FROM hash_talk.community_media m LEFT JOIN hash_talk.public_moderation r ON r.id=m.moderation_review WHERE m.id=$1 AND m.community_id=$2 FOR UPDATE OF m',
      [id, context.row.id],
    );
    const row = found.rows[0];
    if (!row || row.author !== context.actor.id || row.status === 'deleting')
      throw new AccountError(404, 'Mídia indisponível.');
    requireMediaLifetime(row);
    return row;
  }
  async reserve(
    a: ContactAuthority,
    community: string,
    source: CommunityMediaSource,
  ): Promise<CommunityMediaState> {
    return this.communities.withContext(a, community, async (c) => {
      await requireCommunityParticipation(c);
      const found = await c.client.query<MediaRow>(
        'SELECT * FROM hash_talk.community_media WHERE id=$1 FOR UPDATE',
        [source.id],
      );
      const old = found.rows[0];
      if (old) {
        if (
          old.author !== c.actor.id ||
          old.community_id !== community ||
          canonical(old.source) !== canonical(source)
        )
          throw new AccountError(409, 'Reserva de mídia divergente.');
        return state(await this.owned(c, source.id));
      }
      const used = await c.client.query(
        "SELECT 1 FROM hash_talk.public_moderation WHERE kind='post-media' AND target=$1 LIMIT 1",
        [source.id],
      );
      if (used.rowCount)
        throw new AccountError(
          409,
          'Identificador de mídia já utilizado. Inicie outro envio.',
        );
      const charge =
        source.bytes * 2 +
        communityMediaLimits[source.kind].result +
        96_000 +
        32_768;
      const result = await c.client.query<MediaRow>(
        'INSERT INTO hash_talk.community_media(id,community_id,author,source,charge) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *',
        [source.id, community, c.actor.id, JSON.stringify(source), charge],
      );
      await assertContentCapacity(c.client, this.capacity);
      return state(result.rows[0]!);
    });
  }
  async status(
    a: ContactAuthority,
    community: string,
    id: string,
  ): Promise<CommunityMediaState> {
    return this.communities.withContext(a, community, async (c) =>
      state(await this.owned(c, id)),
    );
  }
  async pending(
    a: ContactAuthority,
    community: string,
  ): Promise<CommunityMediaState[]> {
    return this.communities.withContext(a, community, async (c) => {
      const rows = await c.client.query<MediaRow>(
        "SELECT * FROM hash_talk.community_media WHERE community_id=$1 AND author=$2 AND post_id IS NULL AND status<>'deleting' AND expires_at>now() ORDER BY expires_at DESC,id DESC LIMIT 32",
        [community, c.actor.id],
      );
      return rows.rows.map(state);
    });
  }
  async begin(
    a: ContactAuthority,
    input: {
      community: string;
      id: string;
      index: number | null;
      hash: string | null;
    },
  ) {
    return this.communities.withContext(a, input.community, async (c) => {
      await requireCommunityParticipation(c);
      const row = await this.owned(c, input.id);
      requirePart(row, input.index);
      if (input.index !== null && row.received[input.index] !== undefined) {
        if (row.received[input.index] !== input.hash)
          throw new AccountError(409, 'Parte de mídia divergente.');
        return { state: state(row), writer: null };
      }
      if (row.status !== 'uploading')
        return { state: state(row), writer: null };
      if (row.writer)
        throw new AccountError(409, 'Upload em andamento. Aguarde.');
      if (input.index !== null && input.index !== row.received.length)
        throw new AccountError(409, 'Retome a próxima parte do upload.');
      const writer = randomUUID();
      await c.client.query(
        'UPDATE hash_talk.community_media SET writer=$2,error=NULL WHERE id=$1',
        [input.id, writer],
      );
      return { state: state(row), writer };
    });
  }
  async part(
    a: ContactAuthority,
    input: { community: string; id: string; writer: string; hash: string },
  ): Promise<void> {
    await this.communities.withContext(a, input.community, async (c) => {
      await requireCommunityParticipation(c);
      const row = await this.owned(c, input.id);
      if (row.writer !== input.writer)
        throw new AccountError(409, 'Upload interrompido.');
      await c.client.query(
        'UPDATE hash_talk.community_media SET received=array_append(received,$3),writer=NULL WHERE id=$1 AND writer=$2',
        [input.id, input.writer, input.hash],
      );
    });
  }
  async processing(id: string, writer: string): Promise<void> {
    const updated = await this.pool.query(
      "UPDATE hash_talk.community_media SET status='processing' WHERE id=$1 AND writer=$2 AND status='uploading'",
      [id, writer],
    );
    if (!updated.rowCount)
      throw new AccountError(409, 'Preparação interrompida.');
  }
  async ready(
    a: ContactAuthority,
    input: {
      community: string;
      id: string;
      writer: string;
      result: CommunityMediaResult;
      resultHash: string;
      thumbnailHash: string;
    },
  ): Promise<void> {
    await this.communities.withContext(a, input.community, async (c) => {
      await requireCommunityParticipation(c);
      const row = await this.owned(c, input.id);
      if (row.writer !== input.writer || row.status !== 'processing')
        throw new AccountError(409, 'Preparação interrompida.');
      const result = communityMediaResult(input.result),
        hashes = {
          resultHash: fingerprint(input.resultHash),
          thumbnailHash: fingerprint(input.thumbnailHash),
        };
      if (row.created_at.getTime() + publicModerationRetentionMs <= Date.now())
        throw new AccountError(410, 'Upload expirou. Inicie outro envio.');
      await this.moderation.enqueue(
        c.client,
        {
          owner: c.actor.id,
          target: input.id,
          kind: 'post-media',
          contentHash: mediaHash(result, hashes),
          createdAt: row.created_at,
        },
        async (review) => {
          await c.client.query(
            "UPDATE hash_talk.community_media SET status='ready',result=$3::jsonb,writer=NULL,error=NULL,result_hash=$4,thumbnail_hash=$5,moderation_review=$6 WHERE id=$1 AND writer=$2",
            [
              input.id,
              input.writer,
              JSON.stringify(result),
              hashes.resultHash,
              hashes.thumbnailHash,
              review,
            ],
          );
        },
      );
    });
  }
  async release(
    id: string,
    writer: string,
    error: string | null = null,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.community_media SET status='uploading',writer=NULL,error=$3 WHERE id=$1 AND writer=$2 AND post_id IS NULL",
      [id, writer, error],
    );
  }
  async cancel(
    a: ContactAuthority,
    community: string,
    id: string,
  ): Promise<void> {
    await this.communities.withContext(a, community, async (c) => {
      const row = await this.owned(c, id);
      if (row.post_id || row.writer)
        throw new AccountError(409, 'Mídia vinculada ou em processamento.');
      await c.client.query(
        "UPDATE hash_talk.community_media SET status='deleting' WHERE id=$1",
        [id],
      );
      if (row.moderation_review)
        await this.moderation.remove(c.client, row.moderation_review);
    });
  }
  /** Caller owns the post transaction: author, set limits and binding commit atomically. */
  async replace(
    c: CommunityContext,
    input: { post: string; ids: string[] },
  ): Promise<void> {
    const found = await c.client.query<MediaRow>(
      'SELECT m.*,r.status AS "moderationStatus",r.expires_at AS "moderationExpires" FROM hash_talk.community_media m LEFT JOIN hash_talk.public_moderation r ON r.id=m.moderation_review WHERE m.id=ANY($1::uuid[]) ORDER BY m.id FOR UPDATE OF m',
      [input.ids],
    );
    if (found.rows.length !== input.ids.length)
      throw new AccountError(400, 'Mídia não preparada.');
    for (const row of found.rows) requireMediaAttachment(row, c, input.post);
    communityMediaSet(found.rows.map((r) => r.source));
    const detached = await c.client.query<{ moderation_review: string | null }>(
      "UPDATE hash_talk.community_media SET status='deleting',post_id=NULL WHERE post_id=$1 AND NOT(id=ANY($2::uuid[])) RETURNING moderation_review",
      [input.post, input.ids],
    );
    for (const row of detached.rows)
      if (row.moderation_review)
        await this.moderation.remove(c.client, row.moderation_review);
    await c.client.query(
      "UPDATE hash_talk.community_media SET status='attached',post_id=$2 WHERE id=ANY($1::uuid[]) AND post_id IS NULL",
      [input.ids, input.post],
    );
  }
  async garbage(): Promise<string[]> {
    await this.moderation.expired('post-media');
    await this.transaction(async (client) => {
      const expired = await client.query<{ moderation_review: string | null }>(
        `WITH expired AS (SELECT m.id FROM hash_talk.community_media m
          LEFT JOIN hash_talk.public_moderation r ON r.id=m.moderation_review
          WHERE m.writer IS NULL AND m.status<>'deleting'
            AND ((m.post_id IS NULL AND (m.expires_at<=now() OR m.author IS NULL)) OR r.status IN ('discarding','removed'))
          ORDER BY m.expires_at,m.id LIMIT 32 FOR UPDATE OF m SKIP LOCKED)
        UPDATE hash_talk.community_media SET status='deleting',post_id=NULL
        WHERE id IN(SELECT id FROM expired) RETURNING moderation_review`,
      );
      for (const row of expired.rows)
        if (row.moderation_review)
          await this.moderation.discard(client, row.moderation_review);
    });
    return (
      await this.pool.query<{ id: string }>(
        "SELECT id FROM hash_talk.community_media WHERE status='deleting' ORDER BY id LIMIT 32",
      )
    ).rows.map((r) => r.id);
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      `SELECT min(CASE
        WHEN m.status='deleting' OR r.status IN ('discarding','removed') OR (m.post_id IS NULL AND m.author IS NULL) OR
         (m.status IN ('ready','attached') AND m.charge>(m.result->>'bytes')::bigint+(m.result->>'thumbnailBytes')::bigint+32768)
         THEN clock_timestamp()
        WHEN m.post_id IS NULL THEN m.expires_at
        WHEN r.status NOT IN ('approved','expired','removed') THEN r.expires_at
        ELSE NULL END) AS at
       FROM hash_talk.community_media m LEFT JOIN hash_talk.public_moderation r ON r.id=m.moderation_review
       WHERE m.status<>'processing' AND m.writer IS NULL`,
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
  async collected(id: string): Promise<void> {
    await this.transaction(async (client) => {
      const row = await client.query<{ moderation_review: string | null }>(
        "SELECT moderation_review FROM hash_talk.community_media WHERE id=$1 AND status='deleting' FOR UPDATE",
        [id],
      );
      if (!row.rows[0]) return;
      if (row.rows[0].moderation_review)
        await this.moderation.collected(client, row.rows[0].moderation_review);
      await client.query(
        "DELETE FROM hash_talk.community_media WHERE id=$1 AND status='deleting'",
        [id],
      );
    });
  }
  async moderationCandidate(
    review: PublicModerationSubject,
  ): Promise<PublicModerationMediaCandidate | null> {
    if (review.kind !== 'post-media') return null;
    const found = await this.pool.query<MediaRow>(
      'SELECT * FROM hash_talk.community_media WHERE id=$1',
      [review.target],
    );
    const row = found.rows[0];
    if (!matchesReview(row, review)) return null;
    return {
      id: row.id,
      result: row.result,
      resultHash: row.result_hash,
      thumbnailHash: row.thumbnail_hash,
    };
  }
  async references(
    client: Pick<pg.PoolClient, 'query'>,
    posts: string[],
  ): Promise<Map<string, PublicPostMedia[]>> {
    if (posts.length > 24)
      throw new AccountError(400, 'Página de mídia excedida.');
    const found = await client.query<MediaRow>(
      `SELECT m.* FROM hash_talk.community_media m JOIN hash_talk.community_posts p ON p.id=m.post_id
        WHERE m.post_id=ANY($1::uuid[]) AND m.status='attached' AND NOT p.deleted AND p.active_removal IS NULL
          AND m.id=ANY(p.media_ids) ORDER BY m.post_id,array_position(p.media_ids,m.id)`,
      [posts],
    );
    const released = await this.moderation.released(
      client,
      found.rows.flatMap((row) =>
        row.moderation_review ? [row.moderation_review] : [],
      ),
    );
    const refs = new Map<string, PublicPostMedia[]>();
    for (const row of found.rows) {
      const review = row.moderation_review
        ? released.get(row.moderation_review)
        : null;
      if (!review || !row.post_id || !matchesMediaBytes(row, review)) continue;
      const list = refs.get(row.post_id) ?? [];
      list.push({ id: row.id, review: review.id, result: row.result });
      refs.set(row.post_id, list);
    }
    return refs;
  }
  async releasedMedia(
    target: string,
    review: string,
  ): Promise<PublicModerationMediaCandidate | null> {
    const subject = (await this.moderation.released(this.pool, [review])).get(
      review,
    );
    if (!subject || subject.kind !== 'post-media' || subject.target !== target)
      return null;
    const found = await this.pool.query<MediaRow>(
      `SELECT m.* FROM hash_talk.community_media m JOIN hash_talk.community_posts p ON p.id=m.post_id
        WHERE m.id=$1 AND m.status='attached' AND NOT p.deleted AND p.active_removal IS NULL AND m.id=ANY(p.media_ids)`,
      [target],
    );
    const row = found.rows[0];
    if (!matchesMediaBytes(row, subject)) return null;
    return {
      id: row.id,
      result: row.result,
      resultHash: row.result_hash,
      thumbnailHash: row.thumbnail_hash,
    };
  }
  async bindModeration(client: pg.PoolClient, review: PublicModerationSubject) {
    if (review.kind !== 'post-media') return null;
    const found = await client.query<MediaRow>(
      'SELECT * FROM hash_talk.community_media WHERE id=$1 FOR UPDATE',
      [review.target],
    );
    if (!matchesReview(found.rows[0], review)) return null;
    // The queue commits the decision. Public projections remain closed until validated.
    return () => Promise.resolve();
  }
  async bindPolicy(client: pg.PoolClient, review: PublicModerationSubject) {
    if (review.kind !== 'post-media') return null;
    const found = await client.query<MediaRow>(
      'SELECT * FROM hash_talk.community_media WHERE id=$1 FOR UPDATE',
      [review.target],
    );
    if (!matchesReview(found.rows[0], review)) return null;
    return async (next: string) => {
      await client.query(
        'UPDATE hash_talk.community_media SET moderation_review=$2 WHERE id=$1',
        [review.target, next],
      );
    };
  }
  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async unsettled(): Promise<string[]> {
    return (
      await this.pool.query<{ id: string }>(
        "SELECT id FROM hash_talk.community_media WHERE status IN ('ready','attached') AND charge>(result->>'bytes')::bigint+(result->>'thumbnailBytes')::bigint+32768 ORDER BY id LIMIT 32",
      )
    ).rows.map((r) => r.id);
  }
  async settled(id: string): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.community_media SET charge=(result->>'bytes')::bigint+(result->>'thumbnailBytes')::bigint+32768 WHERE id=$1 AND status IN ('ready','attached') AND charge<>(result->>'bytes')::bigint+(result->>'thumbnailBytes')::bigint+32768",
      [id],
    );
  }
  async resumeInterrupted(): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.community_media SET status='uploading',writer=NULL WHERE writer IS NOT NULL AND post_id IS NULL",
    );
  }
}
