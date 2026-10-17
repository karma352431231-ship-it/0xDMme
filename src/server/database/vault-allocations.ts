import type pg from 'pg';
import { assertContentReclamationCapacity } from './content-capacity.ts';
import type { AdaptiveContentCapacity } from './content-capacity.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';
import { operationBytes } from '../../shared/vault/index.ts';
import type { VaultCommit } from '../../shared/vault/index.ts';

/** Vault envelopes and completion contracts share the existing coordinator. */
export class VaultAllocations {
  private readonly allocations: ContentWriteAllocations;
  private readonly capacity: AdaptiveContentCapacity;
  constructor(
    allocations: ContentWriteAllocations,
    capacity: AdaptiveContentCapacity,
  ) {
    this.allocations = allocations;
    this.capacity = capacity;
  }
  transaction<T>(
    pool: pg.Pool,
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.allocations.transaction(pool, operation);
  }
  async reserve(client: pg.PoolClient, commit: VaultCommit): Promise<void> {
    const bytes =
      operationBytes(commit) +
      4 * Buffer.byteLength(JSON.stringify(commit)) +
      16_384;
    await this.allocations.declare(client, {
      bytes,
      scope: 'vault-reserve',
      accountId: commit.accountId,
      id: commit.id,
    });
  }
  async maintain(
    client: pg.PoolClient,
    input: {
      accountId: string;
      id: string;
      writer: string;
      kind: 'complete' | 'discard';
      commit: unknown;
    },
  ): Promise<void> {
    const bytes = 8 * Buffer.byteLength(JSON.stringify(input.commit)) + 32768;
    await this.allocations.declare(client, {
      ...input,
      bytes,
      scope: 'vault-maintain',
      verify: async (owner) => {
        await owner.query(
          'SELECT hash_talk.assert_vault_maintenance_complete()',
        );
        await assertContentReclamationCapacity(owner, this.capacity);
      },
    });
    await client.query(
      `SELECT set_config('hash_talk.vault_maintenance',$1,true),set_config('hash_talk.content_writer',$2,true)`,
      [input.kind, input.writer],
    );
  }
}
