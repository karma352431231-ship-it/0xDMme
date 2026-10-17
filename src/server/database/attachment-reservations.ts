import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  attachmentRefs,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type { AttachmentReservationAllocations } from './attachment-reservation-allocations.ts';
import {
  assertContentCapacity,
  assertVaultQuota,
  lockContentUsage,
} from './vault-quota.ts';
import { withUploadAdmission } from './upload-admission.ts';

interface Input {
  message: string;
  peer: string;
  refs: AttachmentRef[];
}
interface ReservationRow {
  id: string;
  message_id: string;
  sender: string;
  recipient: string;
  descriptor: AttachmentRef;
  received: number[];
  status: string;
}

/** Owns reservation validation, both-owner quotas and the complete SQL effect. */
export class AttachmentReservations {
  private readonly contacts: ContactStore;
  private readonly capacity: ContentCapacity;
  private readonly allocations: AttachmentReservationAllocations | undefined;
  constructor(input: {
    contacts: ContactStore;
    capacity: ContentCapacity;
    allocations: AttachmentReservationAllocations | undefined;
  }) {
    this.contacts = input.contacts;
    this.capacity = input.capacity;
    this.allocations = input.allocations;
  }
  reserve(authority: ContactAuthority, data: Input): Promise<unknown> {
    const input = { ...data, refs: attachmentRefs(data.refs, chatFileLimit) };
    return withUploadAdmission(() =>
      this.contacts.withMessageConsent(authority, input.peer, (client) =>
        this.admit(client, authority, input),
      ),
    );
  }
  private async admit(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: Input,
  ) {
    const message = await client.query(
      'SELECT 1 FROM hash_talk.message_packets WHERE id=$1',
      [input.message],
    );
    if (message.rowCount)
      throw new AccountError(409, 'Mensagem já aceita ou apagada.');
    // Legacy accounting must lock its ledger before byte owners. Adopted growth
    // uses the complete bound plan and durable physical credit instead.
    if (!this.allocations) await lockContentUsage(client);
    const existing = await client.query<ReservationRow>(
      'SELECT * FROM hash_talk.message_attachments WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [input.refs.map((ref) => ref.id)],
    );
    this.validate(existing.rows, authority, input);
    const missing = input.refs
      .filter((ref) => !existing.rows.some((row) => row.id === ref.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (missing.length) await this.expectSelection(client, input);
    const growth = this.allocations
      ? await this.allocations.reserve(client, {
          ...input,
          accountId: authority.session.accountId,
        })
      : true;
    for (const ref of missing)
      await this.insert(client, authority, { ...input, ref });
    await assertVaultQuota(client, authority.session.accountId);
    await assertVaultQuota(client, input.peer);
    if (growth) await assertContentCapacity(client, this.capacity);
    const rows = await client.query<ReservationRow>(
      'SELECT * FROM hash_talk.message_attachments WHERE id=ANY($1::uuid[])',
      [input.refs.map((ref) => ref.id)],
    );
    return rows.rows.map((row) => ({
      id: row.id,
      received: row.received,
      ready: row.status === 'ready',
    }));
  }
  private validate(
    rows: ReservationRow[],
    authority: ContactAuthority,
    input: Input,
  ): void {
    for (const row of rows) {
      const ref = input.refs.find((item) => item.id === row.id);
      if (
        row.sender !== authority.session.accountId ||
        row.recipient !== input.peer ||
        row.message_id !== input.message ||
        canonical(row.descriptor) !== canonical(ref) ||
        row.status === 'deleting'
      )
        throw new AccountError(409, 'Reserva de anexo divergente.');
    }
  }
  private async expectSelection(
    client: pg.PoolClient,
    input: Input,
  ): Promise<void> {
    const other = await client.query(
      'SELECT 1 FROM hash_talk.message_attachments WHERE message_id=$1 AND NOT(id=ANY($2::uuid[]))',
      [input.message, input.refs.map((ref) => ref.id)],
    );
    if (other.rowCount)
      throw new AccountError(409, 'Referências do envio divergentes.');
  }
  private async insert(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: { message: string; peer: string; ref: AttachmentRef },
  ): Promise<void> {
    await client.query(
      'INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
      [
        input.ref.id,
        input.message,
        authority.session.accountId,
        input.peer,
        JSON.stringify(input.ref),
        input.ref.bytes,
        input.ref.bytes + 4096,
      ],
    );
  }
}
