import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { CommunityViewsStore } from '../../src/server/database/community-views.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from '../../src/server/communities/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { postState } from '../../src/shared/community-posts/index.ts';

await test('visualizações públicas: concorrência, idempotência, isolamento por post, rollback e exclusão', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45129';
  const accounts: string[] = [],
    addresses: string[] = [],
    community = crypto.randomUUID();
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
  );
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      origin,
      views: (input) => db.communityViews.observe(input),
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      post: (id, post) => communities.post(id, post),
    }),
  });
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    await host.close();
    await inspector.query('DELETE FROM hash_talk.communities WHERE id=$1', [
      community,
    ]);
    for (const table of [
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [accounts],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [accounts],
    );
    await inspector.query(
      'DELETE FROM hash_talk.login_challenges WHERE address=ANY($1::text[])',
      [addresses],
    );
    await inspector.end();
    await db.close();
  });
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45129, '127.0.0.1', resolve);
  });
  const owner = await createCommunityAccount({
    account: new AccountService({ store: db.authentication, origin }),
    devices: new DeviceService(db.devices),
    profiles: new PublicProfileService(db.publicProfiles, db.devices),
    communities,
    accounts,
    addresses,
  });
  await owner.publicIdentity(`views_${crypto.randomUUID().slice(0, 8)}`);
  await owner.operate('create', {
    id: community,
    meta: {
      name: 'Visualizações sintéticas',
      description: 'Somente teste.',
      rules: 'Respeito.',
    },
  });
  const posts = [crypto.randomUUID(), crypto.randomUUID()];
  for (const post of posts)
    await owner.operate('post-create', {
      id: community,
      post,
      content: { title: 'Contagem', text: 'Sintético.', tag: null },
    });
  const observation = { community, post: posts[0]!, token: 'a'.repeat(32) };
  const request = (items: unknown[], requestOrigin = origin) =>
    fetch(`${origin}/api/communities/views`, {
      method: 'POST',
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  const revision = (
    await inspector.query<{ revision: string }>(
      'SELECT revision FROM hash_talk.community_ranking_state WHERE community_id=$1',
      [community],
    )
  ).rows[0]!.revision;
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => request([observation])),
  );
  for (const response of responses) assert.equal(response.status, 200);
  assert.equal((await communities.post(community, posts[0]!)).views, 1);
  assert.equal(
    (
      await inspector.query<{ revision: string }>(
        'SELECT revision FROM hash_talk.community_ranking_state WHERE community_id=$1',
        [community],
      )
    ).rows[0]!.revision,
    revision,
  );
  assert.equal(
    (await request([observation], 'https://other.invalid')).status,
    403,
  );
  assert.equal(
    (await request([{ ...observation, account: accounts[0] }])).status,
    400,
  );
  await request([
    { ...observation, token: 'b'.repeat(32) },
    { ...observation, post: posts[1]! },
  ]);
  assert.equal((await communities.post(community, posts[0]!)).views, 2);
  assert.equal((await communities.post(community, posts[1]!)).views, 1);
  const rows = await inspector.query<{
    post_id: string;
    viewer_hash: string;
    charge: number;
  }>(
    'SELECT post_id,viewer_hash,charge FROM hash_talk.community_post_view_marks WHERE post_id=ANY($1::uuid[])',
    [posts],
  );
  assert.equal(rows.rowCount, 3);
  assert.equal(new Set(rows.rows.map((row) => row.viewer_hash)).size, 3);
  assert.ok(rows.rows.every((row) => row.charge === 128));
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    const full = new CommunityViewsStore(pool, db.contacts, 1);
    await assert.rejects(
      full.observe({ items: [{ ...observation, token: 'c'.repeat(32) }] }),
    );
    assert.equal((await communities.post(community, posts[0]!)).views, 2);
  } finally {
    await pool.end();
  }
  const before = postState(
    await owner.operate('post-state', { id: community, post: posts[0] }),
  );
  await owner.operate('post-delete', {
    id: community,
    post: posts[0],
    revision: before.post.revision,
  });
  const hidden = await request([observation]);
  assert.deepEqual(await hidden.json(), { items: [] });
  assert.equal(await db.communityViews.collect(), 2);
  assert.equal(
    (
      await inspector.query(
        'SELECT 1 FROM hash_talk.community_post_view_marks WHERE post_id=$1',
        [posts[0]],
      )
    ).rowCount,
    0,
  );
  assert.equal(await db.communityViews.nextCollection(), null);
});
