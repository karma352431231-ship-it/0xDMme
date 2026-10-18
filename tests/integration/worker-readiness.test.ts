import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';
import { WorkSignals } from '../../src/server/database/work-signals.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

// Execute the deploy probe's exact query, without loading a deployment executor.
const query = execFileSync(
  'python3',
  [
    '-c',
    `import ast
from pathlib import Path
source = ast.parse(Path('infra/staging/deploy_worker_readiness.py').read_text())
print(next(ast.literal_eval(node.value) for node in source.body
 if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
 and target.id == 'LEASE_SQL' for target in node.targets)))`,
  ],
  { encoding: 'utf8', timeout: 5000, maxBuffer: 8192 },
);
const roles = ['ranking', 'content', 'public'] as const;

await test('deployment readiness requires the exact database and exclusive lease identity per role', async (t) => {
  const config = readWebConfiguration(process.env);
  const url = new URL(config.databaseUrl);
  if (!url.pathname.startsWith('/hash_talk_test'))
    throw new Error('An exclusive synthetic database is required.');
  const sql = new pg.Client({ connectionString: url.href });
  const otherUrl = new URL(url);
  otherUrl.pathname = '/postgres';
  const other = new pg.Client({ connectionString: otherUrl.href });
  await sql.connect();
  t.after(() => sql.end());
  await other.connect();
  t.after(() => other.end());
  const empty = { ranking: 0, content: 0, public: 0 };
  const counts = async () => {
    const result = await sql.query<{ json_object_agg: typeof empty }>(query);
    return result.rows[0]!.json_object_agg;
  };
  assert.deepEqual(await counts(), empty);
  for (const expression of [
    'pg_advisory_lock_shared(hashtext($1)::bigint)',
    'pg_advisory_lock(0,hashtext($1))',
    'pg_advisory_lock((7::bigint << 32) | (hashtext($1)::bigint & 4294967295))',
  ]) {
    try {
      for (const role of roles)
        await sql.query('SELECT ' + expression, [
          'hash-talk:background:' + role,
        ]);
      assert.deepEqual(await counts(), empty);
    } finally {
      await sql.query('SELECT pg_advisory_unlock_all()');
    }
  }
  for (const role of roles)
    await other.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [
      'hash-talk:background:' + role,
    ]);
  assert.deepEqual(await counts(), empty);
  await other.query('SELECT pg_advisory_unlock_all()');
  const workers = roles.map((role) => {
    const signals = new WorkSignals(url.href);
    signals.holdWorker(role, () => {});
    return signals;
  });
  t.after(() => Promise.all(workers.map((worker) => worker.close())));
  for (const worker of workers) await worker.start();
  assert.deepEqual(await counts(), { ranking: 1, content: 1, public: 1 });
  await workers[1]!.close();
  assert.deepEqual(await counts(), { ranking: 1, content: 0, public: 1 });
});
