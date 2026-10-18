import assert from 'node:assert/strict';
import { test } from 'node:test';
import type pg from 'pg';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  seedStorageReservations,
  assertStorageReconciled,
} from '../fixtures/storage-reservation-database.ts';
import { globalBytes } from '../fixtures/global-usage-database.ts';

const sources = ['message_attachments', 'group_media', 'status_media'] as const;
type Source = (typeof sources)[number];
const columns: Record<Source, string> = {
  message_attachments: 'message_id,sender,recipient,descriptor,bytes,charge',
  group_media:
    'group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge',
  status_media: 'status_id,author,descriptor,bytes,charge',
};
async function populate(client: pg.Client, source: Source) {
  const fields = columns[source];
  await client.query(`INSERT INTO hash_talk.${source}(id,${fields},status,writer,received)
    SELECT gen_random_uuid(),${fields},'writing',gen_random_uuid(),ARRAY[0]
    FROM (SELECT ${fields} FROM hash_talk.${source} ORDER BY id LIMIT 1) template
    CROSS JOIN generate_series(1,81)`);
  await client.query(`INSERT INTO hash_talk.${source}(id,${fields},status,received)
    SELECT gen_random_uuid(),${fields},state,ARRAY[0]
    FROM (SELECT ${fields} FROM hash_talk.${source} ORDER BY id LIMIT 1) template
    CROSS JOIN unnest(ARRAY['reserved','ready','accepted','deleting']) state`);
}
async function snapshot(client: pg.Client, source: Source) {
  return (
    await client.query<{ id: string; body: Record<string, unknown> }>(
      `SELECT id,to_jsonb(t) AS body FROM hash_talk.${source} t ORDER BY id`,
    )
  ).rows;
}
async function instrument(client: pg.Client) {
  await client.query(`CREATE TABLE public.recovery_batches(source text,rows integer,tx bigint);
    CREATE TABLE public.recovery_failure(enabled boolean);
    INSERT INTO public.recovery_failure VALUES(false);
    CREATE FUNCTION public.observe_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.recovery_batches SELECT TG_TABLE_NAME,count(*),txid_current() FROM changed;
      IF (SELECT enabled FROM public.recovery_failure) AND
         (SELECT count(*) FROM public.recovery_batches WHERE rows>0)>=2 THEN
        RAISE EXCEPTION 'Synthetic recovery interruption';
      END IF;
      RETURN NULL;
    END $$`);
  for (const source of sources)
    await client.query(`CREATE TRIGGER observe_recovery AFTER UPDATE ON hash_talk.${source}
      REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION public.observe_recovery()`);
}
function expected(rows: Awaited<ReturnType<typeof snapshot>>) {
  return rows.map((row) => ({
    ...row,
    body:
      row.body['status'] === 'writing'
        ? { ...row.body, status: 'reserved', writer: null }
        : row.body,
  }));
}

await test('startup upload recovery bounds each transaction and preserves all promises, parts and accepted rows', async (t) => {
  const c = await messageReceiptFixture(t);
  const seed = await seedStorageReservations(c.inspector);
  for (const source of sources) await populate(c.inspector, source);
  const before = new Map<Source, Awaited<ReturnType<typeof snapshot>>>();
  for (const source of sources)
    before.set(source, await snapshot(c.inspector, source));
  const bytes = await globalBytes(c.inspector);
  await instrument(c.inspector);
  const stores = [c.db.attachments, c.db.groupMedia, c.db.statusMedia];
  for (const [index, store] of stores.entries()) {
    const source = sources[index]!;
    await store.resumeInterrupted();
    assert.deepEqual(
      await snapshot(c.inspector, source),
      expected(before.get(source)!),
    );
    const batches = (
      await c.inspector.query<{ rows: number; tx: string }>(
        'SELECT rows,tx::text FROM public.recovery_batches WHERE source=$1 AND rows>0 ORDER BY tx',
        [source],
      )
    ).rows;
    assert.equal(
      batches.reduce((sum, row) => sum + row.rows, 0),
      81,
    );
    assert.ok(
      batches.every((row) => row.rows <= 32),
      'Each recovery statement must change at most 32 rows.',
    );
    assert.equal(new Set(batches.map((row) => row.tx)).size, batches.length);
    await store.resumeInterrupted();
    assert.deepEqual(
      await snapshot(c.inspector, source),
      expected(before.get(source)!),
    );
    assert.equal(await globalBytes(c.inspector), bytes);
    await assertStorageReconciled(c.inspector, seed.accounts);
  }
});

await test('interrupted recovery commits only completed batches and safely resumes after a failed batch', async (t) => {
  const c = await messageReceiptFixture(t);
  const seed = await seedStorageReservations(c.inspector);
  await populate(c.inspector, 'message_attachments');
  const before = await snapshot(c.inspector, 'message_attachments');
  const bytes = await globalBytes(c.inspector);
  await instrument(c.inspector);
  await c.inspector.query('UPDATE public.recovery_failure SET enabled=true');
  await assert.rejects(
    c.db.attachments.resumeInterrupted(),
    /Synthetic recovery interruption/u,
  );
  assert.equal(
    (
      await c.inspector.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM hash_talk.message_attachments WHERE status='writing'",
      )
    ).rows[0]!.count,
    49,
  );
  assert.equal(await globalBytes(c.inspector), bytes);
  await assertStorageReconciled(c.inspector, seed.accounts);
  await c.inspector.query('UPDATE public.recovery_failure SET enabled=false');
  await c.db.attachments.resumeInterrupted();
  assert.deepEqual(
    await snapshot(c.inspector, 'message_attachments'),
    expected(before),
  );
  assert.equal(await globalBytes(c.inspector), bytes);
  await assertStorageReconciled(c.inspector, seed.accounts);
});

await test('private and group collectors retry deleting objects without rewriting unchanged rows', async (t) => {
  const c = await messageReceiptFixture(t);
  const seed = await seedStorageReservations(c.inspector);
  for (const target of [
    { source: 'message_attachments', store: c.db.attachments },
    { source: 'group_media', store: c.db.groupMedia },
  ]) {
    await t.test(target.source, async () => {
      await c.inspector.query(
        `UPDATE hash_talk.${target.source} SET status='deleting' WHERE status IN ('reserved','ready')`,
      );
      const before = (
        await c.inspector.query<{ id: string; version: string }>(
          `SELECT id,xmin::text AS version FROM hash_talk.${target.source} WHERE status='deleting' ORDER BY id`,
        )
      ).rows;
      assert.ok(before.length > 0);
      for (let retry = 0; retry < 2; retry++) {
        const selected = await target.store.garbage();
        assert.ok(
          before.every((row) => selected.some((item) => item.id === row.id)),
        );
        assert.deepEqual(
          (
            await c.inspector.query(
              `SELECT id,xmin::text AS version FROM hash_talk.${target.source} WHERE status='deleting' ORDER BY id`,
            )
          ).rows,
          before,
        );
        await assertStorageReconciled(c.inspector, seed.accounts);
      }
    });
  }
});
