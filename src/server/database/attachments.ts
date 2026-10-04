import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';
import { pendingMedia } from './media-quota.ts';
interface AttachmentRow {
  id: string;
  message_id: string;
  sender: string;
  recipient: string;
  descriptor: AttachmentRef;
  received: number[];
  status: string;
  writer: string | null;
}
export class AttachmentStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, contacts: ContactStore, capacity: number) {
    this.pool = pool;
    this.contacts = contacts;
    this.capacity = capacity;
  }
  async reserve(
    a: ContactAuthority,
    input: { message: string; peer: string; refs: AttachmentRef[] },
  ): Promise<unknown> {
    return this.contacts.withMessageConsent(a, input.peer, async (c) => {
      const message = await c.query(
        'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
        [input.message],
      );
      if (message.rowCount)
        throw new AccountError(409, 'Mensagem já aceita ou apagada.');
      const counts = await pendingMedia(c, a.session.accountId);
      for (const ref of input.refs) {
        const existing = await this.row(c, ref.id);
        if (existing) {
          this.sameReservation(existing, a, input, ref);
          continue;
        }
        if (counts.personal >= 4 || counts.global >= 256)
          throw new AccountError(
            429,
            'Transferências em andamento. Conclua ou cancele antes de iniciar outras.',
          );
        const other = await c.query(
          'SELECT 1 FROM hash_talk.message_attachments WHERE message_id=$1 AND NOT(id=ANY($2::uuid[]))',
          [input.message, input.refs.map((r) => r.id)],
        );
        if (other.rowCount)
          throw new AccountError(409, 'Referências do envio divergentes.');
        await c.query(
          'INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
          [
            ref.id,
            input.message,
            a.session.accountId,
            input.peer,
            JSON.stringify(ref),
            ref.bytes,
            ref.bytes + 4096,
          ],
        );
        counts.personal++;
        counts.global++;
      }
      await assertVaultQuota(c, a.session.accountId);
      await assertVaultQuota(c, input.peer);
      await assertContentCapacity(c, this.capacity);
      const rows = await c.query<AttachmentRow>(
        'SELECT * FROM hash_talk.message_attachments WHERE id=ANY($1::uuid[])',
        [input.refs.map((r) => r.id)],
      );
      return rows.rows.map((r) => ({
        id: r.id,
        received: r.received,
        ready: r.status === 'ready',
      }));
    });
  }
  private sameReservation(
    row: AttachmentRow,
    a: ContactAuthority,
    input: { message: string; peer: string },
    ref: AttachmentRef,
  ): void {
    if (
      row.sender !== a.session.accountId ||
      row.recipient !== input.peer ||
      row.message_id !== input.message ||
      canonical(row.descriptor) !== canonical(ref) ||
      row.status === 'deleting'
    )
      throw new AccountError(409, 'Reserva de anexo divergente.');
  }
  private async row(
    c: pg.PoolClient,
    id: string,
  ): Promise<AttachmentRow | null> {
    const result = await c.query<AttachmentRow>(
      'SELECT * FROM hash_talk.message_attachments WHERE id=$1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  }
  async preflight(a: ContactAuthority, id: string): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, id);
    });
  }
  private async owned(
    c: pg.PoolClient,
    a: ContactAuthority,
    id: string,
  ): Promise<AttachmentRow> {
    const row = await this.row(c, id);
    if (!row || row.sender !== a.session.accountId || row.status === 'deleting')
      throw new AccountError(404, 'Reserva de anexo indisponível.');
    if (
      !(await this.contacts.messageDeliveryAllowed(
        c,
        row.sender,
        row.recipient,
      ))
    )
      throw new AccountError(
        423,
        'Transferência suspensa por falta de consentimento.',
      );
    return row;
  }
  async begin(
    a: ContactAuthority,
    id: string,
    index: number | null,
  ): Promise<{ ref: AttachmentRef; writer: string | null }> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await this.owned(c, a, id);
      if (index !== null && !row.descriptor.parts[index])
        throw new AccountError(400, 'Parte inexistente.');
      if (row.status === 'writing')
        throw new AccountError(409, 'Anexo ocupado.');
      if (
        row.status === 'accepted' ||
        row.status === 'ready' ||
        (index !== null && row.received.includes(index))
      )
        return { ref: row.descriptor, writer: null };
      if (index === null && row.received.length !== row.descriptor.parts.length)
        throw new AccountError(409, 'Anexo incompleto.');
      const writer = randomUUID();
      await c.query(
        "UPDATE hash_talk.message_attachments SET status='writing',writer=$2 WHERE id=$1",
        [id, writer],
      );
      return { ref: row.descriptor, writer };
    });
  }
  async finish(
    a: ContactAuthority,
    input: { id: string; writer: string; index: number | null },
  ): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await this.owned(c, a, input.id);
      if (row.writer !== input.writer)
        throw new AccountError(409, 'Escrita de anexo interrompida.');
      await c.query(
        'UPDATE hash_talk.message_attachments SET status=$3,writer=NULL,received=$4 WHERE id=$1 AND writer=$2',
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
      "UPDATE hash_talk.message_attachments SET status='reserved',writer=NULL WHERE id=$1 AND writer=$2 AND status='writing'",
      [id, writer],
    );
  }
  async cancel(a: ContactAuthority, message: string): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const sent = await c.query(
        'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
        [message],
      );
      if (sent.rowCount)
        throw new AccountError(409, 'Envio aceito: use a exclusão bilateral.');
      const writers = await c.query(
        "SELECT 1 FROM hash_talk.message_attachments WHERE message_id=$1 AND sender=$2 AND status='writing'",
        [message, a.session.accountId],
      );
      if (writers.rowCount)
        throw new AccountError(409, 'Aguarde a transferência ativa terminar.');
      await c.query(
        "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1 AND sender=$2 AND status<>'deleting'",
        [message, a.session.accountId],
      );
    });
  }
  /** Called inside message admission: preserve the exact signed objects atomically. */
  async admit(c: pg.PoolClient, packet: MessagePacket): Promise<void> {
    for (const ref of packet.attachments ?? []) {
      const row = await this.row(c, ref.id);
      if (
        !row ||
        row.status !== 'ready' ||
        row.message_id !== packet.id ||
        row.sender !== packet.sender ||
        row.recipient !== packet.recipient ||
        canonical(row.descriptor) !== canonical(ref)
      )
        throw new AccountError(409, 'Anexo não está integralmente preservado.');
      await c.query(
        "UPDATE hash_talk.message_attachments SET status='accepted' WHERE id=$1",
        [ref.id],
      );
    }
  }
  async readable(
    a: ContactAuthority,
    input: { message: string; id: string; index: number },
  ): Promise<AttachmentRef> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await this.row(c, input.id);
      if (
        !row ||
        row.status !== 'accepted' ||
        row.message_id !== input.message ||
        ![row.sender, row.recipient].includes(a.session.accountId)
      )
        throw new AccountError(404, 'Anexo indisponível.');
      const removed = await c.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
        [a.session.accountId, input.message],
      );
      if (removed.rowCount)
        throw new AccountError(410, 'Anexo removido do cofre pessoal.');
      if (
        !(await this.contacts.messageDeliveryAllowed(
          c,
          row.sender,
          row.recipient,
        ))
      )
        throw new AccountError(
          423,
          'Download suspenso por falta de consentimento.',
        );
      if (!row.descriptor.parts[input.index])
        throw new AccountError(400, 'Parte inválida.');
      return row.descriptor;
    });
  }
  async resumeInterrupted(): Promise<void> {
    // Startup only, after the previous single application writer has stopped.
    await this.pool.query(
      "UPDATE hash_talk.message_attachments SET status='reserved',writer=NULL WHERE status='writing'",
    );
  }
  async garbage(): Promise<{ id: string }[]> {
    const result = await this.pool.query<{ id: string }>(
      `UPDATE hash_talk.message_attachments SET status='deleting' WHERE id IN
      (SELECT id FROM hash_talk.message_attachments WHERE status='deleting' OR
      (status IN ('reserved','ready') AND created_at<now()-interval '24 hours') ORDER BY created_at LIMIT 8)
      AND status IN ('reserved','ready','deleting') RETURNING id`,
    );
    return result.rows;
  }
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.message_attachments WHERE id=$1 AND status='deleting'",
      [id],
    );
  }
}
