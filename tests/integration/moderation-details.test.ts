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
import { publicModerationPolicy } from '../../src/shared/public-moderation/index.ts';
import { publicModerationDetails } from '../../src/shared/moderation-details/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

await test('análise assinada identifica o post restrito só ao autor, inclusive após coleta, sem conservar texto excluído', async (t) => {
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
  async function details(user: typeof author, id: string) {
    const body = { directory: user.directory, payload: { id } };
    return profiles.operate('moderation-details', user.login.session, {
      ...body,
      signature: await sign(
        user.identity.signing,
        publicProfileBody(
          user.login.session.accountId,
          user.login.session.deviceId,
          'moderation-details',
          body,
        ),
      ),
    });
  }
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
