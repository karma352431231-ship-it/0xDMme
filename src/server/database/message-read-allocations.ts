import type pg from 'pg';
import type { ContentWriteAllocations } from './content-write-allocations.ts';

/** Read marks own a bounded metadata envelope, sharing the existing coordinator. */
export class MessageReadAllocations {
  private readonly allocations: ContentWriteAllocations;
  constructor(allocations: ContentWriteAllocations) {
    this.allocations = allocations;
  }
  async prepare(
    client: pg.PoolClient,
    input: { accountId: string; peer: string; deviceId: string; ids: string[] },
  ): Promise<boolean> {
    const current = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM hash_talk.message_reads r
      LEFT JOIN hash_talk.daily_controls dc ON dc.account_id=r.account_id WHERE r.account_id=$1 AND r.message_id=ANY($2::uuid[])
        AND r.share_epoch IS NOT DISTINCT FROM CASE WHEN dc.read_receipts THEN dc.receipt_epoch ELSE NULL END`,
      [input.accountId, input.ids],
    );
    if (current.rows[0]?.count === input.ids.length) return false;
    await this.allocations.declare(client, {
      bytes: 16384 * (input.ids.length + 1),
      scope: 'message-read',
      accountId: input.accountId,
      id: input.peer,
      verify: async (owner) => {
        await owner.query('SELECT hash_talk.assert_message_reads_complete()');
      },
    });
    await client.query(
      `SELECT set_config('hash_talk.content_peer',$1,true),set_config('hash_talk.content_device',$2,true),set_config('hash_talk.content_read_ids',$3,true)`,
      [input.peer, input.deviceId, JSON.stringify(input.ids)],
    );
    return true;
  }
}
