import type pg from 'pg';
import type { ContentWriteAllocations } from './content-write-allocations.ts';

/** One bounded metadata-only plan and one growth credit for the inspected window. */
export class MessageOpeningAllocations {
  private readonly allocations: ContentWriteAllocations;
  constructor(allocations: ContentWriteAllocations) {
    this.allocations = allocations;
  }
  async prepare(
    client: pg.PoolClient,
    input: {
      accountId: string;
      deviceId: string;
      participants: readonly string[];
      ids: string[];
    },
  ): Promise<void> {
    const result = await client.query<{ bytes: string }>(
      'SELECT hash_talk.prepare_message_opening($1,$2,$3::uuid[],$4::uuid[])::text AS bytes',
      [input.accountId, input.deviceId, input.ids, input.participants],
    );
    await this.allocations.declare(client, {
      bytes: Number(result.rows[0]!.bytes),
      scope: 'message-open',
      accountId: input.accountId,
      id: input.ids[0]!,
      verify: async (owner) => {
        await owner.query('SELECT hash_talk.assert_message_opening_complete()');
      },
    });
  }
}
