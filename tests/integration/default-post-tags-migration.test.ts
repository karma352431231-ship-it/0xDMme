import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { defaultPostTags } from '../../src/shared/community-posts/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { createCommunityAccount } from './community-fixture.ts';

const added = defaultPostTags.slice(3);

await test('the default tag backfill adds only missing labels to active communities and keeps accounting exact', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('A dedicated local test database is required.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  await db.migrate();
  const accounts: string[] = [],
    addresses: string[] = [],
    current = crypto.randomUUID(),
    legacy = crypto.randomUUID(),
    archived = crypto.randomUUID();
  const account = new AccountService({
      store: db.authentication,
      origin: 'https://0xdmme.app',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(
      db.communities,
      db.devices,
      db.communityPosts,
    );
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
        [[current, legacy, archived]],
      );
      for (const table of [
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await pool.query(
          `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
          [accounts],
        );
      await pool.query(
        'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
        [accounts],
      );
      await pool.query(
        'DELETE FROM hash_talk.login_challenges WHERE address=ANY($1::text[])',
        [addresses],
      );
    } finally {
      await pool.end();
      await db.close();
    }
  });
  const owner = await createCommunityAccount({
    account,
    devices,
    profiles,
    communities,
    accounts,
    addresses,
  });
  const suffix = crypto.randomUUID().slice(0, 8);
  await owner.publicIdentity('tags_' + suffix);
  for (const [id, name] of [
    [current, 'Current'],
    [legacy, 'Legacy'],
    [archived, 'Archived'],
  ] as const)
    await owner.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id,
      meta: { name: `${name} ${suffix}`, description: '', rules: '' },
    });
  const { stdout } = await promisify(execFile)(
    'python3',
    [
      '-c',
      "import sys,json;sys.path.insert(0,'infra/staging');import deploy_default_tags_backfill as m;print(json.dumps([m.TABLES,m.COUNTER_CHECKS,m.GLOBAL_CHECK,m.METRICS,m.CHANGED]))",
    ],
    { timeout: 5000, maxBuffer: 65536 },
  );
  // The exact deploy contract runs here: tables, accounting checks, metrics.
  const [tables, counterCheck, globalCheck, metricsSql, changed] = JSON.parse(
    stdout,
  ) as [string[], string, string, string, string[]];
  const client = await pool.connect();
  const labels = async (community: string) =>
    (
      await client.query<{ label: string; active: boolean; revision: number }>(
        'SELECT label,active,revision FROM hash_talk.community_tags WHERE community_id=$1 ORDER BY label',
        [community],
      )
    ).rows;
  const digests = async () => {
    const result = new Map<string, string>();
    for (const name of tables)
      result.set(
        name,
        (
          await client.query<{ hash: string }>(
            `SELECT count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM hash_talk.${name} t`,
          )
        ).rows[0]!.hash,
      );
    return result;
  };
  // Rebuild the pre-English state inside a transaction, then run the exact
  // migration file again; rollback keeps the shared test schema untouched.
  await client.query('BEGIN');
  try {
    await client.query(
      'DELETE FROM hash_talk.community_tags WHERE community_id=ANY($1::uuid[])',
      [[legacy, archived]],
    );
    await client.query(
      `INSERT INTO hash_talk.community_tags(id,community_id,label,active)
       VALUES (gen_random_uuid(),$1,'Discussão',true),(gen_random_uuid(),$1,'Opinião',true),
              (gen_random_uuid(),$1,'Memes',true),(gen_random_uuid(),$1,'help',false)`,
      [legacy],
    );
    await client.query(
      'UPDATE hash_talk.communities SET archived=true WHERE id=$1',
      [archived],
    );
    const metrics = async () =>
      JSON.parse(
        Object.values(
          (await client.query(metricsSql)).rows[0] as Record<string, string>,
        )[0]!,
      ) as { preserved: string; defaults: number; missing: number };
    const currentBefore = await labels(current),
      before = await digests(),
      metricsBefore = await metrics();
    assert.ok(metricsBefore.missing >= 7);
    await client.query(
      await readFile(
        'src/server/database/migrations/100-default-post-tags-backfill.sql',
        'utf8',
      ),
    );
    assert.deepEqual(await labels(current), currentBefore);
    assert.deepEqual(await labels(archived), []);
    const legacyAfter = await labels(legacy);
    // A manager's retired "help" stays as it was; "Help" is not added again.
    assert.deepEqual(
      legacyAfter.map((tag) => tag.label).sort(),
      [
        'Discussão',
        'Memes',
        'Opinião',
        ...added.filter((label) => label !== 'Help'),
        'help',
      ].sort(),
    );
    assert.deepEqual(
      legacyAfter.find((tag) => tag.label === 'help'),
      { label: 'help', active: false, revision: 1 },
    );
    const after = await digests(),
      metricsAfter = await metrics();
    assert.deepEqual(metricsAfter, {
      preserved: metricsBefore.preserved,
      defaults: metricsBefore.defaults + metricsBefore.missing,
      missing: 0,
    });
    assert.deepEqual(
      [...tables].filter((name) => before.get(name) !== after.get(name)),
      // New rows are charged once to the global ledger behind content_usage.
      changed,
    );
    assert.deepEqual(
      Object.values((await client.query(counterCheck)).rows[0] as object),
      [true],
    );
    await client.query(globalCheck);
  } finally {
    // Release before cleanup: pool.end() waits for every checked-out client.
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
});
