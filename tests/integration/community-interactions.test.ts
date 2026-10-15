import {
  upvoteNoticePage,
  upvoterPage,
} from '../../src/shared/public-upvotes/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { queueReplyNotice } from '../../src/server/database/public-notice-wake.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import {
  communityState,
  communityPageSize,
} from '../../src/shared/communities/index.ts';
import {
  communityPost,
  postState,
  replyNotificationPage,
} from '../../src/shared/community-posts/index.ts';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import { communityBody } from '../../src/shared/communities/index.ts';
import { createIdentity } from '../../src/client/device-keys/index.ts';
import {
  prepareEvent,
  freshKeyring,
} from '../../src/client/device-operations/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { NotificationService } from '../../src/server/notifications/index.ts';
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from '../../src/server/communities/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createCommunityAccount,
  rootPostContent,
} from './community-fixture.ts';

await test('corte 5: árvore, votos e avisos diretos com autorização e persistência', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl }),
    origin = 'http://127.0.0.1:45123',
    account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(
      db.communities,
      db.devices,
      db.communityPosts,
    ),
    accounts: string[] = [],
    addresses: string[] = [],
    ids: string[] = [];
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      post: (id, post) => communities.post(id, post),
      upvoters: (id, post, after) => communities.upvoters(id, post, after),
      postPage: (id, after, tag) => communities.postPage(id, after, tag),
      replies: (id, parent, after) => communities.replies(id, parent, after),
      tags: (id, after) => communities.tags(id, after),
    }),
    account: createAccountHandler({ origin, service: account, communities }),
  });
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    await host.close();
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
    await inspector.end();
    await db.close();
  });
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45123, '127.0.0.1', resolve);
  });
  const make = () =>
      createCommunityAccount({
        account,
        devices,
        communities,
        profiles,
        accounts,
        addresses,
      }),
    owner = await make(),
    author = await make(),
    outsider = await make();
  const root = crypto.randomUUID(),
    reply = crypto.randomUUID(),
    child = crypto.randomUUID(),
    community = crypto.randomUUID(),
    other = crypto.randomUUID();
  ids.push(community, other);
  const ownerProfile = await owner.publicIdentity(
      `p5_${crypto.randomUUID().slice(0, 8)}`,
    ),
    authorProfile = await author.publicIdentity(
      `p5_${crypto.randomUUID().slice(0, 8)}`,
    ),
    outsiderProfile = await outsider.publicIdentity(
      `p5_${crypto.randomUUID().slice(0, 8)}`,
    );
  for (const id of ids)
    await owner.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id,
      meta: {
        name: `Interações sintéticas ${id}`,
        description: 'Teste isolado',
        rules: 'Respeito',
      },
    });
  const create = async (
    who: typeof owner,
    id: string,
    parent: string | null = null,
    extraCommunity = community,
  ) =>
    who.operate(parent ? 'reply-create' : 'post-create', {
      id: extraCommunity,
      post: id,
      content: parent
        ? { title: '', text: 'Resposta sintética', tags: [] }
        : await rootPostContent(
            communities,
            extraCommunity,
            'Resposta sintética',
          ),
      ...(parent ? { parent } : {}),
    });
  const state = async (who: typeof owner, id: string) =>
    postState(await who.operate('post-state', { id: community, post: id }));
  const notices = async (who: typeof owner, after: string | null = null) =>
    replyNotificationPage(
      await who.operate('post-notifications', { after, authors: true }),
    );
  const bad = (status: number) => (error: unknown) =>
    error instanceof AccountError && error.status === status;
  await create(owner, root);
  const authority = {
    session: owner.login.session,
    directory: owner.directory,
  };
  await db.daily.subscribe(authority, {
    endpoint: 'https://web.push.apple.com/test-synthetic',
    keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
  });
  await t.test(
    'reply não exige follow; retry não duplica filho, notificação ou push; apenas destinatário direto',
    async () => {
      const before = await vaultUsage(
        inspector,
        author.login.session.accountId,
      );
      await create(author, reply, root);
      await create(author, reply, root);
      assert.equal(
        (await communities.replies(community, root, null)).items.length,
        1,
      );
      assert.equal((await communities.post(community, root)).replies, 1);
      assert.equal((await notices(owner)).items.length, 1);
      // Atividade shows who answered and what, from the public projection.
      const preview = (await notices(owner)).items[0]?.preview;
      assert.equal(preview?.status, 'visible');
      assert.equal(preview?.text, 'Resposta sintética');
      assert.equal(typeof preview?.author, 'string');
      assert.equal(preview?.identity?.id, authorProfile.id);
      assert.equal(preview?.identity?.handle, authorProfile.handle);
      const legacy = replyNotificationPage(
        await owner.operate('post-notifications', { after: null }),
      );
      assert.equal(Object.hasOwn(legacy.items[0]!.preview!, 'identity'), false);

      assert.equal((await notices(author)).items.length, 0);
      const jobs = await db.daily.jobs();
      const job = jobs.find(
        (job) => job.account_id === owner.login.session.accountId,
      )!;
      assert.ok(job);
      assert.equal(Number(job.generation), 1);
      assert.equal(await db.daily.eligible(job), true);
      await db.daily.configurePush(authority, {
        messages: false,
        calls: true,
        showCalls: true,
      });
      assert.equal(await db.daily.eligible(job), false);
      await db.daily.configurePush(authority, {
        messages: true,
        calls: true,
        showCalls: true,
      });
      await create(outsider, child, reply);
      assert.equal((await notices(author)).items.length, 1);
      assert.equal((await notices(owner)).items.length, 1);
      await create(owner, crypto.randomUUID(), root);
      assert.equal((await notices(owner)).items.length, 1);
      assert.deepEqual(
        await vaultUsage(inspector, author.login.session.accountId),
        before,
      );
      assert.deepEqual(
        (await communities.postPage(community, null, null)).items.map(
          (item) => item.id,
        ),
        [root],
      );
    },
  );
  await t.test(
    'reply wakes the recipient without push consent, only after commit and never after rollback',
    async () => {
      const recipient = await make();
      const profile = await recipient.publicIdentity(
        `wake_${crypto.randomUUID().slice(0, 8)}`,
      );
      const listener = new pg.Client({ connectionString: config.databaseUrl });
      const frames: {
        accounts: string[];
        removed: boolean;
        authorization: boolean;
      }[] = [];
      await listener.connect();
      listener.on('notification', (notice) => {
        if (notice.channel === 'hash_talk_content_changes')
          frames.push(
            JSON.parse(notice.payload ?? '{}') as (typeof frames)[number],
          );
      });
      await listener.query('LISTEN hash_talk_content_changes');
      try {
        assert.equal(
          (
            await inspector.query(
              'SELECT 1 FROM hash_talk.push_subscriptions WHERE account_id=$1',
              [recipient.login.session.accountId],
            )
          ).rowCount,
          0,
        );
        await inspector.query('BEGIN');
        await queueReplyNotice(inspector, profile.id);
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        assert.equal(frames.length, 0);
        await inspector.query('ROLLBACK');
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        assert.equal(frames.length, 0);
        await inspector.query('BEGIN');
        await queueReplyNotice(inspector, profile.id);
        await inspector.query('COMMIT');
        const deadline = Date.now() + 2000;
        while (!frames.length && Date.now() < deadline)
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        assert.deepEqual(frames, [
          {
            accounts: [recipient.login.session.accountId],
            removed: false,
            authorization: false,
          },
        ]);
      } finally {
        await inspector.query('ROLLBACK');
        await listener.end();
      }
    },
  );
  await t.test(
    'push comum acorda após commit e uma nova resposta não herda a espera após sucesso',
    async () => {
      const testRoot = crypto.randomUUID(),
        testCommunity = crypto.randomUUID();
      ids.push(testCommunity);
      await owner.operate('create', {
        classification: { nsfw: false, topics: ['meme'] },
        id: testCommunity,
        meta: { name: 'Push sintético isolado', description: '', rules: '' },
      });
      await create(owner, testRoot, null, testCommunity);
      let deliveries = 0;
      const notifications = new NotificationService({
        store: db.daily,
        devices: db.devices,
        config: { publicKey: 'synthetic' },
        signals: db.workSignals,
        send: () => {
          deliveries++;
          return Promise.resolve();
        },
      });
      try {
        await db.workSignals.start();
        notifications.start();
        const awaitDelivery = async (expected: number) => {
          const until = Date.now() + 2000;
          while (deliveries < expected && Date.now() < until)
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
          assert.equal(deliveries, expected);
        };
        await awaitDelivery(1);
        // Finish() persists after the send callback; wait for its acknowledgment.
        const until = Date.now() + 2000;
        while (Date.now() < until) {
          const state = await inspector.query<{ pending: boolean }>(
            'SELECT pending FROM hash_talk.push_subscriptions WHERE account_id=$1',
            [owner.login.session.accountId],
          );
          if (!state.rows[0]!.pending) break;
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        await create(author, crypto.randomUUID(), testRoot, testCommunity);
        await awaitDelivery(2);
      } finally {
        await notifications.close();
        await inspector.query('DELETE FROM hash_talk.communities WHERE id=$1', [
          testCommunity,
        ]);
      }
    },
  );
  await t.test(
    'árvore não atravessa comunidades, não aceita pai ausente nem muda pai em retry',
    async () => {
      await assert.rejects(
        create(author, crypto.randomUUID(), root, other),
        bad(404),
      );
      await assert.rejects(
        create(author, crypto.randomUUID(), crypto.randomUUID()),
        bad(404),
      );
      await assert.rejects(create(author, reply, child), bad(409));
      const beforeNotice = (await notices(author)).items.length;
      await outsider.operate('post-edit', {
        id: community,
        post: child,
        revision: 1,
        content: { title: '', text: 'Resposta filha editada', tags: [] },
      });
      assert.equal((await communities.post(community, child)).parent, reply);
      assert.equal((await communities.post(community, child)).root, root);
      assert.equal((await notices(author)).items.length, beforeNotice);
      await assert.rejects(
        author.operate('post-edit', {
          id: community,
          post: child,
          revision: 2,
          content: { title: '', text: 'Outro autor', tags: [] },
        }),
        bad(403),
      );
      await assert.rejects(
        outsider.operate('post-edit', {
          id: community,
          post: child,
          revision: 2,
          content: { title: 'Título de reply', text: 'Inválida', tags: [] },
        }),
        bad(400),
      );
      const read = await fetch(
        `${origin}/api/communities/${community}/posts/${root}/replies`,
      );
      assert.equal(read.status, 200);
      const publicPage = (await read.json()) as unknown;
      assert.equal(
        JSON.stringify(publicPage).includes(author.login.session.accountId),
        false,
      );
      assert.equal(
        JSON.stringify(publicPage).includes(author.wallet.address),
        false,
      );
      assert.equal(
        (
          await fetch(
            `${origin}/api/communities/${other}/posts/${root}/replies`,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    'one position per voter, current public upvotes and idempotent author arrivals',
    async () => {
      const before = (await notices(owner)).items.length;
      const vote = (
        who: typeof owner,
        post: string,
        position: number,
        voteRevision: number,
      ) =>
        who.operate('post-vote', {
          id: community,
          post,
          position,
          voteRevision,
        });
      const upvotes = async (who: typeof owner) =>
        upvoteNoticePage(
          await who.operate('post-upvote-notifications', { after: null }),
        );
      const listener = new pg.Client({ connectionString: config.databaseUrl });
      const frames: { accounts?: string[] }[] = [];
      await listener.connect();
      listener.on('notification', (frame) => {
        if (frame.channel === 'hash_talk_content_changes')
          frames.push(
            JSON.parse(frame.payload ?? '{}') as (typeof frames)[number],
          );
      });
      try {
        await listener.query('LISTEN hash_talk_content_changes');
        await Promise.all([vote(author, root, 1, 0), vote(author, root, 1, 0)]);
        const until = Date.now() + 2000;
        while (
          !frames.some((frame) =>
            frame.accounts?.includes(owner.login.session.accountId),
          ) &&
          Date.now() < until
        )
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        assert.equal(
          frames.filter((frame) =>
            frame.accounts?.includes(owner.login.session.accountId),
          ).length,
          1,
        );
      } finally {
        await listener.end();
      }
      const arrival = (await upvotes(owner)).items.find(
        (item) => item.post === root,
      )!;
      assert.ok(arrival);
      assert.equal(arrival.actor.id, authorProfile.id);
      assert.equal(arrival.kind, 'post');
      assert.equal(
        (await upvotes(owner)).items.filter((item) => item.post === root)
          .length,
        1,
      );
      const response = await fetch(
        `${origin}/api/communities/${community}/posts/${root}/upvoters`,
      );
      assert.equal(response.status, 200);
      const voters = upvoterPage(await response.json());
      assert.deepEqual(
        voters.items.map((item) => item.id),
        [authorProfile.id],
      );
      const serialized = JSON.stringify(voters);
      assert.ok(!serialized.includes(author.wallet.address));
      assert.ok(!serialized.includes(author.login.session.accountId));
      await outsider.operate('post-upvote-notifications-read', {
        ids: [arrival.id],
      });
      assert.equal(
        (await upvotes(owner)).items.find((item) => item.id === arrival.id)
          ?.read,
        false,
      );
      await owner.operate('post-upvote-notifications-read', {
        ids: [arrival.id],
      });
      assert.equal(
        (await upvotes(owner)).items.find((item) => item.id === arrival.id)
          ?.read,
        true,
      );

      assert.equal((await communities.post(community, root)).score, 1);
      await vote(author, root, -1, 1);
      await vote(author, root, -1, 1);
      assert.equal(
        (await communities.upvoters(community, root, null)).items.length,
        0,
      );
      assert.equal(
        (await upvotes(owner)).items.filter((item) => item.post === root)
          .length,
        0,
      );

      assert.equal((await communities.post(community, root)).score, -1);
      await vote(author, root, 0, 2);
      await vote(author, root, 0, 2);
      assert.equal((await communities.post(community, root)).score, 0);
      await assert.rejects(vote(author, root, 1, 0), bad(409));
      const results = await Promise.allSettled([
        vote(author, reply, 1, 0),
        vote(author, reply, -1, 0),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      await vote(author, root, 1, 3);
      const renewed = (await upvotes(owner)).items.find(
        (item) => item.post === root,
      )!;
      assert.notEqual(renewed.id, arrival.id);
      assert.equal(renewed.read, false);
      await owner.operate('post-upvote-notifications-read', {
        ids: [arrival.id],
      });
      assert.equal(
        (await upvotes(owner)).items.find((item) => item.id === renewed.id)
          ?.read,
        false,
      );
      await vote(author, root, 0, 4);
      await vote(outsider, root, 1, 0);
      assert.equal(
        (await upvotes(owner)).items.filter((item) => item.post === root)
          .length,
        1,
      );

      assert.equal((await state(owner, root)).vote.position, 0);
      assert.equal((await state(outsider, root)).vote.position, 1);
      assert.equal((await notices(owner)).items.length, before);
      const publicData = communityPost(await communities.post(community, root));
      assert.equal(Object.hasOwn(publicData, 'vote'), false);
    },
  );
  await t.test(
    'upvotes notify reply authors, suppress self/blocked arrivals and honor current visibility',
    async () => {
      const target = crypto.randomUUID(),
        replyTarget = crypto.randomUUID();
      await create(owner, target);
      await create(author, replyTarget, target);
      const inbox = async (who: typeof owner) =>
        upvoteNoticePage(
          await who.operate('post-upvote-notifications', { after: null }),
        );
      const vote = (
        who: typeof owner,
        post: string,
        position: number,
        voteRevision: number,
      ) =>
        who.operate('post-vote', {
          id: community,
          post,
          position,
          voteRevision,
        });
      await vote(owner, target, 1, 0);
      assert.ok(
        !(await inbox(owner)).items.some((item) => item.post === target),
      );
      await vote(owner, replyTarget, 1, 0);
      const note = (await inbox(author)).items.find(
        (item) => item.post === replyTarget,
      )!;
      assert.ok(note);
      assert.equal(note.kind, 'reply');
      assert.equal(note.actor.id, ownerProfile.id);
      assert.equal(note.text, 'Resposta sintética');
      await owner.operate('profile-block-set', {
        target: authorProfile.id,
        blocked: true,
        revision: 0,
      });
      assert.ok(
        !(await inbox(author)).items.some((item) => item.post === replyTarget),
      );
      await vote(author, target, 1, 0);
      assert.ok(
        !(await inbox(owner)).items.some((item) => item.post === target),
      );
      await owner.operate('profile-block-set', {
        target: authorProfile.id,
        blocked: false,
        revision: 1,
      });
      assert.ok(
        !(await inbox(owner)).items.some((item) => item.post === target),
      );
      await vote(author, target, 0, 1);
      const before = await inspector.query<{ n: string }>(
        'SELECT count(*) AS n FROM hash_talk.public_upvote_notifications WHERE post_id=$1',
        [target],
      );
      const limited = new Database(config.databaseUrl, 1);
      try {
        const service = new CommunityService(
          limited.communities,
          limited.devices,
          limited.communityPosts,
        );
        await assert.rejects(
          service.operate(
            'post-vote',
            author.login.session,
            await author.proof('post-vote', {
              id: community,
              post: target,
              position: 1,
              voteRevision: 2,
            }),
          ),
          bad(503),
        );
        assert.equal((await state(author, target)).vote.position, 0);
        assert.deepEqual(
          (
            await inspector.query(
              'SELECT count(*) AS n FROM hash_talk.public_upvote_notifications WHERE post_id=$1',
              [target],
            )
          ).rows,
          before.rows,
        );
      } finally {
        await limited.close();
      }
      await author.operate('post-delete', {
        id: community,
        post: replyTarget,
        revision: 1,
      });
      assert.ok(
        !(await inbox(author)).items.some((item) => item.post === replyTarget),
      );
      await assert.rejects(
        communities.upvoters(community, replyTarget, null),
        bad(404),
      );
      await assert.rejects(communities.upvoters(other, target, null), bad(404));
      await assert.rejects(
        owner.operate('post-upvote-notifications', {
          after: null,
          wallet: 'private',
        }),
        bad(400),
      );
      await inspector.query(
        'DELETE FROM hash_talk.community_posts WHERE id=ANY($1::uuid[])',
        [[replyTarget, target]],
      );
    },
  );
  await t.test(
    'public upvoter pages are bounded, nonduplicating and exclude neutral/downvotes',
    async () => {
      const target = crypto.randomUUID();
      await create(owner, target);
      const voters = [];
      for (let index = 0; index < 25; index++) {
        const voter = await make();
        const profile = await voter.publicIdentity(
          'voter_' + crypto.randomUUID().slice(0, 8),
        );
        voters.push(profile.id);
        await voter.operate('post-vote', {
          id: community,
          post: target,
          position: 1,
          voteRevision: 0,
        });
      }
      await owner.operate('post-vote', {
        id: community,
        post: target,
        position: -1,
        voteRevision: 0,
      });
      const one = await communities.upvoters(community, target, null);
      assert.equal(one.items.length, 24);
      assert.ok(one.next);
      const two = await communities.upvoters(community, target, one.next);
      assert.equal(two.items.length, 1);
      assert.equal(two.next, null);
      assert.deepEqual(
        [...one.items, ...two.items].map((item) => item.id).sort(),
        voters.sort(),
      );
      const first = upvoteNoticePage(
        await owner.operate('post-upvote-notifications', { after: null }),
      );
      assert.equal(first.items.length, 24);
      assert.ok(first.next);
      const second = upvoteNoticePage(
        await owner.operate('post-upvote-notifications', { after: first.next }),
      );
      assert.equal(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
        first.items.length + second.items.length,
      );
      // Keep the pre-existing reply pagination fixture's subject count unchanged.
      await owner.operate('post-delete', {
        id: community,
        post: target,
        revision: 1,
      });
    },
  );
  await t.test(
    'paginação de irmãos e notificações não perde/repete itens; leitura é privada/idempotente',
    async () => {
      for (let i = 0; i < communityPageSize + 2; i++)
        await create(author, crypto.randomUUID(), root);
      const first = await communities.replies(community, root, null),
        second = await communities.replies(community, root, first.next);
      assert.equal(first.items.length, communityPageSize);
      assert.equal(second.items.length, 4);
      assert.equal(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
        communityPageSize + 4,
      );
      const one = await notices(owner),
        two = await notices(owner, one.next);
      assert.equal(one.items.length, communityPageSize);
      assert.equal(two.items.length, 3);
      assert.equal(
        new Set([...one.items, ...two.items].map((item) => item.reply)).size,
        communityPageSize + 3,
      );
      await outsider.operate('post-notifications-read', { replies: [reply] });
      assert.equal(
        (await notices(owner)).items.find((item) => item.reply === reply)
          ?.read ??
          (await notices(owner, one.next)).items.find(
            (item) => item.reply === reply,
          )?.read,
        false,
      );
      for (const page of [one, two, one])
        await owner.operate('post-notifications-read', {
          replies: page.items.map((item) => item.reply),
        });
      assert.ok((await notices(owner)).items.every((item) => item.read));
      const job = (await db.daily.jobs()).find(
        (job) => job.account_id === owner.login.session.accountId,
      )!;
      assert.equal(await db.daily.eligible(job), false);
      await assert.rejects(
        owner.operate('post-notifications', { after: null, wallet: 'private' }),
        bad(400),
      );
    },
  );
  await t.test(
    'falta de capacidade reverte reply, contador, voto, aviso e push na mesma transação',
    async () => {
      const limited = new Database(config.databaseUrl, 1);
      const service = new CommunityService(
        limited.communities,
        limited.devices,
        limited.communityPosts,
      );
      try {
        const id = crypto.randomUUID(),
          old = (await communities.post(community, root)).replies;
        await assert.rejects(
          service.operate(
            'reply-create',
            author.login.session,
            await author.proof('reply-create', {
              id: community,
              post: id,
              parent: root,
              content: { title: '', text: 'Não cabe', tags: [] },
            }),
          ),
          bad(503),
        );
        assert.equal((await communities.post(community, root)).replies, old);
        await assert.rejects(communities.post(community, id), bad(404));
        await assert.rejects(
          service.operate(
            'post-vote',
            owner.login.session,
            await owner.proof('post-vote', {
              id: community,
              post: root,
              position: 1,
              voteRevision: 0,
            }),
          ),
          bad(503),
        );
        assert.equal((await state(owner, root)).vote.position, 0);
      } finally {
        await limited.close();
      }
    },
  );
  await t.test(
    'sanção/arquivo impedem novos replies/votos; exclusão própria e avisos continuam acessíveis',
    async () => {
      let current = communityState(
        await owner.operate('state', { id: community }),
      );
      await owner.operate('archive', {
        id: community,
        revision: current.community.revision,
        archived: true,
      });
      await assert.rejects(create(author, crypto.randomUUID(), root), bad(403));
      await assert.rejects(
        author.operate('post-vote', {
          id: community,
          post: root,
          position: 1,
          voteRevision: 5,
        }),
        bad(403),
      );
      assert.ok((await notices(owner)).items.length);
      current = communityState(await owner.operate('state', { id: community }));
      await owner.operate('archive', {
        id: community,
        revision: current.community.revision,
        archived: false,
      });
      current = communityState(await owner.operate('state', { id: community }));
      await owner.operate('sanction', {
        id: community,
        revision: current.community.revision,
        record: crypto.randomUUID(),
        target: outsiderProfile.id,
        reason: 'Teste de suspensão',
        days: null,
      });
      await assert.rejects(
        create(outsider, crypto.randomUUID(), root),
        bad(403),
      );
      await assert.rejects(
        outsider.operate('post-vote', {
          id: community,
          post: root,
          position: -1,
          voteRevision: 1,
        }),
        bad(403),
      );
      assert.equal(
        (await notices(owner)).items.some((item) => !item.read),
        false,
      );
      assert.equal(
        authorProfile.id,
        (await state(author, reply)).post.author?.id,
      );
    },
  );
  await t.test(
    'ocultar/excluir preserva árvore e marcadores; texto restrito e histórico não entram no público',
    async () => {
      let current = await state(author, reply);
      const record = crypto.randomUUID();
      await owner.operate('post-hide', {
        id: community,
        post: reply,
        revision: current.post.revision,
        record,
        reason: 'Regra local',
      });
      const hidden = await communities.post(community, reply);
      assert.equal(hidden.text, '');
      assert.equal(hidden.author, null);
      assert.equal(
        (await state(author, reply)).content?.text,
        'Resposta sintética',
      );
      await author.operate('post-appeal', {
        id: community,
        post: reply,
        record,
        text: 'Contestação',
      });
      current = await state(author, reply);
      await author.operate('post-delete', {
        id: community,
        post: reply,
        revision: current.post.revision,
      });
      assert.equal(
        (await communities.post(community, reply)).status,
        'deleted',
      );
      assert.equal(
        (await communities.replies(community, reply, null)).items[0]?.id,
        child,
      );
      const first = await communities.replies(community, root, null),
        second = await communities.replies(community, root, first.next);
      assert.equal(
        [...first.items, ...second.items].find((item) => item.id === reply)
          ?.status,
        'deleted',
      );
      await assert.rejects(
        owner.operate('post-decide', {
          id: community,
          post: reply,
          revision: (await state(owner, reply)).post.revision,
          record,
          decision: 'Restaurar',
          restore: true,
        }),
        bad(409),
      );
      const history = await author.operate('post-moderations', {
        id: community,
        post: reply,
        after: null,
      });
      assert.ok(JSON.stringify(history).includes('Contestação'));
      const rootState = await state(owner, root);
      await owner.operate('post-delete', {
        id: community,
        post: root,
        revision: rootState.post.revision,
      });
      assert.ok(
        (await communities.replies(community, root, null)).items.length,
      );
      await assert.rejects(
        create(author, crypto.randomUUID(), child),
        bad(409),
      );
      await assert.rejects(
        author.operate('post-vote', {
          id: community,
          post: child,
          position: 1,
          voteRevision: 0,
        }),
        bad(409),
      );
    },
  );
  await t.test(
    'exclusão sintética retira o voto; @ reutilizado não herda autoria nem avisos',
    async () => {
      const previous = (await communities.post(community, root)).score;
      for (const table of [
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE account_id=$1`,
          [outsider.login.session.accountId],
        );
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        outsider.login.session.accountId,
      ]);
      assert.equal(
        (await communities.post(community, root)).score,
        previous - 1,
      );
      assert.equal((await communities.post(community, child)).author, null);
      const replacement = await make();
      const profile = await replacement.publicIdentity(outsiderProfile.handle);
      assert.notEqual(profile.id, outsiderProfile.id);
      assert.equal((await state(replacement, child)).own, false);
      assert.equal((await notices(replacement)).items.length, 0);
    },
  );
  await t.test(
    'recuperação conserva avisos e voto por conta; revogação recusa o aparelho anterior',
    async () => {
      const oldProof = await owner.proof('post-notifications', { after: null });
      const challenge = await account.challenge({
        address: owner.wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
      const login = await account.login(
        {
          id: challenge.id,
          signature: await owner.wallet.signMessage(challenge.message),
        },
        challenge.browserToken,
      );
      const identity = await createIdentity(
        login.session.deviceId,
        'Recuperado fictício',
      );
      const event = await prepareEvent({
        accountId: login.session.accountId,
        previous: owner.event,
        kind: 'recover',
        signer: 'recovery',
        signing: owner.recovery.signing,
        root: owner.recovery.root,
        identities: [identity.public],
        ring: freshKeyring(login.session.accountId, owner.ring),
        profile: null,
      });
      await devices.commit(login.session, { event, profile: null });
      await assert.rejects(
        communities.operate(
          'post-notifications',
          owner.login.session,
          oldProof,
        ),
        bad(403),
      );
      const directory = await eventHash(event);
      async function recovered(
        operation: string,
        payload: Record<string, unknown>,
      ) {
        const body = { directory, payload };
        return communities.operate(operation, login.session, {
          ...body,
          signature: await sign(
            identity.signing,
            communityBody(
              login.session.accountId,
              login.session.deviceId,
              operation,
              body,
            ),
          ),
        });
      }
      const page = replyNotificationPage(
        await recovered('post-notifications', { after: null }),
      );
      assert.ok(page.items.length);
      assert.equal(
        postState(await recovered('post-state', { id: community, post: root }))
          .own,
        true,
      );
      assert.equal(
        (await db.publicProfiles.read(ownerProfile.handle))?.id,
        ownerProfile.id,
      );
    },
  );
  await t.test(
    'sessão encerrada não lê avisos nem grava interações com prova antiga',
    async () => {
      await account.logout(author.login.sessionToken);
      await assert.rejects(notices(author), bad(401));
      await assert.rejects(
        create(author, crypto.randomUUID(), child),
        bad(401),
      );
    },
  );
});
