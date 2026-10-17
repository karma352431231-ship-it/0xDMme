import type pg from 'pg';

/** The caller owns a separate, deadline-configured coordinator pool. */
export async function withAllocationTransaction<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  let committing = false;
  let connectionError: Error | undefined;
  const onError = (error: Error) => {
    connectionError = error;
    discard = true;
  };
  client.on('error', onError);
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await operation(client);
    if (connectionError) throw connectionError;
    committing = true;
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    discard ||= committing;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: unknown) {
      discard = true;
      throw new AggregateError(
        [error, rollbackError],
        'Content allocation outcome unavailable.',
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    // A lost COMMIT acknowledgement is ambiguous. Discard the connection;
    // durable credits remain until a fresh snapshot proves the owner finished.
    try {
      client.release(discard);
    } finally {
      client.removeListener('error', onError);
    }
  }
}
