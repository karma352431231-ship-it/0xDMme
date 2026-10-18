import type pg from 'pg';

const statements = {
  message_attachments:
    "UPDATE hash_talk.message_attachments SET status='reserved',writer=NULL WHERE status='writing' AND id IN (SELECT id FROM hash_talk.message_attachments WHERE status='writing' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 32) RETURNING id",
  group_media:
    "UPDATE hash_talk.group_media SET status='reserved',writer=NULL WHERE status='writing' AND id IN (SELECT id FROM hash_talk.group_media WHERE status='writing' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 32) RETURNING id",
  status_media:
    "UPDATE hash_talk.status_media SET status='reserved',writer=NULL WHERE status='writing' AND id IN (SELECT id FROM hash_talk.status_media WHERE status='writing' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 32) RETURNING id",
} as const;

/** Startup only, after the previous sole upload writer has stopped. Each batch commits independently. */
export async function recoverInterruptedUploads(
  pool: pg.Pool,
  source: keyof typeof statements,
): Promise<void> {
  let after: string | null = null;
  while (true) {
    const result: pg.QueryResult<{ id: string }> = await pool.query(
      statements[source],
      [after],
    );
    if (!result.rowCount) return;
    for (const row of result.rows)
      if (after === null || row.id > after) after = row.id;
  }
}
