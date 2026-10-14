import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { encode } from '../../src/shared/account/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import {
  ModerationMedia,
  PublicProfileService,
} from '../../src/server/public-profile/index.ts';
import {
  ownPublicProfile,
  publicProfileBody,
} from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { publicModerationPolicy } from '../../src/shared/public-moderation/index.ts';
import { publicModerationDetails } from '../../src/shared/moderation-details/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

await test('signed owner review identifies restricted media and the current post without retaining deleted text', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  await db.migrate();
  const accounts: string[] = [],
    addresses: string[] = [],
    community = crypto.randomUUID(),
    post = crypto.randomUUID(),
    media = crypto.randomUUID(),
    review = crypto.randomUUID();
  const account = new AccountService({
      store: db.authentication,
      origin: 'https://0xdmme.app',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(
      db.publicProfiles,
      db.devices,
      db.profileSocial,
      new ModerationMedia({
        profiles: db.publicProfiles,
        communities: db.communities,
      }),
    ),
    communities = new CommunityService(
      db.communities,
      db.devices,
      db.communityPosts,
    );
  const reviews: string[] = [review];
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.public_moderation WHERE id=ANY($1::uuid[])',
        [reviews],
      );
      await pool.query(
        'DELETE FROM hash_talk.community_posts WHERE community_id=$1',
        [community],
      );
      await pool.query('DELETE FROM hash_talk.communities WHERE id=$1', [
        community,
      ]);
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
      }),
    author = await make(),
    other = await make();
  const owner = await author.publicIdentity(
    'review_' + crypto.randomUUID().slice(0, 8),
  );
  await other.publicIdentity('other_' + crypto.randomUUID().slice(0, 8));
  await author.operate('create', {
    classification: { nsfw: false, topics: ['meme'] },
    id: community,
    meta: { name: 'Comunidade da análise', description: '', rules: '' },
  });
  await pool.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,media_ids) VALUES($1,$2,$3,'Post identificado','Texto restrito do autor',$4)",
    [post, community, owner.id, [media]],
  );
  // No media row remains: the durable link still identifies the affected current post.
  await pool.query(
    "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy) VALUES($1,$2,'post-media',$3,$4,$5)",
    [review, owner.id, media, 'a'.repeat(64), publicModerationPolicy],
  );
  await pool.query(
    "UPDATE hash_talk.public_moderation SET status='rejected',model_hash=$2,runtime='fixture',frames=1,automatic_verdict='reject',completed_lease=$3 WHERE id=$1",
    [review, 'b'.repeat(64), crypto.randomUUID()],
  );
  async function profileOperation(
    user: typeof author,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const body = { directory: user.directory, payload };
    return profiles.operate(operation, user.login.session, {
      ...body,
      signature: await sign(
        user.identity.signing,
        publicProfileBody(
          user.login.session.accountId,
          user.login.session.deviceId,
          operation,
          body,
        ),
      ),
    });
  }
  const details = (user: typeof author, id: string) =>
    profileOperation(user, 'moderation-details', { id });
  await t.test(
    'signed image previews identify all four image kinds, deny another account, and preserve public restriction and retention',
    async () => {
      const bytes = await readFile(
        new URL('../../src/client/app/icon-192.png', import.meta.url),
      );
      const image = { type: 'image/png', bytes: encode(bytes) };
      const state = ownPublicProfile(
        await profileOperation(author, 'state', {}),
      )!;
      await profileOperation(author, 'avatar', {
        revision: state.revision,
        avatar: image,
      });
      await profileOperation(author, 'banner', { revision: 0, banner: image });
      const before = await pool.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.communities WHERE id=$1',
        [community],
      );
      await author.operate('presentation', {
        id: community,
        revision: before.rows[0]!.revision,
        meta: { name: 'Comunidade da análise', description: '', rules: '' },
        photo: image,
        banner: image,
      });
      const found = await pool.query<{ id: string; kind: string }>(
        "SELECT id,kind FROM hash_talk.public_moderation WHERE owner=$1 AND kind<>'post-media'",
        [owner.id],
      );
      assert.equal(found.rows.length, 4);
      reviews.push(...found.rows.map((row) => row.id));
      for (const row of found.rows) {
        assert.deepEqual(
          await profileOperation(author, 'moderation-media', { id: row.id }),
          image,
        );
        await assert.rejects(
          profileOperation(other, 'moderation-media', { id: row.id }),
          { status: 404 },
        );
        await pool.query(
          "UPDATE hash_talk.public_moderation SET status='failed',attempts=3 WHERE id=$1",
          [row.id],
        );
        const deadline = await details(author, row.id);
        assert.deepEqual(
          await profileOperation(author, 'moderation-media', { id: row.id }),
          image,
        );
        assert.deepEqual(await details(author, row.id), deadline);
        for (const verdict of ['hold', 'reject']) {
          await pool.query(
            "UPDATE hash_talk.public_moderation SET status=$2,model_hash=$3,runtime='fixture',frames=1,automatic_verdict=$4,completed_lease=$5 WHERE id=$1",
            [
              row.id,
              verdict === 'hold' ? 'held' : 'rejected',
              'b'.repeat(64),
              verdict,
              crypto.randomUUID(),
            ],
          );
          assert.deepEqual(
            await profileOperation(author, 'moderation-media', { id: row.id }),
            image,
          );
        }
      }
      assert.equal((await communities.read(community)).avatar, null);
      assert.equal((await communities.read(community)).banner, null);
      assert.equal((await profiles.readById(owner.id)).avatar, null);
      const banner = found.rows.find((row) => row.kind === 'community-banner')!;
      const current = await pool.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.communities WHERE id=$1',
        [community],
      );
      await author.operate('presentation', {
        id: community,
        revision: current.rows[0]!.revision,
        meta: { name: 'Comunidade da análise', description: '', rules: '' },
        photo: image,
        banner: null,
      });
      await assert.rejects(
        profileOperation(author, 'moderation-media', { id: banner.id }),
        { status: 404 },
      );
      const avatar = found.rows.find((row) => row.kind === 'avatar')!;
      await pool.query(
        'UPDATE hash_talk.public_moderation SET content_hash=$2 WHERE id=$1',
        [avatar.id, 'c'.repeat(64)],
      );
      await assert.rejects(
        profileOperation(author, 'moderation-media', { id: avatar.id }),
        { status: 404 },
      );
      for (const row of found.rows.filter(
        (row) => !['community-banner', 'avatar'].includes(row.kind),
      )) {
        await pool.query(
          "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
          [row.id],
        );
        await assert.rejects(
          profileOperation(author, 'moderation-media', { id: row.id }),
          { status: 404 },
        );
      }
      await assert.rejects(
        profileOperation(author, 'moderation-media', { id: review }),
        { status: 404 },
      );
      const payload = { id: found.rows[0]!.id, owner: owner.id };
      await assert.rejects(
        profileOperation(other, 'moderation-media', payload),
        { status: 400 },
      );
    },
  );
  const result = publicModerationDetails(await details(author, review));
  assert.equal(result.post?.id, post);
  assert.equal(result.post?.title, 'Post identificado');
  assert.equal(result.post?.text, 'Texto restrito do autor');
  assert.equal(result.automaticVerdict, 'reject');
  assert.equal(result.frames, 1);
  await assert.rejects(details(other, review), { status: 404 });
  await assert.rejects(details(author, crypto.randomUUID()), { status: 404 });
  await pool.query(
    "UPDATE hash_talk.public_moderation SET status='expired',created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
    [review],
  );
  assert.equal(
    publicModerationDetails(await details(author, review)).post?.id,
    post,
  );
  await author.operate('post-delete', { id: community, post, revision: 1 });
  assert.equal(
    publicModerationDetails(await details(author, review)).post,
    null,
  );
});
