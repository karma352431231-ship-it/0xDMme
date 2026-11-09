import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import pg from 'pg';
import { Database, ContentAllocator } from '../../src/server/database/index.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  allocationPool,
  allocationWriter,
} from './content-allocation-database.ts';
import { groupQuotaPredecessor } from './group-quota-database.ts';
import { historicalMigrations } from './historical-migrations.ts';

/** Fresh app schema and synthetic identities; no legacy-data import or backfill rehearsal. */
export async function messageReceiptFixture(
  t: TestContext,
  options: { through?: 96 | 106 } = {},
) {
  const url = new URL(readWebConfiguration(process.env).databaseUrl),
    name = 'hash_talk_test_receipts_' + crypto.randomUUID().replaceAll('-', '');
  assert.ok(url.pathname.startsWith('/hash_talk_test'));
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  url.pathname = '/' + name;
  const room = { bytes: 1_000_000_000_000n },
    capacity = new VolumeContentCapacity({
      read: () => Promise.resolve(room.bytes),
    }),
    db = new Database(url.href, capacity),
    writer = allocationWriter(url.href),
    reader = allocationWriter(url.href),
    inspector = allocationWriter(url.href),
    pool = allocationPool(url.href),
    allocator = new ContentAllocator(pool, (client) =>
      capacity.allocationHeadroom(client),
    );
  t.after(async () => {
    await Promise.all(
      [writer, reader, inspector].map((client) => client.query('ROLLBACK')),
    );
    await Promise.all([
      db.close(),
      pool.end(),
      writer.end(),
      reader.end(),
      inspector.end(),
    ]);
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  await Promise.all([writer.connect(), reader.connect(), inspector.connect()]);
  if (options.through) {
    await groupQuotaPredecessor(inspector, 93);
    await historicalMigrations(inspector, [
      '094-single-use-contact-invitations.sql',
      '095-public-post-search.sql',
      '096-message-sync-fences.sql',
    ]);
    if (options.through === 106)
      await historicalMigrations(
        inspector,
        (
          await readdir(
            new URL('../../src/server/database/migrations/', import.meta.url),
          )
        )
          .filter(
            (name) =>
              /^\d{3}.*\.sql$/u.test(name) &&
              Number(name.slice(0, 3)) >= 97 &&
              Number(name.slice(0, 3)) <= 106,
          )
          .sort(),
      );
  } else await db.migrate();
  return {
    url: url.href,
    db,
    writer,
    reader,
    inspector,
    pool,
    allocator,
    room,
  };
}
export type MessageReceiptFixture = Awaited<
  ReturnType<typeof messageReceiptFixture>
>;
