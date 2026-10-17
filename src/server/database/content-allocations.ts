import {
  physicalAllocationBytes,
  physicalAllocationBytesSql,
} from './content-allocation-scopes.ts';
import type { ContentAllocationScope } from './content-allocation-scopes.ts';
import type pg from 'pg';
import type { CapacityClient } from './content-capacity.ts';
import {
  contentCapacityUnavailable,
  contentSqlTransactionBytes,
} from './content-capacity.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';

export interface ContentAllocation {
  readonly transactionId: string;
  readonly installationId: string;
  readonly bytes: number;
  readonly scope: ContentAllocationScope;
}
export type AllocationHeadroom = (client: CapacityClient) => Promise<bigint>;
interface AllocationOwner {
  transactionId: string;
  installationId: string;
  pid: number;
}

function assertCoordinatorBounds(pool: pg.Pool) {
  const bounds = [
    pool.options.max,
    pool.options.connectionTimeoutMillis,
    pool.options.statement_timeout,
    pool.options.query_timeout,
    pool.options.lock_timeout,
    pool.options.idle_in_transaction_session_timeout,
  ];
  if (
    bounds.some(
      (value) =>
        typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0,
    )
  )
    throw new Error('Content allocation pool bounds and deadlines required.');
}

function allocationBytes(
  bytes: number,
  scope: ContentAllocation['scope'],
): bigint {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    (scope === 'vault-maintain' && bytes > contentSqlTransactionBytes)
  )
    throw contentCapacityUnavailable();
  return BigInt(bytes);
}
async function allocationOwner(
  client: CapacityClient,
): Promise<AllocationOwner> {
  const result = await client.query<{
    transaction_id: string;
    installation_id: string;
    pid: number;
    mode: string | null;
    isolation: string;
    read_only: string;
  }>(`SELECT pg_current_xact_id()::text AS transaction_id,installation_id::text,
    pg_backend_pid() AS pid,current_setting('hash_talk.storage_capacity_mode',true) AS mode,
    current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only
    FROM hash_talk.service_metadata WHERE singleton`);
  const row = result.rows[0];
  if (
    !row ||
    row.mode !== 'volume' ||
    row.isolation !== 'read committed' ||
    row.read_only !== 'off'
  )
    throw contentCapacityUnavailable();
  return {
    transactionId: row.transaction_id,
    installationId: row.installation_id,
    pid: row.pid,
  };
}
async function lockAllocationGuard(client: CapacityClient) {
  const result = await client.query<{ singleton: boolean }>(
    'SELECT singleton FROM hash_talk.content_allocation_guard WHERE singleton FOR UPDATE',
  );
  if (result.rowCount !== 1) throw contentCapacityUnavailable();
  const state = await client.query<{ valid: boolean }>(`SELECT
    current_setting('transaction_isolation')='read committed'
    AND current_setting('hash_talk.storage_capacity_mode',true)='volume'
    AND EXISTS(SELECT 1 FROM hash_talk.schema_migrations WHERE version=80) AS valid`);
  if (state.rows[0]?.valid !== true) throw contentCapacityUnavailable();
}
async function collectCompleted(client: CapacityClient): Promise<number> {
  // Use snapshot visibility, not an early commit-status bit: after removing a
  // credit, subsequent READ COMMITTED queries must see its committed promises.
  const result = await client.query(`WITH completed AS MATERIALIZED (
    SELECT transaction_id FROM hash_talk.content_allocations
    WHERE pg_visible_in_snapshot(transaction_id,pg_current_snapshot())
    ORDER BY transaction_id LIMIT 128)
    DELETE FROM hash_talk.content_allocations a USING completed c
    WHERE a.transaction_id=c.transaction_id`);
  await client.query('SELECT hash_talk.compact_content_usage()');
  return result.rowCount ?? 0;
}
async function assertOwner(client: CapacityClient, owner: AllocationOwner) {
  const result = await client.query<{ valid: boolean }>(
    `SELECT
    installation_id=$1::uuid AND pg_backend_pid()<>$2
    AND pg_xact_status($3::xid8)='in progress' AS valid
    FROM hash_talk.service_metadata WHERE singleton`,
    [owner.installationId, owner.pid, owner.transactionId],
  );
  if (result.rows[0]?.valid !== true) throw contentCapacityUnavailable();
}

