import type pg from 'pg';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';

/** Covers the concrete packet plus SQL effects; attachment payloads are already reserved. */
export class MessageAllocations {
  private readonly allocations: ContentWriteAllocations;
  constructor(allocations: ContentWriteAllocations) {
    this.allocations = allocations;
  }
  async admit(
    client: pg.PoolClient,
    packet: MessagePacket,
    references: number,
  ): Promise<void> {
    // Read only rows this admission can prune/update, never whole chat history.
    // Concurrent push state changes are still checked against actual BEFORE cost.
    const result = await client.query<{ bytes: string }>(
      `SELECT (
      coalesce((SELECT sum(8*pg_column_size(s)::bigint+8192) FROM hash_talk.push_subscriptions s WHERE account_id=$1),0)
      +coalesce((SELECT sum(8*pg_column_size(a)::bigint+8192) FROM hash_talk.message_attachments a WHERE id=ANY($2::uuid[])),0)
      +coalesce((SELECT sum(4*pg_column_size(c)::bigint+4096) FROM hash_talk.message_changes c JOIN hash_talk.message_heads h USING(account_id)
        WHERE c.account_id=ANY($3::uuid[]) AND c.revision<=h.revision+1-256),0))::text AS bytes`,
      [
        packet.recipient,
        (packet.attachments ?? []).map((ref) => ref.id),
        [packet.sender, packet.recipient],
      ],
    );
    const bytes =
      9 * Buffer.byteLength(JSON.stringify(packet)) +
      references * 8192 +
      65536 +
      Number(result.rows[0]!.bytes);
    await this.allocations.declare(client, {
      bytes,
      scope: 'message-admit',
      accountId: packet.sender,
      id: packet.id,
      verify: async (owner) => {
        await owner.query(
          'SELECT hash_talk.assert_message_admission_complete()',
        );
      },
    });
    await client.query(
      `SELECT set_config('hash_talk.content_peer',$1,true),set_config('hash_talk.content_message_attachments',$2,true)`,
      [
        packet.recipient,
        JSON.stringify((packet.attachments ?? []).map((ref) => ref.id)),
      ],
    );
  }
}
