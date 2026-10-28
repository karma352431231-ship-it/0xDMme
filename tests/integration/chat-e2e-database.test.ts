import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createTestDatabase } from '../e2e/fixtures/database.ts';

await test('browser harness drops only its uniquely owned database and preserves the configured parent', async () => {
  const parentUrl = process.env['HASH_TALK_DATABASE_URL'];
  const owned = await createTestDatabase(parentUrl);
  const name = new URL(owned.url).pathname.slice(1);
  assert.notEqual(name, new URL(parentUrl!).pathname.slice(1));
  let closed = false;
  const inspector = new pg.Client({
    connectionString: parentUrl,
    connectionTimeoutMillis: 5000,
  });
  try {
    await inspector.connect();
    const before = await inspector.query<{ oid: number }>(
      'SELECT oid FROM pg_database WHERE datname=current_database()',
    );
    const child = new pg.Client({
      connectionString: owned.url,
      connectionTimeoutMillis: 5000,
    });
    try {
      await child.connect();
      assert.equal(
        (
          await child.query<{ name: string }>(
            'SELECT current_database() AS name',
          )
        ).rows[0]?.name,
        name,
      );
    } finally {
      await child.end();
    }
    await owned.close();
    closed = true;
    assert.equal(
      (
        await inspector.query('SELECT oid FROM pg_database WHERE datname=$1', [
          name,
        ])
      ).rowCount,
      0,
    );
    assert.deepEqual(
      (
        await inspector.query(
          'SELECT oid FROM pg_database WHERE datname=current_database()',
        )
      ).rows,
      before.rows,
    );
  } finally {
    try {
      if (!closed) await owned.close();
    } finally {
      await inspector.end();
    }
  }
});
