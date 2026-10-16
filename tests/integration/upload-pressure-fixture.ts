import assert from 'node:assert/strict';
import type pg from 'pg';
import type { AttachmentRef } from '../../src/shared/attachments/index.ts';

/** Cross-domain pending uploads consume bytes without imposing visitor counts. */
export async function withPendingUploadPressure(
  inspector: pg.Client,
  input: { sender: string; recipient: string; ref: AttachmentRef },
  work: () => Promise<unknown>,
): Promise<void> {
  const ids = Array.from({ length: 256 }, () => crypto.randomUUID());
  const before = await contentUsage(inspector);
  await inspector.query(
    `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge)
     SELECT id,id,$1,$2,jsonb_set($3::jsonb,'{id}',to_jsonb(id::text)),$4,$5 FROM unnest($6::uuid[]) id`,
    [
      input.sender,
      input.recipient,
      JSON.stringify(input.ref),
      input.ref.bytes,
      input.ref.bytes + 4096,
      ids,
    ],
  );
  try {
    assert.equal(
      (await contentUsage(inspector)) - before,
      256 * (input.ref.bytes + 4096),
    );
    await work();
  } finally {
    await inspector.query(
      'DELETE FROM hash_talk.message_attachments WHERE id=ANY($1::uuid[])',
      [ids],
    );
  }
}

async function contentUsage(inspector: pg.Client): Promise<number> {
  const result = await inspector.query<{ bytes: string }>(
    'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
  );
  return Number(result.rows[0]!.bytes);
}
