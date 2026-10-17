import assert from 'node:assert/strict';
import type pg from 'pg';

export async function vaultLifecyclePredecessor(client: pg.Client) {
  const functions = (
      await client.query<{
        definition: string;
      }>(`SELECT pg_get_functiondef(p::regprocedure) AS definition
    FROM unnest(ARRAY['hash_talk.active_content_allocation()','hash_talk.enforce_allocated_source()']) p`)
    ).rows,
    view = (
      await client.query<{ definition: string }>(
        "SELECT pg_get_viewdef('hash_talk.storage_reservation_totals'::regclass,true) AS definition",
      )
    ).rows[0]!.definition,
    triggers = (
      await client.query<{
        name: string;
        definition: string;
      }>(`SELECT tgname AS name,pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE tgrelid='hash_talk.vault_operations'::regclass AND tgname IN ('storage_insert','storage_update','storage_delete') ORDER BY tgname`)
    ).rows;
  assert.equal(functions.length, 2);
  assert.equal(triggers.length, 3);
  return { functions, view, triggers };
}
/** Caller holds its synthetic database maintenance transaction/locks. */
export async function reverseVaultLifecycle(
  client: pg.Client,
  predecessor: Awaited<ReturnType<typeof vaultLifecyclePredecessor>>,
) {
  assert.equal(
    (
      await client.query<{ n: number }>(
        'SELECT count(*)::integer AS n FROM hash_talk.content_allocations',
      )
    ).rows[0]?.n,
    0,
  );
  await client.query(`DROP TRIGGER vault_allocation_head ON hash_talk.vault_heads;
    DROP FUNCTION hash_talk.enforce_allocated_vault_head();
    DROP FUNCTION hash_talk.assert_vault_maintenance_complete();
    DROP FUNCTION hash_talk.consume_vault_maintenance(hash_talk.vault_operations,hash_talk.vault_operations,text);
    DROP INDEX hash_talk.vault_operations_interrupted`);
  for (const row of predecessor.functions) await client.query(row.definition);
  await client.query(
    'CREATE OR REPLACE VIEW hash_talk.storage_reservation_totals AS ' +
      predecessor.view,
  );
  for (const row of predecessor.triggers) {
    assert.match(row.name, /^storage_(insert|update|delete)$/u);
    await client.query(
      'DROP TRIGGER ' + row.name + ' ON hash_talk.vault_operations',
    );
    await client.query(row.definition);
  }
  await client.query(`UPDATE hash_talk.storage_reservation_usage u SET reservations=t.reservations,reserved_bytes=t.reserved_bytes
    FROM hash_talk.storage_reservation_totals t WHERE u.source='vault_operations' AND u.source=t.source AND u.bucket=t.bucket
    AND (u.reservations,u.reserved_bytes) IS DISTINCT FROM (t.reservations,t.reserved_bytes);
    ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
    ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_check;
    ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check CHECK(scope IN ('prepared','vault-reserve'));
    DELETE FROM hash_talk.schema_migrations WHERE version=82`);
}
