import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { PublicModerationStore } from '../../src/server/database/public-moderation.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { encode } from '../../src/shared/account/index.ts';
import { communityState } from '../../src/shared/communities/index.ts';
import { exploreFilter } from '../../src/shared/community-discovery/index.ts';
import { createCommunityAccount } from './community-fixture.ts';

await test('community classification persists atomically, stays fixed and filters ranking before pagination', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive test database required.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  const accounts: string[] = [],
    addresses: string[] = [],
    ids: string[] = [];
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
        [ids],
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
  await db.migrate();
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45124',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(
      db.communities,
      db.devices,
      db.communityPosts,
      { discovery: db.communityDiscovery },
    );
  const make = () =>
    createCommunityAccount({
      account,
      devices,
      profiles,
      communities,
      accounts,
      addresses,
    });
  const owner = await make(),
    other = await make();
  await owner.publicIdentity(`class_${crypto.randomUUID().slice(0, 8)}`);
  const otherProfile = await other.publicIdentity(
    `class_${crypto.randomUUID().slice(0, 8)}`,
  );
  const id = '10000000' + crypto.randomUUID().slice(8);
  ids.push(id);
  const input = {
    id,
    meta: { name: `Class ${id}`, description: '', rules: '' },
    classification: { nsfw: true, topics: ['meme', 'ai'] },
  };
  let state = communityState(await owner.operate('create', input));
  assert.deepEqual(state.community.classification, {
    nsfw: true,
    topics: ['ai', 'meme'],
  });
  assert.deepEqual(
    (await communities.read(id)).classification,
    state.community.classification,
  );
  await owner.operate('create', input);
  await assert.rejects(
    owner.operate('create', {
      ...input,
      classification: { nsfw: false, topics: ['dog'] },
    }),
  );
  await assert.rejects(
    owner.operate('edit', {
      id,
      revision: state.community.revision,
      meta: { ...input.meta, topics: ['dog'] },
    }),
  );
  await assert.rejects(
    other.operate('nsfw', {
      id,
      revision: state.community.revision,
      nsfw: false,
    }),
  );
  state = communityState(
    await owner.operate('role', {
      id,
      revision: state.community.revision,
      target: otherProfile.id,
      moderator: true,
    }),
  );
  await assert.rejects(
    other.operate('nsfw', {
      id,
      revision: state.community.revision,
      nsfw: false,
    }),
  );
  await assert.rejects(
    pool.query(
      "UPDATE hash_talk.community_classifications SET topics=ARRAY['dog'] WHERE community_id=$1",
      [id],
    ),
  );
  state = communityState(
    await owner.operate('nsfw', {
      id,
      revision: state.community.revision,
      nsfw: false,
    }),
  );
  assert.deepEqual(state.community.classification, {
    nsfw: false,
    topics: ['ai', 'meme'],
  });
  await assert.rejects(
    owner.operate('nsfw', {
      id,
      revision: state.community.revision - 1,
      nsfw: true,
    }),
  );
  db.publicModeration.pauseAutomaticModeration();
  state = communityState(
    await owner.operate('photo', {
      id,
      revision: state.community.revision,
      photo: {
        type: 'image/png',
        bytes: encode(
          Uint8Array.from(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLl8AAAAASUVORK5CYII=',
              'base64',
            ),
          ),
        ),
      },
    }),
  );
  assert.ok(state.community.avatar);
  const review = state.community.avatar.split('/').at(-1)!;
  assert.ok(await db.communities.releasedPhoto(id, review));
  await pool.query(
    'UPDATE hash_talk.communities SET pending_photo=$2 WHERE id=$1',
    [id, Buffer.from([1, 2, 3])],
  );
  assert.equal(await db.communities.releasedPhoto(id, review), null);
  const excluded = Array.from(
    { length: 25 },
    () => 'f0000000' + crypto.randomUUID().slice(8),
  );
  ids.push(...excluded);
  await pool.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) SELECT id,$2,'Legacy '||id::text,'','' FROM unnest($1::uuid[]) id",
    [excluded, state.community.owner!.id],
  );
  const legacy = crypto.randomUUID();
  ids.push(legacy);
  await pool.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,$3,'','')",
    [legacy, state.community.owner!.id, `Legacy ${legacy}`],
  );
  assert.equal((await communities.read(legacy)).classification, undefined);
  await assert.rejects(
    owner.operate('nsfw', { id: legacy, revision: 1, nsfw: true }),
  );
  await db.communityRanking.process();
  for (let i = 0; i < 10; i++) {
    if ((await db.communityRanking.process()) === null) break;
  }
  const filtered = await communities.explore(
    exploreFilter({ order: 'size', period: 'day', topics: ['ai', 'dog'] }),
    null,
  );
  assert.ok(filtered.items.some((item) => item.community.id === id));
  assert.ok(
    filtered.items.every((item) =>
      item.community.classification?.topics.some(
        (topic) => topic === 'ai' || topic === 'dog',
      ),
    ),
  );
  assert.ok(!filtered.items.some((item) => item.community.id === legacy));
});

await test('paused publication keeps honest evidence, expiry/removal and the exact-byte release gate', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive test database required.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 }),
    owner = crypto.randomUUID();
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.public_moderation WHERE owner=$1',
        [owner],
      );
    } finally {
      await pool.end();
      await db.close();
    }
  });
  await db.migrate();
  const client = await pool.connect();
  try {
    const old = await db.publicModeration.enqueue(client, {
      owner,
      kind: 'post-media',
      target: crypto.randomUUID(),
      contentHash: 'a'.repeat(64),
    });
    db.publicModeration.pauseAutomaticModeration();
    const current = await db.publicModeration.enqueue(client, {
      owner,
      kind: 'post-media',
      target: crypto.randomUUID(),
      contentHash: 'b'.repeat(64),
      createdAt: new Date(Date.now() - 8 * 86400000),
    });
    const records = await pool.query<{
      id: string;
      status: string;
      publication_mode: string;
      automatic_verdict: string | null;
      model_hash: string | null;
      runtime: string | null;
      frames: number | null;
      operator_verdict: string | null;
    }>(
      'SELECT id,status,publication_mode,automatic_verdict,model_hash,runtime,frames,operator_verdict FROM hash_talk.public_moderation WHERE owner=$1',
      [owner],
    );
    const row = records.rows.find((value) => value.id === current)!;
    assert.equal(row.status, 'approved');
    assert.equal(row.publication_mode, 'unreviewed');
    for (const key of [
      'automatic_verdict',
      'model_hash',
      'runtime',
      'frames',
      'operator_verdict',
    ] as const)
      assert.equal(row[key], null);
    assert.equal(
      records.rows.find((value) => value.id === old)!.status,
      'pending',
    );
    assert.equal(
      (await db.publicModeration.notices(client, owner)).find(
        (value) => value.id === current,
      )!.unreviewed,
      true,
    );
    assert.ok(
      (await db.publicModeration.released(client, [current])).has(current),
    );
    assert.equal((await db.publicModeration.released(client, [old])).size, 0);
    assert.equal(
      await db.publicModeration.claim({
        hash: 'c'.repeat(64),
        runtime: 'unused',
      }),
      null,
    );
    const automatic = new PublicModerationStore(pool, 3_000_000_000);
    assert.equal((await automatic.released(client, [current])).size, 0);
    await db.publicModeration.expired();
    assert.ok(
      (await db.publicModeration.released(client, [current])).has(current),
    );
    await db.publicModeration.remove(client, current);
    assert.equal(
      (await db.publicModeration.released(client, [current])).size,
      0,
    );
  } finally {
    client.release();
  }
});
