import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { ContentCapacity } from './content-capacity.ts';
import { assertContentCapacity } from './vault-quota.ts';

interface OpeningRecord {
  id: string;
  sender: string;
  recipient: string;
  available: boolean;
  original_id: string;
}
interface OpeningInput {
  authority: ContactAuthority;
  expect: (client: pg.PoolClient) => Promise<void>;
}
interface OpeningContext {
  client: pg.PoolClient;
  authority: ContactAuthority;
  participants: readonly string[];
}
interface ExportRow {
  id: string;
  packet?: MessagePacket;
  unavailable?: number;
}

/** Payload opening owns routing/authorization and its charged device reference. */
export class MessageOpening {
  private readonly contacts: ContactStore;
  private readonly capacity: ContentCapacity;
  constructor(contacts: ContactStore, capacity: ContentCapacity) {
    this.contacts = contacts;
    this.capacity = capacity;
  }
  object(input: OpeningInput & { id: string }): Promise<MessagePacket> {
    return this.contacts.withMessageParticipants(
      input.authority,
      (client) => this.participants(client, input.authority, [input.id]),
      async (client, participants) => {
        await input.expect(client);
        return this.open(
          { client, authority: input.authority, participants },
          input.id,
        );
      },
    );
  }
  backupWindow(input: OpeningInput & { ids: string[] }): Promise<ExportRow[]> {
    assertExportWindow(input.ids);
    return this.contacts.withMessageParticipants(
      input.authority,
      (client) => this.participants(client, input.authority, input.ids),
      async (client, participants) => {
        await input.expect(client);
        return this.export(
          { client, authority: input.authority, participants },
          input.ids,
        );
      },
    );
  }
  private async participants(
    client: pg.PoolClient,
    authority: ContactAuthority,
    ids: string[],
  ): Promise<string[]> {
    // Resolve immutable routing only. Session/directory/snapshot errors retain
    // priority, and every mutable permission is rechecked after ordered locks.
    const result = await client.query<{ sender: string; recipient: string }>(
      'SELECT sender,recipient FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (sender=$2 OR recipient=$2)',
      [ids, authority.session.accountId],
    );
    return [
      ...new Set(result.rows.flatMap((row) => [row.sender, row.recipient])),
    ];
  }
  private async metadata(
    context: OpeningContext,
    id: string,
  ): Promise<OpeningRecord> {
    const { client, authority, participants } = context;
    const result = await client.query<OpeningRecord>(
      `SELECT id,sender,recipient,body IS NOT NULL AS available,coalesce(relation->>'id',id::text) AS original_id
       FROM hash_talk.message_packets WHERE id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (
      !row ||
      ![row.sender, row.recipient].includes(authority.session.accountId) ||
      !participants.includes(row.sender) ||
      !participants.includes(row.recipient)
    )
      throw new AccountError(404, 'Mensagem indisponível.');
    const removed = await client.query(
      "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
      [authority.session.accountId, id, row.original_id],
    );
    if (!row.available || removed.rowCount)
      throw new AccountError(
        410,
        'Mensagem apagada ou removida do cofre pessoal.',
      );
    return row;
  }
  private async open(
    context: OpeningContext,
    id: string,
  ): Promise<MessagePacket> {
    const row = await this.metadata(context, id);
    const { client, authority } = context;
    const { accountId, deviceId } = authority.session;
    const ref = await client.query<{ status: string }>(
      'SELECT status FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2 AND device_id=$3',
      [id, accountId, deviceId],
    );
    const peer = row.sender === accountId ? row.recipient : row.sender;
    if (
      ref.rows[0]?.status !== 'received' &&
      !(await this.contacts.messageDeliveryAllowed(client, accountId, peer))
    )
      throw new AccountError(
        423,
        'Entrega suspensa. É necessário novo consentimento.',
      );
    if (!ref.rowCount) await this.reference(context, id);
    // Load ciphertext only after authorization. Bodies never enter routing plans.
    const payload = await client.query<{ body: MessagePacket }>(
      'SELECT body FROM hash_talk.message_packets WHERE id=$1',
      [id],
    );
    return payload.rows[0]!.body;
  }
  private async reference(context: OpeningContext, id: string): Promise<void> {
    const { client, authority } = context;
    const inserted = await client.query(
      'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [id, authority.session.accountId, authority.session.deviceId],
    );
    if (!inserted.rowCount) return;
    await client.query(
      'UPDATE hash_talk.message_packets SET charge=charge+256 WHERE id=$1',
      [id],
    );
    // Growth still uses the legacy gate until its complete envelope is adopted.
    await assertContentCapacity(client, this.capacity);
  }
  private async export(
    context: OpeningContext,
    ids: string[],
  ): Promise<ExportRow[]> {
    const rows: ExportRow[] = [];
    let bytes = 0;
    for (const id of ids) {
      const result = await this.backupObject(context, id);
      const size = Buffer.byteLength(JSON.stringify(result));
      // Preserve the existing boundary: the last inspected object can acquire
      // its reference even when it does not fit the returned response window.
      if (rows.length && bytes + size > 16_000_000) break;
      bytes += size;
      rows.push(result);
    }
    return rows;
  }
  private async backupObject(
    context: OpeningContext,
    id: string,
  ): Promise<ExportRow> {
    try {
      return { id, packet: await this.open(context, id) };
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        ![410, 423].includes(error.status)
      )
        throw error;
      return { id, unavailable: error.status };
    }
  }
}
function assertExportWindow(ids: string[]): void {
  if (!ids.length || ids.length > 32)
    throw new AccountError(400, 'Lote inválido.');
  if (new Set(ids).size !== ids.length)
    throw new AccountError(400, 'Lote duplicado.');
}
