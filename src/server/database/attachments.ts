import { recoverInterruptedUploads } from './upload-recovery.ts';
import { AttachmentReservations } from './attachment-reservations.ts';
import type { AttachmentReservationAllocations } from './attachment-reservation-allocations.ts';
import type { FileReclamation } from './file-reclamation.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
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
  private readonly reclamation: FileReclamation | undefined;
  private readonly contacts: ContactStore;
  private readonly reservations: AttachmentReservations;
  constructor(
    pool: pg.Pool,
    contacts: ContactStore,
    capacity: ContentCapacity,
    writers: {
      reclamation?: FileReclamation | undefined;
      reservations?: AttachmentReservationAllocations | undefined;
    } = {},
  ) {
    this.pool = pool;
    this.reclamation = writers.reclamation;
    this.contacts = contacts;
    this.reservations = new AttachmentReservations({
      contacts,
      capacity,
      allocations: writers.reservations,
    });
  }
  async reserve(
    a: ContactAuthority,
    input: { message: string; peer: string; refs: AttachmentRef[] },
  ): Promise<unknown> {
    return this.reservations.reserve(a, input);
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
      throw new AccountError(404, 'Attachment reservation unavailable.');
    if (
      !(await this.contacts.messageDeliveryAllowed(
        c,
        row.sender,
        row.recipient,
      ))
    )
      throw new AccountError(423, 'Transfer suspended due to missing consent.');
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
        throw new AccountError(400, 'Part does not exist.');
      if (row.status === 'writing')
        throw new AccountError(409, 'Attachment busy.');
      if (
        row.status === 'accepted' ||
        row.status === 'ready' ||
        (index !== null && row.received.includes(index))
      )
        return { ref: row.descriptor, writer: null };
      if (index === null && row.received.length !== row.descriptor.parts.length)
        throw new AccountError(409, 'Attachment incomplete.');
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
        throw new AccountError(409, 'Attachment write interrupted.');
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
        throw new AccountError(409, 'Send accepted: use bilateral deletion.');
      const writers = await c.query(
        "SELECT 1 FROM hash_talk.message_attachments WHERE message_id=$1 AND sender=$2 AND status='writing'",
        [message, a.session.accountId],
      );
      if (writers.rowCount)
        throw new AccountError(409, 'Wait for the active transfer to finish.');
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
        throw new AccountError(409, 'Attachment not fully preserved.');
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
        throw new AccountError(404, 'Attachment unavailable.');
      const removed = await c.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
        [a.session.accountId, input.message],
      );
      if (removed.rowCount)
        throw new AccountError(
          410,
          'Attachment removed from the personal vault.',
        );
      if (
        !(await this.contacts.messageDeliveryAllowed(
          c,
          row.sender,
          row.recipient,
        ))
      )
        throw new AccountError(
          423,
          'Download suspended due to missing consent.',
        );
      if (!row.descriptor.parts[input.index])
        throw new AccountError(400, 'Invalid part.');
      return row.descriptor;
    });
  }
  async resumeInterrupted(): Promise<void> {
    // Startup only, after the previous single application writer has stopped.
    await recoverInterruptedUploads(this.pool, 'message_attachments');
  }
  async garbage(): Promise<{ id: string }[]> {
    const result = await this.pool.query<{ id: string }>(
      `WITH due AS MATERIALIZED (
        SELECT id,status FROM hash_talk.message_attachments WHERE status='deleting' OR
        (status IN ('reserved','ready') AND created_at<now()-interval '24 hours')
        ORDER BY created_at,id LIMIT 8
      ), changed AS (
        UPDATE hash_talk.message_attachments SET status='deleting'
        WHERE id IN (SELECT id FROM due) AND status IN ('reserved','ready') RETURNING id
      ) SELECT id FROM due WHERE status='deleting' UNION ALL SELECT id FROM changed`,
    );
    return result.rows;
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      "SELECT min(CASE WHEN status='deleting' THEN clock_timestamp() ELSE created_at+interval '24 hours 1 millisecond' END) AS at FROM hash_talk.message_attachments WHERE status IN ('deleting','reserved','ready')",
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
  async collected(id: string): Promise<void> {
    const effect = (client: Pick<pg.PoolClient, 'query'>) =>
      client.query(
        "DELETE FROM hash_talk.message_attachments WHERE id=$1 AND status='deleting'",
        [id],
      );
    if (this.reclamation)
      return this.reclamation.run(
        this.pool,
        { source: 'message_attachments', id },
        effect,
      );
    await effect(this.pool);
  }
}
