import pg from 'pg';
import type { AdaptiveContentCapacity } from './content-capacity.ts';
import { contentCapacityUnavailable } from './content-capacity.ts';
import { ContentAllocator } from './content-allocations.ts';
import type { ContentAllocation } from './content-allocations.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';

interface Owner {
  allocation?: ContentAllocation;
  verify?: (client: pg.PoolClient) => Promise<void>;
}

/** Owns a coordinator connection within the existing web connection budget. */
export class ContentWriteAllocations {
  private readonly pool: pg.Pool;
  private readonly allocator: ContentAllocator;
  private readonly failed: () => void;
  private readonly owners = new WeakMap<pg.PoolClient, Owner>();
  constructor(input: {
    connectionString: string;
    capacity: AdaptiveContentCapacity;
    failed: () => void;
  }) {
    this.failed = input.failed;
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
          await owner.verify?.(client);
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
  async declare(
    client: pg.PoolClient,
    input: {
      bytes: number;
      scope: ContentAllocation['scope'];
      accountId: string;
      id: string;
      verify?: (client: pg.PoolClient) => Promise<void>;
    },
  ) {
    const owner = this.owners.get(client);
    if (!owner || owner.allocation) throw contentCapacityUnavailable();
    owner.allocation = await this.allocator.reserve(
      client,
      input.bytes,
      input.scope,
    );
    if (input.verify) owner.verify = input.verify;
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
