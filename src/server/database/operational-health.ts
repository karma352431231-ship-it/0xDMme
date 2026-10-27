import type pg from 'pg';

export interface OperationalDatabaseSnapshot {
  poolConnections: number;
  poolIdle: number;
  poolWaiting: number;
  queryAvailable: boolean;
  activeTransactions: number | null;
  lockWaiters: number | null;
  oldestTransactionSeconds: number | null;
}
/** Aggregate activity only: never select query text, clients or identities. */
export async function readOperationalHealth(
  pool: pg.Pool,
  extra: { connections: number; idle: number; waiting: number } | undefined,
): Promise<OperationalDatabaseSnapshot> {
  const activity = {
    poolConnections: pool.totalCount + (extra?.connections ?? 0),
    poolIdle: pool.idleCount + (extra?.idle ?? 0),
    poolWaiting: pool.waitingCount + (extra?.waiting ?? 0),
  };
  try {
    const result = await pool.query<{
      activeTransactions: number;
      lockWaiters: number;
      oldestTransactionSeconds: number;
    }>(`SELECT count(*) FILTER (WHERE xact_start IS NOT NULL)::float8 AS "activeTransactions",
      count(*) FILTER (WHERE wait_event_type='Lock')::float8 AS "lockWaiters",
      coalesce(max(greatest(0,extract(epoch FROM now()-xact_start))),0)::float8 AS "oldestTransactionSeconds"
      FROM pg_stat_activity WHERE datname=current_database()
      AND pid<>pg_backend_pid() AND backend_type='client backend'`);
    const row = result.rows[0];
    if (!row || Object.values(row).some((n) => !Number.isFinite(n) || n < 0))
      throw new Error('Operational sample unavailable.');
    return { ...activity, queryAvailable: true, ...row };
  } catch {
    // Preserve the live pool sample even if admission/query execution times out.
    return {
      ...activity,
      queryAvailable: false,
      activeTransactions: null,
      lockWaiters: null,
      oldestTransactionSeconds: null,
    };
  }
}
