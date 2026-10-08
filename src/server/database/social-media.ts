import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import { socialMedia } from '../../shared/social-media/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { SocialContext, SocialDmStore } from './social-dm.ts';
import type { SocialHistoryStore } from './social-history.ts';
import { pendingMedia } from './media-quota.ts';

interface Row {
  id: string;
  message_id: string;
  sender: string;
  recipient: string;
  descriptor: AttachmentRef;
  media: SocialMedia;
  status: string;
  received: number[];
  writer: string | null;
}
/** Social consent is evaluated atomically; no private contact IDs or grants enter this table. */
export class SocialMediaStore {
  private readonly pool: pg.Pool;
  private readonly social: SocialDmStore;
  private readonly history: SocialHistoryStore;
  constructor(
    pool: pg.Pool,
    social: SocialDmStore,
    history: SocialHistoryStore,
  ) {
    this.pool = pool;
    this.social = social;
    this.history = history;
  }
  private async row(c: pg.PoolClient, id: string): Promise<Row | null> {
    return (
      (
        await c.query<Row>(
          'SELECT * FROM hash_talk.social_media WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0] ?? null
    );
  }
  async reserve(
    a: ContactAuthority,
    data: {
      message: string;
      peer: string;
      refs: AttachmentRef[];
      media?: SocialMedia;
    },
  ) {
    const input = { ...data, media: socialMedia(data.media) };
    return this.social.withActor(a, async (context) => {
      await this.social.requireConsent(context, input.peer);
      const existing = await context.client.query(
        'SELECT 1 FROM hash_talk.social_messages WHERE id=$1',
        [input.message],
      );
      if (existing.rowCount)
        throw new AccountError(409, 'Mensagem de DM já aceita.');
      const counts = await pendingMedia(context.client, a.session.accountId);
      for (const ref of input.refs) {
        const old = await this.row(context.client, ref.id);
        if (old) {
          this.same(old, context, input, ref);
          continue;
        }
        if (counts.personal >= 4 || counts.global >= 256)
          throw new AccountError(
            429,
            'Transferências em andamento. Retome ou cancele antes de iniciar outras.',
          );
        const other = await context.client.query(
          'SELECT 1 FROM hash_talk.social_media WHERE message_id=$1 AND NOT(id=ANY($2::uuid[]))',
          [input.message, input.refs.map((r) => r.id)],
        );
        if (other.rowCount)
          throw new AccountError(
            409,
            'Referências da transferência de DM mudaram.',
          );
        await context.client.query(
          'INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,bytes,sender_charge,recipient_charge,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8,$8)',
          [
            ref.id,
            input.message,
            context.actor.id,
            input.peer,
            JSON.stringify(ref),
            input.media,
            ref.bytes,
            ref.bytes + 4096,
          ],
        );
        counts.personal++;
        counts.global++;
      }
      await this.social.limits(context, [context.actor.id, input.peer]);
      const rows = await context.client.query<Row>(
        'SELECT * FROM hash_talk.social_media WHERE id=ANY($1::uuid[])',
        [input.refs.map((r) => r.id)],
      );
      return rows.rows.map((r) => ({
        id: r.id,
        received: r.received,
        ready: r.status === 'ready',
      }));
    });
  }
  private same(
    row: Row,
    context: SocialContext,
    input: { message: string; peer: string; media: SocialMedia },
    ref: AttachmentRef,
  ): void {
    if (
      row.sender !== context.actor.id ||
      row.recipient !== input.peer ||
      row.message_id !== input.message ||
      row.media !== input.media ||
      canonical(row.descriptor) !== canonical(ref) ||
      row.status === 'deleting'
    )
      throw new AccountError(409, 'Reserva de mídia de DM divergente.');
  }
  private async owned(context: SocialContext, id: string): Promise<Row> {
    const row = await this.row(context.client, id);
    if (!row || row.sender !== context.actor.id || row.status === 'deleting')
      throw new AccountError(404, 'Reserva de mídia de DM indisponível.');
    await this.social.requireConsent(context, row.recipient);
    return row;
  }
  async preflight(a: ContactAuthority, id: string): Promise<void> {
    await this.social.withActor(a, async (context) => {
      await this.owned(context, id);
    });
  }
  async begin(a: ContactAuthority, id: string, index: number | null) {
    return this.social.withActor(a, async (context) => {
      const row = await this.owned(context, id);
      if (index !== null && !row.descriptor.parts[index])
        throw new AccountError(400, 'Parte de mídia inexistente.');
      if (row.status === 'writing')
        throw new AccountError(409, 'Transferência de DM ocupada.');
      if (
        ['accepted', 'ready'].includes(row.status) ||
        (index !== null && row.received.includes(index))
      )
        return { ref: row.descriptor, writer: null };
      if (index === null && row.received.length !== row.descriptor.parts.length)
        throw new AccountError(409, 'Transferência de DM incompleta.');
      const writer = randomUUID();
      await context.client.query(
        "UPDATE hash_talk.social_media SET status='writing',writer=$2,lease_at=now() WHERE id=$1",
        [id, writer],
      );
      return { ref: row.descriptor, writer };
    });
  }
  async finish(
    a: ContactAuthority,
    input: { id: string; writer: string; index: number | null },
  ): Promise<void> {
    await this.social.withActor(a, async (context) => {
      const row = await this.owned(context, input.id);
      if (row.writer !== input.writer)
        throw new AccountError(409, 'Transferência de DM interrompida.');
      await context.client.query(
        'UPDATE hash_talk.social_media SET status=$3,writer=NULL,lease_at=NULL,received=$4 WHERE id=$1 AND writer=$2',
        [
          input.id,
          input.writer,
          input.index === null ? 'ready' : 'reserved',
          input.index === null
            ? row.received
            : [...row.received, input.index].sort((x, y) => x - y),
        ],
      );
    });
  }
  async release(id: string, writer: string): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.social_media SET status='reserved',writer=NULL,lease_at=NULL WHERE id=$1 AND writer=$2 AND status='writing'",
      [id, writer],
    );
  }
  async cancel(a: ContactAuthority, message: string): Promise<void> {
    await this.social.withActor(a, async (context) => {
      const sent = await context.client.query(
        'SELECT 1 FROM hash_talk.social_messages WHERE id=$1',
        [message],
      );
      if (sent.rowCount)
        throw new AccountError(
          409,
          'DM aceita: use a limpeza pessoal após preservar seu backup.',
        );
      const active = await context.client.query(
        "SELECT 1 FROM hash_talk.social_media WHERE message_id=$1 AND sender=$2 AND status='writing'",
        [message, context.actor.id],
      );
      if (active.rowCount)
        throw new AccountError(409, 'Aguarde a transferência ativa terminar.');
      await context.client.query(
        "UPDATE hash_talk.social_media SET status='deleting' WHERE message_id=$1 AND sender=$2 AND status<>'deleting'",
        [message, context.actor.id],
      );
    });
  }
  async admit(c: pg.PoolClient, packet: MessagePacket): Promise<void> {
    const refs = packet.attachments ?? [];
    const rows = await c.query<Row>(
      'SELECT * FROM hash_talk.social_media WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [refs.map((r) => r.id)],
    );
    if (
      refs.some(
        (ref) =>
          !rows.rows.some(
            (row) =>
              row.id === ref.id &&
              row.status === 'ready' &&
              row.message_id === packet.id &&
              row.sender === packet.sender &&
              row.recipient === packet.recipient &&
              row.media === packet.socialMedia &&
              canonical(row.descriptor) === canonical(ref),
          ),
      )
    )
      throw new AccountError(
        409,
        'Mídia de DM não está integralmente preservada.',
      );
    if (refs.length)
      await c.query(
        "UPDATE hash_talk.social_media SET status='accepted' WHERE id=ANY($1::uuid[])",
        [refs.map((r) => r.id)],
      );
  }
  async readable(
    a: ContactAuthority,
    input: { message: string; id: string; index: number },
  ): Promise<AttachmentRef> {
    return this.social.withActor(a, async (context) => {
      const message = await this.history.owned(
          context.client,
          a,
          input.message,
        ),
        row = await this.row(context.client, input.id);
      if (
        !row ||
        row.status !== 'accepted' ||
        row.message_id !== input.message ||
        !message.body.attachments?.some((ref) => ref.id === row.id) ||
        !row.descriptor.parts[input.index]
      )
        throw new AccountError(404, 'Mídia de DM indisponível.');
      await this.social.requireConsent(
        context,
        row.sender === context.actor.id ? row.recipient : row.sender,
      );
      return row.descriptor;
    });
  }
  async garbage(): Promise<{ id: string }[]> {
    await this.social.maintenance(async (c) => {
      await c.query(
        "UPDATE hash_talk.social_media SET status='reserved',writer=NULL,lease_at=NULL WHERE id IN (SELECT id FROM hash_talk.social_media WHERE status='writing' AND lease_at<now()-interval '2 minutes' ORDER BY lease_at,id LIMIT 8)",
      );
      await c.query(
        "UPDATE hash_talk.social_media SET status='deleting' WHERE id IN (SELECT id FROM hash_talk.social_media WHERE status IN ('reserved','ready') AND reserved_at<now()-interval '24 hours' ORDER BY reserved_at,id LIMIT 8)",
      );
    });
    return (
      await this.pool.query<{ id: string }>(
        "SELECT id FROM hash_talk.social_media WHERE status='deleting' ORDER BY reserved_at,id LIMIT 8",
      )
    ).rows;
  }
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.social_media WHERE id=$1 AND status='deleting'",
      [id],
    );
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      "SELECT min(CASE WHEN status='deleting' THEN clock_timestamp() WHEN status='writing' THEN lease_at+interval '2 minutes 1 millisecond' ELSE reserved_at+interval '24 hours 1 millisecond' END) AS at FROM hash_talk.social_media WHERE status IN ('deleting','writing','reserved','ready')",
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
}
