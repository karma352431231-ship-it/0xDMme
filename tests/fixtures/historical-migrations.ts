import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';

/** Apply the explicit transition under test before unrelated later migrations. */
export async function historicalMigrations(
  client: pg.Client,
  files: readonly string[],
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const file of files) {
      if (!/^\d{3}-[a-z0-9-]+\.sql$/u.test(file))
        throw new Error('Invalid historical fixture migration.');
      const sql = await readFile(
        new URL(
          '../../src/server/database/migrations/' + file,
          import.meta.url,
        ),
        'utf8',
      );
      await client.query(sql);
      await client.query(
        'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
        [
          Number(file.slice(0, 3)),
          createHash('sha256').update(sql).digest('hex'),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
