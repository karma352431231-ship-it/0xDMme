import type pg from 'pg';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';

/** One complete private upload reservation, on the existing coordinator. */
export class AttachmentReservationAllocations {
  private readonly allocations: ContentWriteAllocations;
  constructor(allocations: ContentWriteAllocations) {
    this.allocations = allocations;
  }
  async reserve(
    client: pg.PoolClient,
    input: {
      accountId: string;
      message: string;
      peer: string;
      refs: AttachmentRef[];
    },
  ): Promise<boolean> {
    const result = await client.query<{ bytes: string }>(
      'SELECT hash_talk.prepare_attachment_reservation($1,$2,$3,$4::jsonb)::text AS bytes',
      [input.accountId, input.peer, input.message, JSON.stringify(input.refs)],
    );
    const bytes = Number(result.rows[0]!.bytes);
    if (bytes === 0) return false;
    await this.allocations.declare(client, {
      bytes,
      scope: 'attachment-reserve',
      accountId: input.accountId,
      id: input.message,
      verify: async (owner) => {
        await owner.query(
          'SELECT hash_talk.assert_attachment_reservation_complete()',
        );
      },
    });
    return true;
  }
}
