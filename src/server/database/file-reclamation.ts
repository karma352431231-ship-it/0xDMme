import type pg from 'pg';
import type { ContentWriteAllocations } from './content-write-allocations.ts';
import { assertContentReclamationCapacity } from './content-capacity.ts';
import type { AdaptiveContentCapacity } from './content-capacity.ts';

interface Reclamation {
  source: 'personal_removals' | 'message_attachments' | 'social_media';
  id: string;
  accountId?: string;
}
/** SQL confirmation only: callers durably remove files before entering here. */
export class FileReclamation {
  private readonly allocations: ContentWriteAllocations;
  private readonly capacity: AdaptiveContentCapacity;
  constructor(
    allocations: ContentWriteAllocations,
    capacity: AdaptiveContentCapacity,
  ) {
    this.allocations = allocations;
    this.capacity = capacity;
  }
  async run(
    pool: pg.Pool,
    input: Reclamation,
    effect: (client: pg.PoolClient) => Promise<unknown>,
  ): Promise<void> {
    await this.allocations.transaction(pool, async (client) => {
      const prepared = await client.query<{
        bytes: string | null;
        actor: string | null;
      }>(
        'SELECT bytes::text,actor::text FROM hash_talk.prepare_file_reclamation($1,$2,$3)',
        [input.source, input.id, input.accountId ?? null],
      );
      const plan = prepared.rows[0]!;
      if (plan.bytes === null || plan.actor === null) return;
      await this.allocations.declare(client, {
        bytes: Number(plan.bytes),
        scope: 'file-reclaim',
        accountId: plan.actor,
        id: input.id,
        verify: async (owner) => {
          await owner.query(
            'SELECT hash_talk.assert_file_reclamation_complete()',
          );
          await assertContentReclamationCapacity(owner, this.capacity);
        },
      });
      await effect(client);
    });
  }
}
