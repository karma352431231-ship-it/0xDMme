import type pg from 'pg';

const sources = [
  'community_media',
  'group_media',
  'message_attachments',
  'social_media',
  'status_media',
  'vault_operations',
] as const;

type ReservationSource = (typeof sources)[number];
interface ReservationUsage {
  source: ReservationSource;
  reservations: number;
  reservedBytes: number;
}
export interface StorageReservationSnapshot {
  reservations: number;
  reservedBytes: number;
  sources: ReservationUsage[];
}

function safeAmount(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error('Storage reservation accounting unavailable');
  return amount;
}

/** Aggregates only fixed partitions; no payload, IDs or reservation-history reads. */
export async function readStorageReservations(
  client: Pick<pg.PoolClient, 'query'>,
): Promise<StorageReservationSnapshot> {
  const result = await client.query<{
    source: ReservationSource;
    partitions: string;
    reservations: string;
    bytes: string;
  }>(`SELECT source,count(*)::text AS partitions,
    sum(reservations)::text AS reservations,sum(reserved_bytes)::text AS bytes
    FROM hash_talk.storage_reservation_usage GROUP BY source ORDER BY source`);
  if (
    result.rows.length !== sources.length ||
    result.rows.some(
      (row, index) => row.source !== sources[index] || row.partitions !== '256',
    )
  )
    throw new Error('Storage reservation accounting unavailable');
  const usage = result.rows.map((row) => ({
    source: row.source,
    reservations: safeAmount(row.reservations),
    reservedBytes: safeAmount(row.bytes),
  }));
  return {
    reservations: safeAmount(
      String(usage.reduce((total, row) => total + row.reservations, 0)),
    ),
    reservedBytes: safeAmount(
      String(usage.reduce((total, row) => total + row.reservedBytes, 0)),
    ),
    sources: usage,
  };
}

export class StorageReservationStore {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  snapshot(): Promise<StorageReservationSnapshot> {
    return readStorageReservations(this.pool);
  }
}
