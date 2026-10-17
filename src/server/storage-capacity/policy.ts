import type {
  AdaptiveContentCapacity,
  CapacityClient,
} from '../database/index.ts';
import {
  contentCapacityUnavailable,
  readStorageReservations,
} from '../database/index.ts';
import type { VolumeReader } from './volume.ts';

const releaseWorkspaceBytes = 2n * 128n * 1024n * 1024n;
interface AdmissionState {
  pendingBytes: bigint;
  logicalBaseline: bigint | null;
  pendingBaseline: bigint | null;
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
function baseline(value: string | null): bigint | null {
  return value === null || value === '' ? null : amount(value);
}

async function admissionState(
  client: CapacityClient,
  transactionRequired: boolean,
): Promise<AdmissionState> {
  const result = await client.query<{
    transaction_id: string | null;
    mode: string | null;
    isolation: string;
    logical_baseline: string | null;
    pending_baseline: string | null;
    database_bytes: string;
    wal_bytes: string;
    maintenance_bytes: string;
    inflight_sql_bytes: string;
    schema_ready: boolean;
  }>(`SELECT pg_current_xact_id_if_assigned()::text AS transaction_id,
    current_setting('hash_talk.storage_capacity_mode',true) AS mode,
    current_setting('transaction_isolation') AS isolation,
    current_setting('hash_talk.storage_logical_baseline',true) AS logical_baseline,
    current_setting('hash_talk.storage_pending_baseline',true) AS pending_baseline,
    pg_database_size(current_database())::text AS database_bytes,
    pg_size_bytes(current_setting('max_wal_size'))::text AS wal_bytes,
    (greatest(pg_size_bytes(current_setting('maintenance_work_mem')),
      CASE WHEN current_setting('autovacuum_work_mem')='-1' THEN 0 ELSE pg_size_bytes(current_setting('autovacuum_work_mem')) END)
      *current_setting('autovacuum_max_workers')::bigint)::text AS maintenance_bytes,
    (current_setting('max_connections')::bigint*67108864)::text AS inflight_sql_bytes,
    EXISTS(SELECT 1 FROM hash_talk.schema_migrations WHERE version=75) AS schema_ready`);
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
    logicalBaseline: baseline(row.logical_baseline),
    pendingBaseline: baseline(row.pending_baseline),
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
  logical: bigint,
  intent: 'growth' | 'reclaim',
): boolean {
  const pendingBefore = state.pendingBaseline ?? state.pendingBytes;
  if (state.pendingBytes > pendingBefore) return false;
  if (intent === 'reclaim') return true;
  return (
    (state.logicalBaseline !== null && logical < state.logicalBaseline) ||
    (state.pendingBaseline !== null &&
      state.pendingBytes < state.pendingBaseline &&
      logical <= (state.logicalBaseline ?? logical))
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
  const logical = amount(String(input.logicalBytes));
  const additional = amount(String(input.additionalBytes));
  if (!additional && reclaiming(state, logical, input.intent)) {
    // Authorized cleanup may use the operating reserve, but cannot grant new payload promises.
    const metadataGrowth = logical - (state.logicalBaseline ?? logical);
    return metadataGrowth > 0n ? 2n * metadataGrowth : 0n;
  }
  if (input.intent === 'reclaim') throw contentCapacityUnavailable();
  return state.pendingBytes + state.operationalBytes + 4n * additional;
}

/** Called after charged SQL while the existing global ledger lock is retained. */
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
