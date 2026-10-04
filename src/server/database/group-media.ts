import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { groupCanRead } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { GroupPacket } from '../../shared/group-messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { GroupStore } from './groups.ts';
import {
  assertGroupContentQuota,
  assertGroupMediaQuota,
  groupMediaUsage,
} from './group-quota.ts';
import { assertContentCapacity } from './vault-quota.ts';
import { pendingMedia } from './media-quota.ts';
export interface GroupScope {
  groupId: string;
  head: string;
}
interface MediaRow {
  id: string;
  group_id: string;
  message_id: string;
  sender: string;
  epoch: number;
  descriptor: AttachmentRef;
  received: number[];
  status: string;
  writer: string | null;
}
function unavailable(): never {
  throw new AccountError(404, 'Mídia do grupo indisponível.');
}
export class GroupMediaStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly groups: GroupStore;
  private readonly capacity: number;
  constructor(
    pool: pg.Pool,
    contacts: ContactStore,
    groups: GroupStore,
    capacity: number,
  ) {
    this.pool = pool;
    this.contacts = contacts;
    this.groups = groups;
    this.capacity = capacity;
  }
  private async row(
    client: pg.PoolClient,
    id: string,
  ): Promise<MediaRow | null> {
    const result = await client.query<MediaRow>(
      'SELECT * FROM hash_talk.group_media WHERE id=$1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  }
  private async writable(
    client: pg.PoolClient,
    groupId: string,
  ): Promise<void> {
    const result = await client.query<{ clearing: boolean }>(
      'SELECT clearing FROM hash_talk.groups WHERE id=$1',
      [groupId],
    );
    if (!result.rows[0] || result.rows[0].clearing)
      throw new AccountError(409, 'Limpeza do cofre em andamento.');
  }
  async reserve(
    authority: ContactAuthority,
    input: GroupScope & { message: string; refs: AttachmentRef[] },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        await this.writable(client, input.groupId);
        const accepted = await client.query(
          'SELECT 1 FROM hash_talk.group_packets WHERE id=$1',
          [input.message],
        );
        if (accepted.rowCount)
          throw new AccountError(409, 'Mensagem já aceita ou apagada.');
        const pending = await pendingMedia(client, authority.session.accountId);
        for (const ref of input.refs) {
          const row = await this.row(client, ref.id);
          if (row) {
            this.same(row, authority, { ...input, epoch: state.epoch }, ref);
            continue;
          }
          if (pending.personal >= 4 || pending.global >= 256)
            throw new AccountError(
              429,
              'Conclua ou cancele as transferências em andamento.',
            );
          const extra = await client.query(
            'SELECT 1 FROM hash_talk.group_media WHERE group_id=$1 AND message_id=$2 AND NOT(id=ANY($3::uuid[]))',
            [input.groupId, input.message, input.refs.map((r) => r.id)],
          );
          if (extra.rowCount)
            throw new AccountError(409, 'Referências do envio divergentes.');
          const body = JSON.stringify(ref),
            overhead = Buffer.byteLength(body) + 512;
          await client.query(
            'INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)',
            [
              ref.id,
              input.groupId,
              state.epoch,
              input.message,
              authority.session.accountId,
              body,
              ref.bytes,
              overhead,
              ref.bytes + overhead,
            ],
          );
          pending.personal++;
          pending.global++;
        }
        await assertGroupMediaQuota(client, input.groupId);
        await assertGroupContentQuota(client, input.groupId);
        await assertContentCapacity(client, this.capacity);
        const rows = await client.query<MediaRow>(
          'SELECT * FROM hash_talk.group_media WHERE id=ANY($1::uuid[])',
          [input.refs.map((r) => r.id)],
        );
        return rows.rows.map((r) => ({
          id: r.id,
          received: r.received,
          ready: r.status === 'ready',
        }));
      },
    );
  }
  private same(
    row: MediaRow,
    authority: ContactAuthority,
    input: GroupScope & { message: string; epoch: number },
    ref: AttachmentRef,
  ): void {
    if (
      row.group_id !== input.groupId ||
      row.message_id !== input.message ||
      row.sender !== authority.session.accountId ||
      row.epoch !== input.epoch ||
      row.status === 'deleting' ||
      canonical(row.descriptor) !== canonical(ref)
    )
      throw new AccountError(409, 'Reserva de mídia divergente.');
  }
  private async owned(
    client: pg.PoolClient,
    authority: ContactAuthority,
    scope: GroupScope & { id: string },
    state: GroupEvent,
  ): Promise<MediaRow> {
    await this.writable(client, scope.groupId);
    const row = await this.row(client, scope.id);
    if (
      !row ||
      row.group_id !== scope.groupId ||
      row.sender !== authority.session.accountId ||
      row.status === 'deleting'
    )
      unavailable();
    if (row.epoch !== state.epoch)
      throw new AccountError(
        409,
        'Participação mudou durante o upload. Cancele e cifre novamente.',
      );
    return row;
  }
  async begin(
    authority: ContactAuthority,
    input: GroupScope & { id: string; index: number | null },
  ): Promise<{ ref: AttachmentRef; writer: string | null }> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const row = await this.owned(client, authority, input, state);
        if (input.index !== null && !row.descriptor.parts[input.index])
          throw new AccountError(400, 'Parte inexistente.');
        if (row.status === 'writing')
          throw new AccountError(409, 'Mídia ocupada.');
        if (
          row.status === 'ready' ||
          row.status === 'accepted' ||
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
          "UPDATE hash_talk.group_media SET status='writing',writer=$2 WHERE id=$1",
          [input.id, writer],
        );
        return { ref: row.descriptor, writer };
      },
    );
  }
  async finish(
    authority: ContactAuthority,
    input: GroupScope & { id: string; writer: string; index: number | null },
  ): Promise<void> {
    await this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const row = await this.owned(client, authority, input, state);
        if (row.writer !== input.writer)
          throw new AccountError(409, 'Escrita interrompida.');
        const received =
          input.index === null
            ? row.received
            : [...row.received, input.index].sort((a, b) => a - b);
        await client.query(
          'UPDATE hash_talk.group_media SET status=$3,writer=NULL,received=$4 WHERE id=$1 AND writer=$2',
          [
            input.id,
            input.writer,
            input.index === null ? 'ready' : 'reserved',
            received,
          ],
        );
      },
    );
  }
  async release(id: string, writer: string): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.group_media SET status='reserved',writer=NULL WHERE id=$1 AND writer=$2 AND status='writing'",
      [id, writer],
    );
  }
  async cancel(
    authority: ContactAuthority,
    input: GroupScope & { message: string },
  ): Promise<void> {
    await this.groups.withGroupAuthority(authority, input, async (client) => {
      const accepted = await client.query(
        'SELECT 1 FROM hash_talk.group_packets WHERE id=$1',
        [input.message],
      );
      if (accepted.rowCount) throw new AccountError(409, 'Envio já aceito.');
      const writing = await client.query(
        "SELECT 1 FROM hash_talk.group_media WHERE group_id=$1 AND message_id=$2 AND sender=$3 AND status='writing'",
        [input.groupId, input.message, authority.session.accountId],
      );
      if (writing.rowCount)
        throw new AccountError(409, 'Aguarde a transferência ativa terminar.');
      await client.query(
        "UPDATE hash_talk.group_media SET status='deleting' WHERE group_id=$1 AND message_id=$2 AND sender=$3 AND status NOT IN ('accepted','deleting')",
        [input.groupId, input.message, authority.session.accountId],
      );
    });
  }
  /** Called within message admission; no filesystem work inside SQL. */
  async admit(client: pg.PoolClient, packet: GroupPacket): Promise<void> {
    await this.writable(client, packet.groupId);
    for (const ref of packet.attachments ?? []) {
      const row = await this.row(client, ref.id);
      if (
        !row ||
        row.status !== 'ready' ||
        row.group_id !== packet.groupId ||
        row.epoch !== packet.epoch ||
        row.message_id !== packet.id ||
        row.sender !== packet.sender ||
        canonical(row.descriptor) !== canonical(ref)
      )
        throw new AccountError(409, 'Mídia não está integralmente preservada.');
      await client.query(
        "UPDATE hash_talk.group_media SET status='accepted',accepted_at=clock_timestamp() WHERE id=$1",
        [ref.id],
      );
    }
  }
  async readable(
    authority: ContactAuthority,
    input: GroupScope & { message: string; id: string; index: number },
  ): Promise<AttachmentRef> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const row = await this.row(client, input.id);
        if (
          !row ||
          row.group_id !== input.groupId ||
          row.message_id !== input.message ||
          row.status !== 'accepted' ||
          !groupCanRead(state, authority.session.accountId, row.epoch)
        )
          unavailable();
        const message = await client.query(
          'SELECT 1 FROM hash_talk.group_packets WHERE id=$1 AND group_id=$2 AND body IS NOT NULL',
          [input.message, input.groupId],
        );
        if (!message.rowCount) unavailable();
        if (!row.descriptor.parts[input.index])
          throw new AccountError(400, 'Parte inexistente.');
        return row.descriptor;
      },
    );
  }
  async usage(
    authority: ContactAuthority,
    input: GroupScope,
  ): Promise<{ mediaBytes: number }> {
    return this.groups.withGroupAuthority(authority, input, async (client) => ({
      mediaBytes: await groupMediaUsage(client, input.groupId),
    }));
  }
  async resumeInterrupted(): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.group_media SET status='reserved',writer=NULL WHERE status='writing'",
    );
  }
  async garbage(): Promise<{ id: string; group_id: string }[]> {
    return this.contacts.withMaintenance(async (client) => {
      const rows = await client.query<{ id: string; group_id: string }>(
        "UPDATE hash_talk.group_media SET status='deleting' WHERE id IN (SELECT id FROM hash_talk.group_media WHERE status='deleting' OR (status IN ('reserved','ready') AND created_at<clock_timestamp()-interval '24 hours') ORDER BY sequence LIMIT 8) AND status IN ('reserved','ready','deleting') RETURNING id,group_id",
      );
      return rows.rows;
    });
  }
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.group_media WHERE id=$1 AND status='deleting'",
      [id],
    );
  }
}
