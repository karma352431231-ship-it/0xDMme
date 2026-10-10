import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import {
  profileSummary,
  profileFollow,
  profileBanner,
} from '../../src/shared/profile-social/index.ts';
import { feedPage } from '../../src/shared/community-discovery/index.ts';
import { communityPage } from '../../src/shared/communities/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import {
  PublicProfileService,
  createPublicProfileHandler,
} from '../../src/server/public-profile/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../../src/server/public-media/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { publicModerationBinding } from '../../src/server/public-moderation/index.ts';
import { createCommunityAccount } from './community-fixture.ts';

await test('perfil social: métricas, comunidades públicas, follows, feeds e banner moderado', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const model = { hash: 'd'.repeat(64), runtime: 'profile-banner-contract' };
  const db = new Database(config.databaseUrl, 3_000_000_000, [model]),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45141',
    account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(
      db.publicProfiles,
      db.devices,
      db.profileSocial,
    );
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
    { discovery: db.communityDiscovery },
  );
  const accounts: string[] = [],
    addresses: string[] = [],
    ids = [crypto.randomUUID(), crypto.randomUUID()];
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    publicProfiles: createPublicProfileHandler(
      (handle) => profiles.read(handle),
      profiles,
    ),
    publicMedia: createPublicMediaHandler(
      new PublicMediaService({
        profiles: db.publicProfiles,
        communities: db.communities,
      }),
    ),
  });
  let connected = false;
  t.after(async () => {
    try {
      if (host.server.listening) await host.close();
      if (!connected) return;
      await inspector.query(
        'DELETE FROM hash_talk.public_moderation WHERE owner IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[]))',
        [accounts],
      );
      await inspector.query(
        'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
        [ids],
      );
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
    } finally {
      await Promise.all([inspector.end(), db.close()]);
    }
  });
  await db.migrate();
  await inspector.connect();
  connected = true;
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45141, '127.0.0.1', resolve);
  });
  const make = () =>
    createCommunityAccount({
      account,
      devices,
      communities,
      profiles,
      accounts,
      addresses,
    });
  const owner = await make(),
    reader = await make(),
    stranger = await make();
  const identity = await owner.publicIdentity(
      `ps_${crypto.randomUUID().slice(0, 8)}`,
    ),
    follower = await reader.publicIdentity(
      `ps_${crypto.randomUUID().slice(0, 8)}`,
    );
  await stranger.publicIdentity(`ps_${crypto.randomUUID().slice(0, 8)}`);
  const operate = async (
    actor: typeof owner,
    operation: string,
    payload: Record<string, unknown>,
  ) => {
    const proof = { directory: actor.directory, payload };
    return profiles.operate(operation, actor.login.session, {
      ...proof,
      signature: await sign(
        actor.identity.signing,
        publicProfileBody(
          actor.login.session.accountId,
          actor.login.session.deviceId,
          operation,
          proof,
        ),
      ),
    });
  };
  for (const id of ids)
    await owner.operate('create', {
      id,
      meta: { name: 'Comunidade fictícia', description: '', rules: '' },
    });
  const create = async (
    actor: typeof owner,
    group: string,
    parent: string | null = null,
  ) => {
    const id = crypto.randomUUID();
    await actor.operate(parent ? 'reply-create' : 'post-create', {
      id: group,
      post: id,
      content: {
        title: parent ? '' : 'Post público',
        text: 'Conteúdo sintético',
        tag: null,
      },
      ...(parent ? { parent } : {}),
    });
    return id;
  };
  const followedCommunity = ids[0]!,
    otherCommunity = ids[1]!,
    root = await create(owner, otherCommunity),
    communityPost = await create(stranger, followedCommunity),
    selfReply = await create(owner, otherCommunity, root);
  await t.test(
    'público: idade, métricas e todas as comunidades seguidas; não inclui dados privados',
    async () => {
      await owner.operate('follow', { id: followedCommunity, following: true });
      let summary = profileSummary(await profiles.summary(identity.handle));
      assert.ok(summary.createdAt);
      assert.equal(summary.posts, 1);
      assert.equal(summary.replies, 1);
      assert.equal(summary.conversations, 0);
      await create(stranger, otherCommunity, root);
      summary = profileSummary(await profiles.summary(identity.handle));
      assert.equal(summary.conversations, 1);
      const response = await fetch(
        `${origin}/api/public-profiles/${identity.handle}/page`,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const json = (await response.json()) as Record<string, unknown>;
      assert.equal(json['wallet'], undefined);
      assert.equal(json['accountId'], undefined);
      const memberships = communityPage(
        await profiles.memberships(identity.handle, null),
      );
      assert.deepEqual(
        memberships.items.map((item) => item.id),
        [followedCommunity],
      );
      const activity = feedPage(
        await profiles.activity(identity.handle, 'overview', null),
      );
      assert.deepEqual(
        new Set(activity.items.map((item) => item.post.id)),
        new Set([root, selfReply]),
      );
      assert.equal(
        activity.items.find((item) => item.post.id === selfReply)?.context?.root
          .id,
        root,
      );
      await inspector.query(
        'UPDATE hash_talk.public_profiles SET created_at=NULL WHERE id=$1',
        [identity.id],
      );
      assert.equal((await profiles.summary(identity.handle)).createdAt, null);
    },
  );
  await t.test(
    'seguir: reversível, retries, concorrência, auto-follow e feed em comunidade não seguida',
    async () => {
      const payload = { target: identity.id, following: true, revision: 0 };
      const concurrent = await Promise.all([
        operate(reader, 'follow', payload),
        operate(reader, 'follow', payload),
      ]);
      assert.deepEqual(concurrent.map(profileFollow), [
        { following: true, revision: 1 },
        { following: true, revision: 1 },
      ]);
      await assert.rejects(
        operate(owner, 'follow', {
          target: identity.id,
          following: true,
          revision: 0,
        }),
        AccountError,
      );
      await reader.operate('follow', {
        id: followedCommunity,
        following: true,
      });
      const filter = {
        scope: 'following',
        order: 'recent',
        period: 'all',
        community: null,
        tag: null,
      };
      const page = feedPage(
        await reader.operate('discovery-feed', { filter, after: null }),
      );
      assert.ok(page.items.some((item) => item.post.id === root));
      assert.ok(page.items.some((item) => item.post.id === selfReply));
      assert.ok(page.items.some((item) => item.post.id === communityPost));
      assert.equal(
        new Set(page.items.map((item) => item.post.id)).size,
        page.items.length,
      );
      const strangerPage = feedPage(
        await stranger.operate('discovery-feed', { filter, after: null }),
      );
      assert.equal(strangerPage.items.length, 0);
      const mixed = feedPage(
        await reader.operate('discovery-feed', {
          filter: { ...filter, scope: 'all', order: 'mixed' },
          after: null,
        }),
      );
      assert.ok(mixed.items.some((item) => item.post.id === selfReply));
      await operate(reader, 'follow', {
        target: identity.id,
        following: false,
        revision: 1,
      });
      await assert.rejects(
        operate(reader, 'follow', payload),
        (error: unknown) =>
          error instanceof AccountError && error.status === 409,
      );
      assert.deepEqual(
        profileFollow(
          await operate(reader, 'follow-state', { target: identity.id }),
        ),
        { following: false, revision: 2 },
      );
      await operate(reader, 'follow', {
        target: identity.id,
        following: true,
        revision: 2,
      });
      assert.equal((await profiles.summary(identity.handle)).followers, 1);
      assert.notEqual(follower.id, identity.id);
    },
  );
  await t.test(
    'banner: pendente fechado, aprovação vinculada aos bytes, remoção e falha de sessão',
    async () => {
      const bytes = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      const uploaded = profileBanner(
        await operate(owner, 'banner', {
          revision: 0,
          banner: { type: 'image/png', bytes: encode(bytes) },
        }),
      );
      assert.equal(uploaded.revision, 1);
      assert.equal((await profiles.summary(identity.handle)).banner, null);
      const job = await db.publicModeration.claim(model);
      assert.ok(job);
      assert.equal(job.kind, 'profile-banner');
      const path = `/api/public-media/profile-banner/${identity.id}/${job.id}`;
      assert.equal((await fetch(origin + path)).status, 404);
      await db.publicModeration.finish(
        job,
        { ...job, frames: 1, expectedFrames: 1, verdict: 'allow' },
        publicModerationBinding(db),
      );
      assert.equal((await profiles.summary(identity.handle)).banner, path);
      assert.equal((await fetch(origin + path)).status, 200);
      const state = profileBanner(await operate(owner, 'banner-state', {}));
      await operate(owner, 'banner', {
        revision: state.revision,
        banner: null,
      });
      assert.equal((await fetch(origin + path)).status, 404);
      await account.logout(reader.login.sessionToken);
      await assert.rejects(
        operate(reader, 'follow-state', { target: identity.id }),
        (error: unknown) =>
          error instanceof AccountError && error.status === 401,
      );
    },
  );
  await t.test(
    'banner: resultado antigo não reabre remoção; prazo fecha leitura e coleta libera bytes',
    async () => {
      const bytes = await readFile(
        new URL('../../src/client/app/icon-192.png', import.meta.url),
      );
      const upload = async () => {
        const state = profileBanner(await operate(owner, 'banner-state', {}));
        return profileBanner(
          await operate(owner, 'banner', {
            revision: state.revision,
            banner: { type: 'image/png', bytes: encode(bytes) },
          }),
        );
      };
      const pending = await upload();
      const stale = await db.publicModeration.claim(model);
      assert.ok(stale);
      assert.equal(stale.owner, identity.id);
      await operate(owner, 'banner', {
        revision: pending.revision,
        banner: null,
      });
      await assert.rejects(
        db.publicModeration.finish(
          stale,
          { ...stale, frames: 1, expectedFrames: 1, verdict: 'allow' },
          publicModerationBinding(db),
        ),
        (error: unknown) =>
          error instanceof AccountError && error.status === 409,
      );
      assert.equal(await db.publicProfiles.moderationCandidate(stale), null);
      const uploaded = await upload();
      const job = await db.publicModeration.claim(model);
      assert.ok(job);
      const payload = {
        revision: uploaded.revision - 1,
        banner: { type: 'image/png', bytes: encode(bytes) },
      };
      assert.equal(
        profileBanner(await operate(owner, 'banner', payload)).revision,
        uploaded.revision,
      );
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [job.id],
      );
      assert.equal(
        profileBanner(await operate(owner, 'banner-state', {})).banner,
        null,
      );
      const usage = async () =>
        Number(
          (
            await inspector.query<{ bytes: string }>(
              'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
            )
          ).rows[0]!.bytes,
        );
      const before = await usage();
      await db.publicProfiles.collectModeration(new AbortController().signal);
      assert.equal(before - (await usage()), bytes.length);
      assert.equal(await db.publicProfiles.moderationCandidate(job), null);
      assert.equal((await profiles.summary(identity.handle)).banner, null);
    },
  );
  await t.test(
    'exclusão fecha métricas e respostas do perfil/feed sem copiar histórico',
    async () => {
      await owner.operate('discovery-preference-set', {
        id: otherCommunity,
        post: selfReply,
        preference: { saved: true, hidden: true, revision: 0 },
      });
      const state = postState(
        await owner.operate('post-state', { id: otherCommunity, post: root }),
      );
      await owner.operate('post-delete', {
        id: otherCommunity,
        post: root,
        revision: state.post.revision,
      });
      const summary = await profiles.summary(identity.handle);
      assert.equal(summary.posts, 0);
      assert.equal(summary.replies, 0);
      assert.equal(summary.conversations, 0);
      assert.equal(
        feedPage(await profiles.activity(identity.handle, 'replies', null))
          .items.length,
        0,
      );
      for (const scope of ['saved', 'hidden']) {
        const privatePage = feedPage(
          await owner.operate('discovery-feed', {
            filter: {
              scope,
              order: 'recent',
              period: 'all',
              community: otherCommunity,
              tag: null,
            },
            after: null,
          }),
        );
        assert.equal(privatePage.items[0]?.post.id, selfReply);
        assert.equal(privatePage.items[0]?.context, undefined);
      }
    },
  );
  await t.test(
    'página cheia de respostas aninhadas projeta ancestrais em lotes e vincula cursor ao perfil/aba',
    async () => {
      const replies: string[] = [];
      for (let index = 0; index < 25; index++) {
        const root = await create(stranger, otherCommunity);
        const parent = await create(stranger, otherCommunity, root);
        replies.push(await create(owner, otherCommunity, parent));
      }
      const page = feedPage(
        await profiles.activity(identity.handle, 'replies', null),
      );
      assert.equal(page.items.length, 24);
      assert.ok(page.next);
      assert.ok(
        page.items.every(
          (item) =>
            item.context && item.context.root.id !== item.context.parent.id,
        ),
      );
      const second = feedPage(
        await profiles.activity(identity.handle, 'replies', page.next),
      );
      assert.equal(second.items.length, 1);
      assert.deepEqual(
        new Set([...page.items, ...second.items].map((item) => item.post.id)),
        new Set(replies),
      );
      for (const [handle, tab] of [
        [follower.handle, 'replies'],
        [identity.handle, 'posts'],
      ])
        await assert.rejects(
          profiles.activity(handle!, tab!, page.next),
          (error: unknown) =>
            error instanceof AccountError && error.status === 400,
        );
      await operate(stranger, 'follow', {
        target: identity.id,
        following: true,
        revision: 0,
      });
      const following = feedPage(
        await stranger.operate('discovery-feed', {
          filter: {
            scope: 'following',
            order: 'recent',
            period: 'all',
            community: otherCommunity,
            tag: null,
          },
          after: null,
        }),
      );
      assert.equal(following.items.length, 24);
      assert.ok(
        following.items.every(
          (item) =>
            item.context && item.context.root.id !== item.context.parent.id,
        ),
      );
    },
  );
});
