import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { StatusPacket } from '../../shared/status/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { StatusStore } from './status.ts';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
import { pendingMedia } from './media-quota.ts';
interface MediaRow {
  id: string;
  status_id: string;
  author: string;
  descriptor: AttachmentRef;
  status: string;
  received: number[];
  writer: string | null;
}
export class StatusMediaStore {
  private readonly pool: pg.Pool;
  private readonly posts: StatusStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, posts: StatusStore, capacity: number) {
    this.pool = pool;
    this.posts = posts;
    this.capacity = capacity;
  }
  private async row(client: pg.PoolClient, id: string): Promise<MediaRow> {
    const result = await client.query<MediaRow>(
      'SELECT * FROM hash_talk.status_media WHERE id=$1 FOR UPDATE',
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(404, 'Mídia de status indisponível.');
    return row;
  }
  async reserve(
    a: ContactAuthority,
    input: { statusId: string; refs: AttachmentRef[] },
  ): Promise<unknown> {
    return this.posts.withDraft(a, input.statusId, async (client) => {
      const extra = await client.query(
        'SELECT 1 FROM hash_talk.status_media WHERE status_id=$1 AND NOT(id=ANY($2::uuid[]))',
        [input.statusId, input.refs.map((r) => r.id)],
      );
      if (extra.rowCount)
        throw new AccountError(409, 'Referências de status divergentes.');
      const counts = await pendingMedia(client, a.session.accountId);
      for (const ref of input.refs) {
        const existing = await client.query<MediaRow>(
          'SELECT * FROM hash_talk.status_media WHERE id=$1',
          [ref.id],
        );
        if (existing.rows[0]) {
          this.assertReservation(existing.rows[0], a, input.statusId, ref);
          continue;
        }
        if (counts.personal >= 4 || counts.global >= 256)
          throw new AccountError(
            429,
            'Conclua ou cancele as transferências em andamento.',
          );
        const descriptor = JSON.stringify(ref);
        await client.query(
          'INSERT INTO hash_talk.status_media(id,status_id,author,descriptor,bytes,charge) VALUES($1,$2,$3,$4::jsonb,$5,$6)',
          [
            ref.id,
            input.statusId,
            a.session.accountId,
            descriptor,
            ref.bytes,
            ref.bytes + Buffer.byteLength(descriptor) + 512,
          ],
        );
        counts.personal++;
        counts.global++;
      }
      await assertVaultQuota(client, a.session.accountId);
      await assertContentCapacity(client, this.capacity);
      const rows = await client.query<MediaRow>(
        'SELECT * FROM hash_talk.status_media WHERE status_id=$1',
        [input.statusId],
      );
      return rows.rows.map((r) => ({
        id: r.id,
        received: r.received,
        ready: r.status === 'ready',
      }));
    });
  }
  private assertReservation(
    row: MediaRow,
    a: ContactAuthority,
    statusId: string,
    ref: AttachmentRef,
  ): void {
    if (
      row.status_id !== statusId ||
      row.author !== a.session.accountId ||
      row.status === 'deleting' ||
      canonical(row.descriptor) !== canonical(ref)
    )
      throw new AccountError(409, 'Reserva de status divergente.');
  }
  async begin(
    a: ContactAuthority,
    input: { statusId: string; id: string; index: number | null },
  ): Promise<{ ref: AttachmentRef; writer: string | null }> {
    return this.posts.withDraft(a, input.statusId, async (client) => {
      const row = await this.row(client, input.id);
      this.assertReservation(row, a, input.statusId, row.descriptor);
      if (input.index !== null && !row.descriptor.parts[input.index])
        throw new AccountError(400, 'Parte inexistente.');
      if (row.status === 'writing')
        throw new AccountError(409, 'Mídia ocupada.');
      if (
        row.status === 'ready' ||
        (input.index !== null && row.received.includes(input.index))
      )
        return { ref: row.descriptor, writer: null };
      if (
        input.index === null &&
        row.received.length !== row.descriptor.parts.length
      )
        throw new AccountError(409, 'Mídia incompleta.');
      const writer = randomUUID();
      await client.query(
        "UPDATE hash_talk.status_media SET status='writing',writer=$2 WHERE id=$1",
        [input.id, writer],
      );
      return { ref: row.descriptor, writer };
    });
  }
  async finish(
    a: ContactAuthority,
    input: {
      statusId: string;
      id: string;
      index: number | null;
      writer: string;
    },
  ): Promise<void> {
    await this.posts.withDraft(a, input.statusId, async (client) => {
      const row = await this.row(client, input.id);
      this.assertReservation(row, a, input.statusId, row.descriptor);
      if (row.writer !== input.writer)
        throw new AccountError(409, 'Escrita interrompida.');
      await client.query(
        'UPDATE hash_talk.status_media SET status=$3,writer=NULL,received=$4 WHERE id=$1 AND writer=$2',
        [
          input.id,
          input.writer,
          input.index === null ? 'ready' : 'reserved',
          input.index === null
            ? row.received
            : [...row.received, input.index].sort((a, b) => a - b),
        ],
      );
    });
  }
  async release(id: string, writer: string): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.status_media SET status='reserved',writer=NULL WHERE id=$1 AND writer=$2 AND status='writing'",
      [id, writer],
    );
  }
  /** Coordinated by publication: all declared files must be durable, and no undeclared reservation is accepted. */
  async admit(client: pg.PoolClient, packet: StatusPacket): Promise<void> {
    const refs = packet.attachments ?? [];
    const rows = await client.query<MediaRow>(
      'SELECT * FROM hash_talk.status_media WHERE status_id=$1 FOR UPDATE',
      [packet.id],
    );
    if (rows.rows.length !== refs.length)
      throw new AccountError(409, 'Mídias declaradas e preservadas divergem.');
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    for (const ref of refs) {
      const row = byId.get(ref.id);
      if (
        !row ||
        row.status !== 'ready' ||
        row.author !== packet.author ||
        canonical(row.descriptor) !== canonical(ref)
      )
        throw new AccountError(409, 'Foto não está integralmente preservada.');
    }
    await client.query(
      "UPDATE hash_talk.status_media SET status='accepted' WHERE status_id=$1 AND status='ready'",
      [packet.id],
    );
  }
  async readable(
    a: ContactAuthority,
    input: { statusId: string; id: string; index: number },
  ): Promise<AttachmentRef> {
    return this.posts.withReadable(a, input.statusId, async (client) => {
      const row = await this.row(client, input.id);
      if (row.status_id !== input.statusId || row.status !== 'accepted')
        throw new AccountError(404, 'Foto indisponível ou expirada.');
      if (!row.descriptor.parts[input.index])
        throw new AccountError(400, 'Parte inexistente.');
      return row.descriptor;
    });
  }
  async resumeInterrupted(): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.status_media SET status='reserved',writer=NULL WHERE status='writing'",
    );
  }
  async garbage(): Promise<{ id: string; status_id: string }[]> {
    const result = await this.pool.query<{ id: string; status_id: string }>(
      "UPDATE hash_talk.status_media SET status='deleting' WHERE id IN (SELECT m.id FROM hash_talk.status_media m JOIN hash_talk.status_posts p ON p.id=m.status_id WHERE p.state='deleting' AND m.status<>'writing' ORDER BY m.id LIMIT 8) AND status<>'writing' RETURNING id,status_id",
    );
    return result.rows;
  }
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.status_media WHERE id=$1 AND status='deleting'",
      [id],
    );
  }
  async hasMedia(id: string): Promise<boolean> {
    return !!(
      await this.pool.query(
        'SELECT 1 FROM hash_talk.status_media WHERE status_id=$1 LIMIT 1',
        [id],
      )
    ).rowCount;
  }
}
