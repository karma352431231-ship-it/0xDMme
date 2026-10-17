import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { attachmentQuotaPredecessor } from './attachment-quota-database.ts';
import {
  seedPersonalQuota,
  assertPersonalQuotaMatches,
} from './personal-quota-database.ts';
import { readStorageReservations } from '../../src/server/database/storage-reservations.ts';

export const reservationSources = [
  'community_media',
  'group_media',
  'message_attachments',
  'social_media',
  'status_media',
  'vault_operations',
] as const;

export async function storageReservationPredecessor(client: pg.Client) {
  await attachmentQuotaPredecessor(client);
  const file = '076-attachment-quota-accounting.sql',
    sql = await readFile(
      new URL('../../src/server/database/migrations/' + file, import.meta.url),
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

export async function seedStorageReservations(client: pg.Client) {
  const fixture = await seedPersonalQuota(client),
    vault = crypto.randomUUID(),
    group = crypto.randomUUID(),
    community = crypto.randomUUID(),
    publicMedia = crypto.randomUUID();
  await client.query(
    "INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state) VALUES($1,$2,repeat('1',64),repeat('2',64),'{}',4125,'reserved')",
    [fixture.first, vault],
  );
  const groupId = (
    await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.groups WHERE owner=$1',
      [fixture.first],
    )
  ).rows[0]!.id;
  await client.query(
    "INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge) VALUES($1,$2,1,gen_random_uuid(),$3,'{}',1024,512,1536)",
    [group, groupId, fixture.first],
  );
  await client.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,'Synthetic storage','','')",
    [community, fixture.profiles[0]],
  );
  await client.query(
    'INSERT INTO hash_talk.community_media(id,community_id,author,source,charge) VALUES($1,$2,$3,\'{"kind":"photo","bytes":512}\',100000)',
    [publicMedia, community, fixture.profiles[0]],
  );
  const ids = new Map<string, string>();
  for (const source of reservationSources) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM hash_talk.${source} WHERE ${source === 'vault_operations' ? "state='reserved'" : "status IN ('reserved','uploading')"} ORDER BY id LIMIT 1`,
    );
    assert.ok(result.rows[0]);
    ids.set(source, result.rows[0].id);
  }
  return { ...fixture, ids };
}

export async function reservationSourceHashes(client: pg.Client) {
  const hashes: unknown[] = [];
  for (const source of reservationSources)
    hashes.push(
      (
        await client.query(
          `SELECT '${source}' AS source,count(*)::text AS rows,md5(string_agg(t::text,'|' ORDER BY id)) AS hash FROM hash_talk.${source} t`,
        )
      ).rows[0],
    );
  return hashes;
}

export async function assertStorageReconciled(
  client: pg.Client,
  accounts: string[],
) {
  const mismatch =
    await client.query(`SELECT coalesce(q.source,t.source),coalesce(q.bucket,t.bucket)
    FROM hash_talk.storage_reservation_usage q FULL JOIN hash_talk.storage_reservation_totals t USING(source,bucket)
    WHERE q.reservations IS DISTINCT FROM t.reservations OR q.reserved_bytes IS DISTINCT FROM t.reserved_bytes`);
  assert.equal(
    mismatch.rowCount,
    0,
    'Every pending-write partition must reconcile.',
  );
  const expected = (
    await client.query<{ source: string; reservations: string; bytes: string }>(
      `SELECT source,sum(reservations)::text AS reservations,sum(reserved_bytes)::text AS bytes FROM hash_talk.storage_reservation_totals GROUP BY source ORDER BY source`,
    )
  ).rows;
  const snapshot = await readStorageReservations(client);
  assert.deepEqual(
    snapshot.sources,
    expected.map((row) => ({
      source: row.source,
      reservations: Number(row.reservations),
      reservedBytes: Number(row.bytes),
    })),
  );
  await assertPersonalQuotaMatches(client, accounts);
  return snapshot;
}
