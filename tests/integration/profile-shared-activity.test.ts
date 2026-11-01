import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

await test('profile Shared tab lists only active shares; Overview keeps posts and shares', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('A dedicated test database is required.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  await db.migrate();
  const accounts = [crypto.randomUUID(), crypto.randomUUID()],
    [author, sharer] = [crypto.randomUUID(), crypto.randomUUID()],
    community = crypto.randomUUID(),
    [shared, unshared, own] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.community_posts WHERE community_id=$1',
        [community],
      );
      await pool.query('DELETE FROM hash_talk.communities WHERE id=$1', [
        community,
      ]);
      await pool.query('DELETE FROM hash_talk.accounts WHERE id=ANY($1)', [
        accounts,
      ]);
    } finally {
      await pool.end();
      await db.close();
    }
  });
  for (const [index, profile] of [author, sharer].entries()) {
    await pool.query(
      'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
      [accounts[index], `0x${randomBytes(20).toString('hex')}`],
    );
    await pool.query(
      'INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,$3)',
      [profile, accounts[index], `shared_${profile.slice(0, 8)}`],
    );
  }
  await pool.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,'Shared tab','','')",
    [community, author],
  );
  for (const [id, by] of [
    [shared, author],
    [unshared, author],
    [own, sharer],
  ] as const)
    await pool.query(
      "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text) VALUES($1,$2,$3,'Title','Text')",
      [id, community, by],
    );
  // One active share and one withdrawn share by the sharer.
  await pool.query(
    'INSERT INTO hash_talk.community_post_shares(id,profile_id,post_id,shared,revision) VALUES($1,$2,$3,true,1),($4,$2,$5,false,2)',
    [crypto.randomUUID(), sharer, shared, crypto.randomUUID(), unshared],
  );
  const posts = async (tab: string) =>
    (await db.communityDiscovery.profileActivity(sharer, tab, null)).items.map(
      (item) => [item.post.id, Boolean(item.share)],
    );
  assert.deepEqual(await posts('shared'), [[shared, true]]);
  assert.deepEqual(
    new Set((await posts('overview')).map((entry) => JSON.stringify(entry))),
    new Set([JSON.stringify([shared, true]), JSON.stringify([own, false])]),
  );
  assert.deepEqual(await posts('posts'), [[own, false]]);
});
