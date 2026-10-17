import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { readStorageReservations } from '../../src/server/database/index.ts';
import { vaultAllocationFixture } from './vault-allocation-database.ts';
import { globalBytes, globalSourceSnapshot } from './global-usage-database.ts';

async function preparePredecessor(client: pg.Client) {
  const discarded = (
    await client.query<{
      account_id: string;
      id: string;
      charge: number;
    }>(`UPDATE hash_talk.vault_operations SET state='discarding',writer=gen_random_uuid()
    WHERE (account_id,id) IN(SELECT account_id,id FROM hash_talk.vault_operations WHERE state='reserved' LIMIT 1)
    RETURNING account_id,id,charge`)
  ).rows[0];
  assert.ok(discarded);
  const sources = (
    await client.query<{
      name: string;
    }>(`SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY c.relname`)
  ).rows;
  return {
    discarded,
    sources,
    rows: await globalSourceSnapshot(client, sources),
    total: await globalBytes(client),
    pending: await readStorageReservations(client),
    catalog: (
      await client.query(
        'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
      )
    ).rows,
  };
}
export async function vaultLifecycleFixture(t: TestContext) {
  let before: Awaited<ReturnType<typeof preparePredecessor>> | undefined;
  const c = await vaultAllocationFixture(t, async (client) => {
    before = await preparePredecessor(client);
  });
  assert.ok(before);
  return { ...c, upgrade: before };
}
export type VaultLifecycleFixture = Awaited<
  ReturnType<typeof vaultLifecycleFixture>
>;
export async function bindVaultMaintenance(
  c: VaultLifecycleFixture,
  input: {
    client: pg.Client;
    account: string;
    id: string;
    writer: string;
    kind: 'complete' | 'discard';
    bytes?: number;
  },
) {
  const grant = await c.allocator.reserve(
    input.client,
    input.bytes ?? 64000,
    'vault-maintain',
  );
  await input.client.query(
    `SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),
    set_config('hash_talk.content_operation',$3,true),set_config('hash_talk.content_writer',$4,true),set_config('hash_talk.vault_maintenance',$5,true)`,
    [grant.transactionId, input.account, input.id, input.writer, input.kind],
  );
  return grant;
}
