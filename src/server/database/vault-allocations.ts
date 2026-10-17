import pg from 'pg';
import type { AdaptiveContentCapacity } from './content-capacity.ts';
import {
  contentCapacityUnavailable,
  assertContentReclamationCapacity,
} from './content-capacity.ts';
import { ContentAllocator } from './content-allocations.ts';
import type { ContentAllocation } from './content-allocations.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';
import { operationBytes } from '../../shared/vault/index.ts';
import type { VaultCommit } from '../../shared/vault/index.ts';

interface Owner {
  allocation?: ContentAllocation;
}

/** Owns a coordinator connection within the existing web connection budget. */
export class VaultAllocations {
  private readonly pool: pg.Pool;
  private readonly allocator: ContentAllocator;
  private readonly failed: () => void;
  private readonly capacity: AdaptiveContentCapacity;
  private readonly owners = new WeakMap<pg.PoolClient, Owner>();
  constructor(input: {
    connectionString: string;
    capacity: AdaptiveContentCapacity;
    failed: () => void;
  }) {
    this.failed = input.failed;
    this.capacity = input.capacity;
    this.pool = new pg.Pool({
      connectionString: input.connectionString,
      options: '-c hash_talk.storage_capacity_mode=volume',
      max: 1,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 5_000,
      statement_timeout: 4_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 2_000,
      application_name: 'hash-talk:content-allocator',
    });
    this.pool.on('error', this.failed);
    this.allocator = new ContentAllocator(this.pool, (client) =>
      input.capacity.allocationHeadroom(client),
    );
  }
  async transaction<T>(
    pool: pg.Pool,
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const owner: Owner = {};
    try {
      return await withAllocationTransaction(pool, async (client) => {
        this.owners.set(client, owner);
        try {
          const result = await operation(client);
          if (owner.allocation?.scope === 'vault-maintain') {
            await client.query(
              'SELECT hash_talk.assert_vault_maintenance_complete()',
            );
            await assertContentReclamationCapacity(client, this.capacity);
          }
          return result;
        } finally {
          this.owners.delete(client);
        }
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'PCA01')
        throw contentCapacityUnavailable();
      throw error;
    } finally {
      await this.finish(owner);
    }
  }
  private async finish(owner: Owner) {
    if (!owner.allocation) return;
    try {
      if (!(await this.allocator.finish(owner.allocation))) this.failed();
    } catch {
      // COMMIT may already be acknowledged. Keep its durable credit for bounded
      // recovery and fail service health; never report a committed write as lost.
      this.failed();
    }
  }
  async reserve(client: pg.PoolClient, commit: VaultCommit): Promise<void> {
    // Charge covers the pending object, plus bounded commit/row/TOAST/index/WAL
    // work. The BEFORE source trigger validates actual row cost before insertion.
    const bytes =
      operationBytes(commit) +
      4 * Buffer.byteLength(JSON.stringify(commit)) +
      16_384;
    await this.declare(client, {
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
    await this.declare(client, { ...input, bytes, scope: 'vault-maintain' });
    await client.query(
      `SELECT set_config('hash_talk.vault_maintenance',$1,true),
      set_config('hash_talk.content_writer',$2,true)`,
      [input.kind, input.writer],
    );
  }
  private async declare(
    client: pg.PoolClient,
    input: {
      bytes: number;
      scope: ContentAllocation['scope'];
      accountId: string;
      id: string;
    },
  ) {
    const owner = this.owners.get(client);
    if (!owner || owner.allocation) throw contentCapacityUnavailable();
    owner.allocation = await this.allocator.reserve(
      client,
      input.bytes,
      input.scope,
    );
    await client.query(
      `SELECT set_config('hash_talk.content_allocation',$1,true),
      set_config('hash_talk.content_account',$2,true),
      set_config('hash_talk.content_operation',$3,true)`,
      [owner.allocation.transactionId, input.accountId, input.id],
    );
  }
  close(): Promise<void> {
    return this.pool.end();
  }
  get activity() {
    return {
      connections: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}
