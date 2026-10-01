import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

// Explicit configuration prevents accidentally exercising another project's DB.
const config = readWebConfiguration(process.env);
if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
  throw new Error('Integração exige banco hash_talk_test exclusivo.');

await test('migrações concorrentes são atômicas e identidade sobrevive a reinício', async () => {
  const first = new Database(config.databaseUrl);
  const second = new Database(config.databaseUrl);
  let identity: string;
  try {
    await Promise.all([first.migrate(), second.migrate()]);
    assert.equal(await first.healthy(), true);
    identity = await first.installationIdentity();
    assert.equal(await second.installationIdentity(), identity);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
  const reopened = new Database(config.databaseUrl);
  try {
    await reopened.migrate();
    assert.equal(await reopened.installationIdentity(), identity);
  } finally {
    await reopened.close();
  }
});

await test('checksum alterado é recusado e manutenção/durabilidade estão habilitadas', async () => {
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  const database = new Database(config.databaseUrl);
  await inspector.connect();
  try {
    for (const option of [
      'autovacuum',
      'fsync',
      'full_page_writes',
      'synchronous_commit',
    ]) {
      const result = await inspector.query<{ setting: string }>(
        'SELECT setting FROM pg_settings WHERE name = $1',
        [option],
      );
      assert.equal(result.rows[0]?.setting, 'on');
    }
    const version = await inspector.query<{ server_version_num: string }>(
      'SHOW server_version_num',
    );
    assert.ok(Number(version.rows[0]?.server_version_num) >= 160000);
    const original = await inspector.query<{ checksum: string }>(
      'SELECT checksum FROM hash_talk.schema_migrations WHERE version = 1',
    );
    await inspector.query(
      'UPDATE hash_talk.schema_migrations SET checksum = $1 WHERE version = 1',
      ['synthetic-invalid'],
    );
    try {
      await assert.rejects(database.migrate(), /Migração aplicada difere/);
    } finally {
      await inspector.query(
        'UPDATE hash_talk.schema_migrations SET checksum = $1 WHERE version = 1',
        [original.rows[0]?.checksum],
      );
    }
  } finally {
    await database.close();
    await inspector.end();
  }
});

await test('observabilidade retorna só agregados finitos sem identificadores ou conteúdo', async () => {
  const database = new Database(config.databaseUrl);
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  await inspector.connect();
  try {
    await inspector.query('BEGIN');
    await inspector.query('SELECT pg_sleep(0.025)');
    const metrics = await database.maintenanceSnapshot();
    assert.deepEqual(
      Object.keys(metrics).sort(),
      [
        'estimatedLiveTuples',
        'estimatedDeadTuples',
        'tableBytes',
        'indexBytes',
        'vacuumRuns',
        'analyzeRuns',
        'oldestTransactionSeconds',
        'xidAge',
        'vacuumInProgress',
        'blocksRead',
        'blocksHit',
        'walBytesSinceReset',
        'commits',
        'rollbacks',
        'poolConnections',
        'poolIdle',
        'poolWaiting',
      ].sort(),
    );
    assert.ok(
      Object.values(metrics).every(
        (value) => Number.isFinite(value) && value >= 0,
      ),
    );
    assert.ok(metrics.oldestTransactionSeconds >= 0.02);
    assert.ok(metrics.tableBytes > 0);
    assert.ok(metrics.poolConnections <= 4);
  } finally {
    await inspector.query('ROLLBACK');
    await inspector.end();
    await database.close();
  }
});
