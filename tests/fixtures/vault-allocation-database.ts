import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { Wallet } from 'ethers';
import { AccountService } from '../../src/server/account/index.ts';
import { Database, ContentAllocator } from '../../src/server/database/index.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import type { VaultCommit } from '../../src/shared/vault/index.ts';
import {
  allocationPool,
  allocationWriter,
  allocationPredecessor,
} from './content-allocation-database.ts';
import { seedStorageReservations } from './storage-reservation-database.ts';
import { globalSourceSnapshot } from './global-usage-database.ts';
import { allocationPredecessorDefinitions } from './vault-allocation-reversal.ts';
import { messageAllocationPredecessor } from './message-allocation-reversal.ts';
import { vaultLifecyclePredecessor } from './vault-lifecycle-reversal.ts';

async function applyVaultMigration(client: pg.Client, file: string) {
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
export async function vaultAllocationFixture(
  t: TestContext,
  beforeUpgrade?: (client: pg.Client) => Promise<void>,
  beforeMessageUpgrade?: (client: pg.Client) => Promise<void>,
) {
  const config = readWebConfiguration(process.env),
    url = new URL(config.databaseUrl),
    name =
      'hash_talk_test_vault_allocations_' +
      crypto.randomUUID().replaceAll('-', '');
  assert.ok(url.pathname.startsWith('/hash_talk_test'));
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  url.pathname = '/' + name;
  const writer = allocationWriter(url.href),
    reader = allocationWriter(url.href),
    inspector = allocationWriter(url.href),
    pool = allocationPool(url.href),
    room = { bytes: 1_000_000_000_000n },
    capacity = new VolumeContentCapacity({
      read: () => Promise.resolve(room.bytes),
    }),
    db = new Database(url.href, capacity),
    allocator = new ContentAllocator(pool, (client) =>
      capacity.allocationHeadroom(client),
    );
  t.after(async () => {
    await Promise.all([
      writer.query('ROLLBACK'),
      reader.query('ROLLBACK'),
      inspector.query('ROLLBACK'),
    ]);
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
  await allocationPredecessor(inspector);
  await applyVaultMigration(inspector, '077-content-allocations.sql');
  const fixture = await seedStorageReservations(inspector),
    sources = (
      await inspector.query<{
        name: string;
      }>(`SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY c.relname`)
    ).rows,
    predecessor = await allocationPredecessorDefinitions(inspector),
    before = {
      sources: await globalSourceSnapshot(inspector, sources),
      total: (await inspector.query('SELECT * FROM hash_talk.content_usage'))
        .rows,
      catalog: (
        await inspector.query(
          'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
        )
      ).rows,
    };
  await applyVaultMigration(inspector, '078-vault-allocation-accounting.sql');
  const lifecycle = await vaultLifecyclePredecessor(inspector);
  await beforeUpgrade?.(inspector);
  await applyVaultMigration(inspector, '079-vault-lifecycle-allocations.sql');
  const message = await messageAllocationPredecessor(inspector);
  await beforeMessageUpgrade?.(inspector);
  await db.migrate();
  return {
    url: url.href,
    db,
    writer,
    reader,
    inspector,
    pool,
    room,
    capacity,
    allocator,
    fixture,
    sources,
    before,
    predecessor,
    lifecycle,
    message,
  };
}
export type VaultAllocationFixture = Awaited<
  ReturnType<typeof vaultAllocationFixture>
>;

export async function bindVaultAllocation(
  c: VaultAllocationFixture,
  input: {
    client: pg.Client;
    account?: string;
    bytes?: number;
    id?: string;
  },
) {
  const account = input.account ?? c.fixture.first,
    id = input.id ?? crypto.randomUUID(),
    grant = await c.allocator.reserve(
      input.client,
      input.bytes ?? 50_000,
      'vault-reserve',
    );
  await input.client.query(
    `SELECT set_config('hash_talk.content_allocation',$1,true),
    set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)`,
    [grant.transactionId, account, id],
  );
  return { account, id, grant };
}
export async function insertVaultReservation(
  client: pg.Client,
  input: { account: string; id: string; charge?: number },
) {
  await client.query(
    `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state)
    VALUES($1,$2::uuid,repeat(md5($2::uuid::text),2),repeat(md5('object'||$2::uuid::text),2),'{}',$3,'reserved')`,
    [input.account, input.id, input.charge ?? 4125],
  );
}
export async function runtimeVaultCommit(c: VaultAllocationFixture) {
  const service = new AccountService({
      store: c.db.authentication,
      origin: 'http://127.0.0.1:45117',
    }),
    wallet = Wallet.createRandom(),
    deviceId = crypto.randomUUID(),
    challenge = await service.challenge({
      address: wallet.address,
      chainId: 1,
      deviceId,
    }),
    login = await service.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    ),
    directory = 'c'.repeat(64);
  // The assembled vault integration separately validates real signed device
  // events and encrypted commits. Here exercise database authority/lock contracts.
  await c.inspector.query(
    `INSERT INTO hash_talk.device_directories(account_id,revision,head,event)
    VALUES($1,1,$2,$3)`,
    [login.session.accountId, directory, { devices: [{ id: deviceId }] }],
  );
  const commit: VaultCommit = {
    version: 1,
    id: crypto.randomUUID(),
    accountId: login.session.accountId,
    deviceId,
    directory,
    authorityRevision: 1,
    epoch: 1,
    sequence: 1,
    previous: null,
    block: {
      hash: crypto.randomUUID().replaceAll('-', '').repeat(2),
      bytes: 29,
    },
    manifest: {
      iv: Buffer.alloc(12).toString('base64'),
      ciphertext: Buffer.alloc(16).toString('base64'),
    },
    signature: Buffer.alloc(64).toString('base64'),
  };
  return {
    session: login.session,
    commit,
    hash: crypto.randomUUID().replaceAll('-', '').repeat(2),
  };
}
