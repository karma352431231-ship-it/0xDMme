import type {
  AdaptiveContentCapacity,
  CapacityClient,
} from '../database/index.ts';
import {
  contentCapacityUnavailable,
  readStorageReservations,
  contentSqlTransactionBytes,
  physicalAllocationBytesSql,
} from '../database/index.ts';
import type { VolumeReader } from './volume.ts';

const releaseWorkspaceBytes = 2n * 128n * 1024n * 1024n;
interface AdmissionState {
  pendingBytes: bigint;
  logicalDelta: bigint;
  pendingDelta: bigint;
  credits: bigint;
  operationalBytes: bigint;
}
function amount(value: string | null | undefined): bigint {
  if (
    value === null ||
    value === undefined ||
    !/^\d+$/u.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw contentCapacityUnavailable();
  return BigInt(value);
}
function delta(value: string | null): bigint {
  if (!value) return 0n;
  if (!/^-?\d+$/u.test(value) || !Number.isSafeInteger(Number(value)))
    throw contentCapacityUnavailable();
  return BigInt(value);
}

async function admissionState(
  client: CapacityClient,
  transactionRequired: boolean,
): Promise<AdmissionState> {
  const result = await client.query<{
    transaction_id: string | null;
    mode: string | null;
    isolation: string;
    logical_delta: string | null;
    pending_delta: string | null;
    credits: string;
    database_bytes: string;
    wal_bytes: string;
    maintenance_bytes: string;
    inflight_sql_bytes: string;
    schema_ready: boolean;
  }>(`SELECT pg_current_xact_id_if_assigned()::text AS transaction_id,
    current_setting('hash_talk.storage_capacity_mode',true) AS mode,
    current_setting('transaction_isolation') AS isolation,
    current_setting('hash_talk.storage_logical_delta',true) AS logical_delta,
    current_setting('hash_talk.storage_pending_delta',true) AS pending_delta,
    (SELECT coalesce(sum(${physicalAllocationBytesSql}),0)::text FROM hash_talk.content_allocations) AS credits,
    pg_database_size(current_database())::text AS database_bytes,
    pg_size_bytes(current_setting('max_wal_size'))::text AS wal_bytes,
    (greatest(pg_size_bytes(current_setting('maintenance_work_mem')),
      CASE WHEN current_setting('autovacuum_work_mem')='-1' THEN 0 ELSE pg_size_bytes(current_setting('autovacuum_work_mem')) END)
      *current_setting('autovacuum_max_workers')::bigint)::text AS maintenance_bytes,
    (current_setting('max_connections')::bigint*${contentSqlTransactionBytes})::text AS inflight_sql_bytes,
    EXISTS(SELECT 1 FROM hash_talk.schema_migrations WHERE version=81) AS schema_ready`);
  const row = result.rows[0];
  if (
    !row ||
    !row.schema_ready ||
    (transactionRequired &&
      (!row.transaction_id ||
        row.mode !== 'volume' ||
        row.isolation !== 'read committed'))
  )
    throw contentCapacityUnavailable();
  const pending = await readStorageReservations(client);
  return {
    pendingBytes: BigInt(pending.reservedBytes),
    logicalDelta: delta(row.logical_delta),
    pendingDelta: delta(row.pending_delta),
    credits: amount(row.credits),
    operationalBytes:
      releaseWorkspaceBytes +
      3n * amount(row.database_bytes) +
      2n * amount(row.wal_bytes) +
      amount(row.maintenance_bytes) +
      amount(row.inflight_sql_bytes),
  };
}

function reclaiming(
  state: AdmissionState,
  intent: 'growth' | 'reclaim',
): boolean {
  if (state.pendingDelta > 0n) return false;
  if (intent === 'reclaim') return true;
  return (
    state.logicalDelta < 0n ||
    (state.pendingDelta < 0n && state.logicalDelta <= 0n)
  );
}

function requiredBytes(
  state: AdmissionState,
  input: {
    logicalBytes: number;
    additionalBytes: number;
    intent: 'growth' | 'reclaim';
  },
): bigint {
  amount(String(input.logicalBytes));
  const additional = amount(String(input.additionalBytes));
  if (!additional && reclaiming(state, input.intent)) {
    // Authorized cleanup may use the operating reserve, but cannot grant new payload promises.
    const metadataGrowth = state.logicalDelta;
    return metadataGrowth > 0n ? 2n * metadataGrowth : 0n;
  }
  if (input.intent === 'reclaim') throw contentCapacityUnavailable();
  return (
    state.pendingBytes +
    state.operationalBytes +
    state.credits +
    4n * additional
  );
}

async function allocatedWrite(client: CapacityClient): Promise<boolean> {
  const result = await client.query<{
    bytes: string | null;
    consumed: string | null;
  }>(
    `SELECT hash_talk.active_content_allocation()::text AS bytes,
    current_setting('hash_talk.content_consumed',true) AS consumed`,
  );
  const row = result.rows[0];
  if (!row) throw contentCapacityUnavailable();
  if (row.bytes === null) return false;
  const used = amount(row.consumed);
  if (!used || used > amount(row.bytes)) throw contentCapacityUnavailable();
  return true;
}
async function lockPhysicalAdmission(client: CapacityClient) {
  const result = await client.query(
    'SELECT singleton FROM hash_talk.content_allocation_guard WHERE singleton FOR UPDATE',
  );
  if (result.rowCount !== 1) throw contentCapacityUnavailable();
}

/** Legacy final assertions coordinate with pre-write grants until their COMMIT. */
export class VolumeContentCapacity implements AdaptiveContentCapacity {
  readonly mode = 'volume';
  private readonly volume: VolumeReader;
  constructor(volume: VolumeReader) {
    this.volume = volume;
  }
  /** Raw current room for the prepared allocator, before its durable credits. */
  async allocationHeadroom(client: CapacityClient): Promise<bigint> {
    try {
      const state = await admissionState(client, true);
      return (
        (await this.volume.read()) - state.pendingBytes - state.operationalBytes
      );
    } catch {
      throw contentCapacityUnavailable();
    }
  }
  async assert(
    client: CapacityClient,
    input: { logicalBytes: number; intent: 'growth' | 'reclaim' },
  ): Promise<void> {
    try {
      // A validated source already consumed its pre-write physical envelope.
      // Re-measuring would charge its promise twice and reintroduce a global wait.
      if (await allocatedWrite(client)) return;
      await lockPhysicalAdmission(client);
      const state = await admissionState(client, true);
      const required = requiredBytes(state, { ...input, additionalBytes: 0 });
      if ((await this.volume.read()) < required)
        throw contentCapacityUnavailable();
    } catch {
      throw contentCapacityUnavailable();
    }
  }
  async fits(
    client: CapacityClient,
    input: { logicalBytes: number; additionalBytes: number },
  ): Promise<boolean> {
    try {
      const state = await admissionState(client, false);
      return (
        (await this.volume.read()) >=
        requiredBytes(state, { ...input, intent: 'growth' })
      );
    } catch {
      throw contentCapacityUnavailable();
    }
  }
}
