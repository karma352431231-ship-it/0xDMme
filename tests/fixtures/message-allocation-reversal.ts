import assert from 'node:assert/strict';
import type pg from 'pg';

export async function messageAllocationPredecessor(client: pg.Client) {
  return (
    await client.query<{
      definition: string;
    }>(`SELECT pg_get_functiondef(p::regprocedure) AS definition
    FROM unnest(ARRAY['hash_talk.active_content_allocation()','hash_talk.enforce_allocated_source()']) p`)
  ).rows;
}
/** Synthetic maintenance only: reverse before 079, with all owners drained. */
export async function reverseMessageAllocations(
  client: pg.Client,
  predecessor: Awaited<ReturnType<typeof messageAllocationPredecessor>>,
) {
  assert.equal(
    (
      await client.query<{ n: number }>(
        'SELECT count(*)::integer AS n FROM hash_talk.content_allocations',
      )
    ).rows[0]?.n,
    0,
  );
  for (const definition of predecessor)
    await client.query(definition.definition);
  await client.query(`DROP TRIGGER content_allocation_message_metadata ON hash_talk.message_heads;
    DROP TRIGGER content_allocation_message_metadata ON hash_talk.message_references;
    DROP FUNCTION hash_talk.assert_message_admission_complete();
    DROP FUNCTION hash_talk.consume_message_admission(text,jsonb,jsonb,text,bigint);
    DROP FUNCTION hash_talk.mark_message_admission(text,text,integer);
    ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
    ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check CHECK(scope IN ('prepared','vault-reserve','vault-maintain'));
    DELETE FROM hash_talk.schema_migrations WHERE version=80`);
}
