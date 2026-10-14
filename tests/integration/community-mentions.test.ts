import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { communityState } from '../../src/shared/communities/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import {
  mentionToken,
  mentionPlainText,
} from '../../src/shared/public-mentions/index.ts';
import {
  createCommunityAccount,
  rootPostContent,
} from './community-fixture.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
await test('nomes únicos concorrentes, datas e menções persistem sem trocar a identidade por reutilização de @', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  await db.migrate();
  const accounts: string[] = [],
    addresses: string[] = [],
    community = crypto.randomUUID(),
    second = crypto.randomUUID(),
    collision = crypto.randomUUID(),
    post = crypto.randomUUID(),
    review = crypto.randomUUID();
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
      await pool.query('DELETE FROM hash_talk.public_moderation WHERE id=$1', [
        review,
      ]);
      await pool.query(
        'DELETE FROM hash_talk.community_posts WHERE community_id=ANY($1::uuid[])',
        [[community, second, collision]],
      );
      await pool.query(
        'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
        [[community, second, collision]],
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
  const make = () =>
    createCommunityAccount({
      account,
      devices,
      profiles,
      communities,
      accounts,
      addresses,
    });
  const author = await make(),
    other = await make();
  const prefix = 'mention_' + crypto.randomUUID().slice(0, 8);
  const identity = await author.publicIdentity(prefix + '_ana');
  await other.publicIdentity(prefix + 'xana');
  const name = 'Arte ' + crypto.randomUUID().slice(0, 8) + ' Á';
  const results = await Promise.allSettled([
    author.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id: community,
      meta: { name, description: '', rules: '' },
    }),
    other.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id: collision,
      meta: {
        name: '  ' + name.toUpperCase().replace(' ', '   ') + ' ',
        description: '',
        rules: '',
      },
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(
    rejected?.status === 'rejected' &&
      (rejected.reason as { status: number }).status,
    409,
  );
  const winner = results[0].status === 'fulfilled' ? author : other;
  const winnerResult = results.find((result) => result.status === 'fulfilled');
  assert.ok(winnerResult?.status === 'fulfilled');
  const group = communityState(winnerResult.value).community;
  assert.ok(group.createdAt && Number.isFinite(Date.parse(group.createdAt)));
  const ref = mentionToken({
    kind: 'community',
    id: group.id,
    label: group.name,
  });
  const text = 'x'.repeat(4000 - mentionPlainText(ref).length) + ref;
  const content = await rootPostContent(communities, group.id, text);
  content.title = mentionToken({
    kind: 'user',
    id: identity.id,
    label: identity.handle,
  });
  const saved = postState(
    await winner.operate('post-create', { id: group.id, post, content }),
  );
  assert.equal(saved.post.title, content.title);
  assert.equal(saved.post.text, text);
  assert.equal(mentionPlainText(saved.post.text).length, 4000);
  assert.equal((await communities.post(group.id, post)).text, text);
  await winner.operate('create', {
    classification: { nsfw: false, topics: ['meme'] },
    id: second,
    meta: { name: 'Outra ' + name, description: ref, rules: '' },
  });
  await assert.rejects(
    winner.operate('edit', {
      id: second,
      revision: 1,
      meta: { name: name.toLowerCase(), description: '', rules: '' },
    }),
    { status: 409 },
  );
  assert.equal((await communities.read(second)).revision, 1);
  assert.equal(
    (await communities.suggestions(name.slice(0, 7))).items.some(
      (item) => item.id === group.id,
    ),
    true,
  );
  const users = await profiles.suggestions(prefix + '_');
  assert.deepEqual(
    users.map((item) => item.id),
    [identity.id],
  );
  assert.deepEqual(Object.keys(users[0]!).sort(), ['avatar', 'handle', 'id']);
  async function profileOperation(
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const proof = { directory: author.directory, payload };
    return profiles.operate(operation, author.login.session, {
      ...proof,
      signature: await sign(
        author.identity.signing,
        publicProfileBody(
          author.login.session.accountId,
          author.login.session.deviceId,
          operation,
          proof,
        ),
      ),
    });
  }
  const userRef = mentionToken({
    kind: 'user',
    id: identity.id,
    label: identity.handle,
  });
  const bio = 'x'.repeat(280 - mentionPlainText(userRef).length) + userRef;
  await profileOperation('description', { revision: 0, description: bio });
  assert.equal(
    (
      (await profileOperation('description-state', {})) as {
        description: string;
      }
    ).description,
    bio,
  );
  assert.equal((await profiles.readById(identity.id)).id, identity.id);
  await pool.query('DELETE FROM hash_talk.public_profiles WHERE id=$1', [
    identity.id,
  ]);
  const reused = await author.publicIdentity(identity.handle);
  assert.notEqual(reused.id, identity.id);
  await assert.rejects(profiles.readById(identity.id), { status: 404 });
  assert.equal((await profiles.readById(reused.id)).id, reused.id);
});
