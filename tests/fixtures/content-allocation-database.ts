import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { globalUsagePredecessor } from './global-usage-database.ts';

export const allocationPoolErrors: Error[] = [];
function allocationOptions(role?: string) {
  if (role) assert.match(role, /^synthetic_allocator_[a-f0-9]{32}$/u);
  return (
    '-c hash_talk.storage_capacity_mode=volume' +
    (role ? ' -c role=' + role : '')
  );
}
export function allocationPool(url: string, role?: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 1000,
    query_timeout: 2000,
    statement_timeout: 1500,
    lock_timeout: 200,
    idle_in_transaction_session_timeout: 3000,
    options: allocationOptions(role),
  });
  // Assert these at fixture teardown. Idle errors are owned, never ignored.
  pool.on('error', (error: Error) => allocationPoolErrors.push(error));
  return pool;
}
export function allocationWriter(url: string, role?: string) {
  return new pg.Client({
    connectionString: url,
    statement_timeout: 2000,
    options: allocationOptions(role),
  });
}
export async function allocationPredecessor(client: pg.Client) {
  await globalUsagePredecessor(client);
  const sql = await readFile(
    new URL(
      '../../src/server/database/migrations/076-global-statement-accounting.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES(76,$1)',
      [createHash('sha256').update(sql).digest('hex')],
    );
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}
export async function allocationRows(client: pg.Client) {
  return (
    await client.query<{ transaction: string; bytes: string }>(
      'SELECT transaction_id::text AS transaction,bytes::text FROM hash_talk.content_allocations ORDER BY transaction_id',
    )
  ).rows;
}
export async function beginOwners(writers: pg.Client[]) {
  await Promise.all(writers.map((client) => client.query('BEGIN')));
}
export async function endOwners(writers: pg.Client[]) {
  await Promise.all(writers.map((client) => client.query('ROLLBACK')));
}
export async function expectNoAllocations(client: pg.Client) {
  assert.deepEqual(await allocationRows(client), []);
}
