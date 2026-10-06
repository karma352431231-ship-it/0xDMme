import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  communityMediaLimits,
  communityMediaSet,
  communityMediaPartBytes,
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
export class CommunityMediaStore {
  private readonly pool: pg.Pool;
  private readonly communities: CommunityStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, communities: CommunityStore, capacity: number) {
    this.pool = pool;
    this.communities = communities;
    this.capacity = capacity;
  }
  private async owned(
    context: CommunityContext,
    id: string,
  ): Promise<MediaRow> {
    const found = await context.client.query<MediaRow>(
      'SELECT * FROM hash_talk.community_media WHERE id=$1 AND community_id=$2 FOR UPDATE',
      [id, context.row.id],
    );
    const row = found.rows[0];
    if (!row || row.author !== context.actor.id || row.status === 'deleting')
      throw new AccountError(404, 'Mídia indisponível.');
    if (!row.post_id && row.expires_at.getTime() <= Date.now())
      throw new AccountError(410, 'Upload expirou. Inicie outro envio.');
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
    },
  ): Promise<void> {
    await this.communities.withContext(a, input.community, async (c) => {
      await requireCommunityParticipation(c);
      const row = await this.owned(c, input.id);
      if (row.writer !== input.writer || row.status !== 'processing')
        throw new AccountError(409, 'Preparação interrompida.');
      await c.client.query(
        "UPDATE hash_talk.community_media SET status='ready',result=$3::jsonb,writer=NULL,error=NULL WHERE id=$1 AND writer=$2",
        [input.id, input.writer, JSON.stringify(input.result)],
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
    });
  }
  /** Caller owns the post transaction: author, set limits and binding commit atomically. */
  async replace(
    c: CommunityContext,
    input: { post: string; ids: string[] },
  ): Promise<void> {
    const found = await c.client.query<MediaRow>(
      'SELECT * FROM hash_talk.community_media WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [input.ids],
    );
    if (found.rows.length !== input.ids.length)
      throw new AccountError(400, 'Mídia não preparada.');
    for (const row of found.rows) {
      if (
        row.author !== c.actor.id ||
        row.community_id !== c.row.id ||
        !['ready', 'attached'].includes(row.status) ||
        (row.post_id && row.post_id !== input.post)
      )
        throw new AccountError(403, 'Mídia não disponível para esta postagem.');
      if (!row.post_id && row.expires_at.getTime() <= Date.now())
        throw new AccountError(410, 'Mídia preparada expirou.');
    }
    communityMediaSet(found.rows.map((r) => r.source));
    await c.client.query(
      "UPDATE hash_talk.community_media SET status='deleting',post_id=NULL WHERE post_id=$1 AND NOT(id=ANY($2::uuid[]))",
      [input.post, input.ids],
    );
    await c.client.query(
      "UPDATE hash_talk.community_media SET status='attached',post_id=$2 WHERE id=ANY($1::uuid[]) AND post_id IS NULL",
      [input.ids, input.post],
    );
  }
  async garbage(): Promise<string[]> {
    await this.pool.query(
      "WITH expired AS (SELECT id FROM hash_talk.community_media WHERE post_id IS NULL AND writer IS NULL AND status<>'deleting' AND (expires_at<=now() OR author IS NULL) ORDER BY expires_at,id LIMIT 32 FOR UPDATE SKIP LOCKED) UPDATE hash_talk.community_media SET status='deleting' WHERE id IN(SELECT id FROM expired)",
    );
    return (
      await this.pool.query<{ id: string }>(
        "SELECT id FROM hash_talk.community_media WHERE status='deleting' ORDER BY id LIMIT 32",
      )
    ).rows.map((r) => r.id);
  }
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.community_media WHERE id=$1 AND status='deleting'",
      [id],
    );
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
