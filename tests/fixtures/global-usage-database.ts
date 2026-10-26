import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { storageReservationPredecessor } from './storage-reservation-database.ts';

export async function globalUsagePredecessor(client: pg.Client) {
  await storageReservationPredecessor(client);
  for (const file of [
    '077-storage-reservation-accounting.sql',
    '078-storage-admission-baselines.sql',
  ]) {
    const sql = await readFile(
      new URL('../../src/server/database/migrations/' + file, import.meta.url),
      'utf8',
    );
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
        [
          Number(file.slice(0, 3)),
          createHash('sha256').update(sql).digest('hex'),
        ],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

export async function globalUsageSources(client: pg.Client) {
  return (
    await client.query<{
      name: string;
      events: number;
    }>(`SELECT c.relname AS name,t.tgtype::integer AS events
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='hash_talk' AND t.tgfoid IN (
        'hash_talk.track_content_usage()'::regprocedure,
        'hash_talk.track_message_usage()'::regprocedure,
        'hash_talk.track_message_recovery_usage()'::regprocedure) ORDER BY c.relname`)
  ).rows;
}

/** Current authored sources, including additive metadata introduced after 079. */
export async function currentGlobalUsageSources(client: pg.Client) {
  return (
    await client.query<{ name: string }>(`SELECT DISTINCT c.relname AS name
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='hash_talk' AND t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure
    UNION SELECT 'profile_ranking_entries' AS name ORDER BY name`)
  ).rows;
}

/** Columns later additive migrations derive from existing data. Upgrade
 * fingerprints compare every pre-existing column; 098 fills the group removal
 * fence from the existing revision. */
const derivedColumns: Record<string, string[]> = {
  groups: ['message_invalidation'],
};
export async function globalSourceSnapshot(
  client: pg.Client,
  sources: { name: string }[],
) {
  const rows: {
    name: string;
    count: string;
    hash: string | null;
    bytes: string;
  }[] = [];
  for (const { name } of [...sources, { name: 'community_ranking_entries' }]) {
    assert.match(name, /^[a-z_]+$/u);
    const expression =
      name === 'accounts'
        ? 'coalesce(octet_length(profile_ciphertext)+524,0)'
        : 'charge';
    const result = await client.query<{
      count: string;
      hash: string | null;
      bytes: string;
    }>(
      `SELECT count(*)::text AS count,md5(string_agg((to_jsonb(t)-$1::text[])::text,'|' ORDER BY (to_jsonb(t)-$1::text[])::text)) AS hash,
        coalesce(sum(${expression}),0)::text AS bytes FROM hash_talk.${name} t`,
      [derivedColumns[name] ?? []],
    );
    rows.push({ name, ...result.rows[0]! });
  }
  return rows;
}

export async function globalBytes(client: pg.Client) {
  const result = await client.query<{ bytes: string }>(
    'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
  );
  assert.ok(result.rows[0]);
  return BigInt(result.rows[0].bytes);
}

export async function observeGlobalWrites(client: pg.Client) {
  // This database is exclusive and dropped by the fixture. Share instrumentation
  // across its connections so accepted concurrent writes remain observable.
  await client.query(`CREATE TABLE hash_talk.test_global_writes(bytes bigint);
    CREATE FUNCTION hash_talk.test_observe_global_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO hash_talk.test_global_writes VALUES(NEW.used_bytes); RETURN NULL; END; $$;
    CREATE TRIGGER test_global_writes AFTER UPDATE ON hash_talk.content_usage
      FOR EACH ROW EXECUTE FUNCTION hash_talk.test_observe_global_write()`);
}

export async function globalWrites(client: pg.Client) {
  return (
    await client.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM hash_talk.test_global_writes',
    )
  ).rows[0]!.count;
}

export async function insertJournal(client: pg.Client, account: string) {
  await client.query(
    `INSERT INTO hash_talk.message_changes(account_id,revision,charge)
    SELECT $1,n,512 FROM generate_series(1000,1999) n`,
    [account],
  );
}
