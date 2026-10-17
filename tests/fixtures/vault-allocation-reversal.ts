import assert from 'node:assert/strict';
import type pg from 'pg';
import { globalBytes, globalSourceSnapshot } from './global-usage-database.ts';
import { reverseVaultLifecycle } from './vault-lifecycle-reversal.ts';

export async function allocationPredecessorDefinitions(client: pg.Client) {
  const functions = (
      await client.query<{
        definition: string;
      }>(`SELECT pg_get_functiondef(p::regprocedure) AS definition
    FROM unnest(ARRAY['hash_talk.track_group_quota()','hash_talk.track_personal_quota()',
    'hash_talk.track_attachment_quota()','hash_talk.track_storage_reservations()',
    'hash_talk.track_statement_content_usage()','hash_talk.capture_storage_admission_baseline()']) p`)
    ).rows,
    trigger = (
      await client.query<{
        definition: string;
      }>(`SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE tgrelid='hash_talk.content_usage'::regclass AND tgname='storage_admission_baseline'`)
    ).rows[0]?.definition;
  assert.equal(functions.length, 6);
  assert.ok(trigger);
  return { functions, trigger };
}
export async function rehearseAllocationReversal(input: {
  client: pg.Client;
  sources: { name: string }[];
  predecessor: Awaited<ReturnType<typeof allocationPredecessorDefinitions>>;
  lifecycle: Parameters<typeof reverseVaultLifecycle>[1];
}) {
  const { client, sources, predecessor } = input,
    before = await globalSourceSnapshot(client, sources),
    total = await globalBytes(client),
    names = [...sources.map((s) => s.name), 'community_ranking_entries'];
  for (const name of names) assert.match(name, /^[a-z_]+$/u);
  await client.query('BEGIN');
  try {
    await client.query(
      'LOCK TABLE ' +
        names.map((n) => 'hash_talk.' + n).join(',') +
        ' IN ACCESS EXCLUSIVE MODE',
    );
    await reverseVaultLifecycle(client, input.lifecycle);
    assert.equal(
      (
        await client.query<{ n: number }>(
          'SELECT count(*)::integer AS n FROM hash_talk.content_allocations',
        )
      ).rows[0]?.n,
      0,
    );
    for (const name of names)
      await client.query(
        'DROP TRIGGER content_allocation_source ON hash_talk.' + name,
      );
    await client.query(`DROP TRIGGER storage_admission_baseline ON hash_talk.content_usage_legacy;
      DROP TRIGGER storage_admission_baseline ON hash_talk.content_usage_partitions;
      DROP VIEW hash_talk.content_usage;
      ALTER TABLE hash_talk.content_usage_legacy RENAME TO content_usage`);
    for (const row of predecessor.functions) await client.query(row.definition);
    await client.query('UPDATE hash_talk.content_usage SET used_bytes=$1', [
      total.toString(),
    ]);
    await client.query(`ALTER TABLE hash_talk.content_usage DROP CONSTRAINT content_usage_legacy_used_bytes_check;
      ALTER TABLE hash_talk.content_usage ADD CONSTRAINT content_usage_used_bytes_check CHECK(used_bytes>=0)`);
    await client.query(predecessor.trigger);
    await client.query(`DROP TABLE hash_talk.content_usage_partitions;
      DROP FUNCTION hash_talk.write_content_usage_view();
      DROP FUNCTION hash_talk.enforce_allocated_source();
      DROP FUNCTION hash_talk.add_content_usage(bigint);
      DROP FUNCTION hash_talk.guard_content_usage();
      DROP FUNCTION hash_talk.active_content_allocation();
      DROP FUNCTION hash_talk.compact_content_usage();
      ALTER TABLE hash_talk.content_allocations DROP COLUMN scope;
      DELETE FROM hash_talk.schema_migrations WHERE version=78`);
    assert.deepEqual(await globalSourceSnapshot(client, sources), before);
    assert.equal(await globalBytes(client), total);
    const id = crypto.randomUUID();
    const owner = (
      await client.query<{ id: string }>(
        'SELECT id FROM hash_talk.accounts LIMIT 1',
      )
    ).rows[0]!.id;
    await client.query(
      `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state)
      VALUES($1,$2,repeat(md5($2::uuid::text),2),repeat(md5('reverse'||$2::uuid::text),2),'{}',4125,'reserved')`,
      [owner, id],
    );
    assert.equal(await globalBytes(client), total + 4125n);
    await client.query('DELETE FROM hash_talk.vault_operations WHERE id=$1', [
      id,
    ]);
    assert.equal(await globalBytes(client), total);
  } finally {
    await client.query('ROLLBACK');
  }
}