/** Durable credits; each adopted writer must enforce its concrete envelope. */
export class ContentAllocator {
  private readonly pool: pg.Pool;
  private readonly headroom: AllocationHeadroom;
  constructor(pool: pg.Pool, headroom: AllocationHeadroom) {
    assertCoordinatorBounds(pool);
    this.pool = pool;
    this.headroom = headroom;
  }

  /** Declare this concrete operation's payload/SQL envelope before charged SQL. */
  async reserve(
    ownerClient: CapacityClient,
    bytes: number,
    scope: ContentAllocation['scope'] = 'prepared',
  ): Promise<ContentAllocation> {
    const needed = allocationBytes(bytes, scope);
    const owner = await allocationOwner(ownerClient);
    return withAllocationTransaction(this.pool, async (client) => {
      await lockAllocationGuard(client);
      await assertOwner(client, owner);
      await collectCompleted(client);
      const existing = await client.query<{ bytes: string; scope: string }>(
        'SELECT bytes::text,scope FROM hash_talk.content_allocations WHERE transaction_id=$1::xid8',
        [owner.transactionId],
      );
      if (existing.rows[0]) {
        if (
          BigInt(existing.rows[0].bytes) !== needed ||
          existing.rows[0].scope !== scope
        )
          throw contentCapacityUnavailable();
        return Object.freeze({
          transactionId: owner.transactionId,
          installationId: owner.installationId,
          bytes,
          scope,
        });
      }
      await this.assertRoom(client, { scope, needed });
      await client.query(
        'INSERT INTO hash_talk.content_allocations(transaction_id,bytes,scope) VALUES($1::xid8,$2,$3)',
        [owner.transactionId, bytes, scope],
      );
      return Object.freeze({
        transactionId: owner.transactionId,
        installationId: owner.installationId,
        bytes,
        scope,
      });
    });
  }

  private async assertRoom(
    client: CapacityClient,
    input: { scope: ContentAllocation['scope']; needed: bigint },
  ) {
    // The per-connection allowance covers ordinary maintenance. Larger cleanup
    // owns only its excess as durable physical credits, without payload grants.
    const required = physicalAllocationBytes(input.needed, input.scope);
    if (required === 0n) return;
    // Collection precedes this fresh read: each finished promise is represented
    // either by a retained growth credit or by visible pending source data.
    const available = await this.headroom(client),
      claimed = await client.query<{ bytes: string }>(
        `SELECT coalesce(sum(${physicalAllocationBytesSql}),0)::text AS bytes FROM hash_talk.content_allocations`,
      );
    if (
      typeof available !== 'bigint' ||
      available < BigInt(claimed.rows[0]!.bytes) + required
    )
      throw contentCapacityUnavailable();
  }

  /** Idempotent after COMMIT/ROLLBACK; a still-active owner retains its credit. */
  async finish(allocation: ContentAllocation): Promise<boolean> {
    return withAllocationTransaction(this.pool, async (client) => {
      await lockAllocationGuard(client);
      const state = await client.query<{ valid: boolean; finished: boolean }>(
        `SELECT
        installation_id=$1::uuid AS valid,
        pg_visible_in_snapshot($2::xid8,pg_current_snapshot()) AS finished
        FROM hash_talk.service_metadata WHERE singleton`,
        [allocation.installationId, allocation.transactionId],
      );
      if (state.rows[0]?.valid !== true) throw contentCapacityUnavailable();
      if (!state.rows[0].finished) return false;
      await client.query(
        'DELETE FROM hash_talk.content_allocations WHERE transaction_id=$1::xid8',
        [allocation.transactionId],
      );
      return true;
    });
  }

  /** One bounded recovery batch; no clock expiry or need for free-space growth. */
  async collect(): Promise<number> {
    return withAllocationTransaction(this.pool, async (client) => {
      await lockAllocationGuard(client);
      return collectCompleted(client);
    });
  }
}
