import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import { communityState } from '../../src/shared/communities/index.ts';
import {
  postState,
  replyNotificationPage,
} from '../../src/shared/community-posts/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import {
  profileFollow,
  profileNotifications,
  publicBlockState,
} from '../../src/shared/profile-social/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createCommunityAccount,
  rootPostContent,
} from './community-fixture.ts';

await test('social controls: authority, badges, confirmation, editing, blocking, notification bell and reports', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45128',
    }),
    devices = new DeviceService(db.devices);
  const profiles = new PublicProfileService(
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
    ids: string[] = [];
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
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
    author = await make(),
    reader = await make();
  const ownerId = await owner.publicIdentity(
      's_' + crypto.randomUUID().slice(0, 8),
    ),
    authorId = await author.publicIdentity(
      's_' + crypto.randomUUID().slice(0, 8),
    ),
    readerId = await reader.publicIdentity(
      's_' + crypto.randomUUID().slice(0, 8),
    );
  const id = crypto.randomUUID();
  ids.push(id);
  const meta = {
    name: 'Comunidade sintética',
    description: 'Test',
    rules: 'Rules',
  };
  const state = () => owner.operate('state', { id }).then(communityState);
  const publicAction = async (
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
  const bad = (code: number) => (error: unknown) =>
    error instanceof AccountError && error.status === code;
  const create = async (actor: typeof owner, text: string, parent?: string) => {
    const post = crypto.randomUUID();
    const result = await actor.operate(
      parent ? 'reply-create' : 'post-create',
      {
        id,
        post,
        content: parent
          ? { title: '', text, tags: [] }
          : await rootPostContent(
              communities,
              id,
              text,
              'Publicação sintética',
            ),
        ...(parent ? { parent } : {}),
      },
    );
    return postState(result).post;
  };
  const created = communityState(
    await owner.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id,
      meta,
    }),
  );
  assert.equal(created.community.followers, 1);
  assert.equal(created.following, true);
  await assert.rejects(
    owner.operate('follow', { id, following: false }),
    bad(403),
  );
  const root = await create(owner, 'Original'),
    reply = await create(author, 'Reply', root.id);
  await t.test(
    'current roles, two-day badge and manual assignments without powers',
    async () => {
      assert.equal(root.authorBadges?.[0]?.kind, 'owner');
      await author.operate('follow', { id, following: true });
      assert.equal(
        (await communities.post(id, reply.id)).authorBadges?.[0]?.kind,
        'new',
      );
      await inspector.query(
        "UPDATE hash_talk.community_follows SET joined_at=clock_timestamp()-interval '2 days' WHERE community_id=$1 AND profile_id=$2",
        [id, authorId.id],
      );
      assert.deepEqual((await communities.post(id, reply.id)).authorBadges, []);
      await owner.operate('role', {
        id,
        revision: (await state()).community.revision,
        target: authorId.id,
        moderator: true,
      });
      assert.equal(
        (await communities.post(id, reply.id)).authorBadges?.[0]?.kind,
        'moderator',
      );
      const badge = crypto.randomUUID();
      await author.operate('badge-create', {
        id,
        badge,
        label: 'Contribuidor',
      });
      await author.operate('badge-assign', {
        id,
        badge,
        target: readerId.id,
        enabled: true,
      });
      await assert.rejects(
        author.operate('badge-delete', { id, badge, revision: 1 }),
        bad(409),
      );
      await author.operate('badge-assign', {
        id,
        badge,
        target: readerId.id,
        enabled: true,
      });
      const contribution = await create(reader, 'Minha contribuição');
      assert.equal(contribution.authorBadges?.[0]?.kind, 'custom');
      await assert.rejects(
        reader.operate('badge-create', {
          id,
          badge: crypto.randomUUID(),
          label: 'Owner',
        }),
        bad(403),
      );
      await assert.rejects(
        reader.operate('badge-assign', {
          id,
          badge,
          target: readerId.id,
          enabled: false,
        }),
        bad(403),
      );
      await author.operate('badge-assign', {
        id,
        badge,
        target: readerId.id,
        enabled: false,
      });
      assert.deepEqual(
        (await communities.post(id, contribution.id)).authorBadges,
        [],
      );
    },
  );
  await t.test(
    'atomic confirmation and restricted banner until analysis',
    async () => {
      const png = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      const photo = { type: 'image/png', bytes: encode(png) };
      const revision = (await state()).community.revision;
      await assert.rejects(
        owner.operate('presentation', {
          id,
          revision,
          meta: { ...meta, name: 'Inválido' },
          photo,
          banner: { type: 'image/png', bytes: encode(new Uint8Array([0])) },
        }),
        bad(400),
      );
      assert.equal((await state()).community.name, meta.name);
      await owner.operate('presentation', {
        id,
        revision,
        meta: { ...meta, name: 'Confirmado' },
        photo,
        banner: photo,
      });
      const presentation = await state();
      assert.equal(presentation.community.name, 'Confirmado');
      assert.deepEqual(presentation.pendingBanner?.bytes, png);
      assert.equal((await communities.read(id)).banner, null);
      await assert.rejects(
        reader.operate('presentation', {
          id,
          revision: presentation.community.revision,
          meta,
          photo: null,
          banner: null,
        }),
        bad(403),
      );
    },
  );
  await t.test(
    'editing replaces text and expires after the first hour',
    async () => {
      const edit = postState(
        await owner.operate('post-edit', {
          id,
          post: root.id,
          revision: root.revision,
          content: {
            title: 'Publicação editada',
            text: 'Substituto',
            tags: root.tags.map((tag) => tag.id),
          },
        }),
      );
      assert.equal(edit.post.text, 'Substituto');
      assert.ok(edit.post.editedAt);
      await inspector.query(
        "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
        [root.id],
      );
      assert.equal(
        postState(await owner.operate('post-state', { id, post: root.id }))
          .canEdit,
        false,
      );
      await assert.rejects(
        owner.operate('post-edit', {
          id,
          post: root.id,
          revision: edit.post.revision,
          content: {
            title: 'Publicação editada',
            text: 'Tarde',
            tags: root.tags.map((tag) => tag.id),
          },
        }),
        bad(403),
      );
      assert.equal((await communities.post(id, root.id)).text, 'Substituto');
    },
  );
  await t.test(
    'opt-in notification bell, reading, blocking and stored-only reports',
    async () => {
      const target = authorId.id;
      await publicAction(reader, 'follow', {
        target,
        following: true,
        revision: 0,
      });
      assert.equal(
        profileNotifications(
          await publicAction(reader, 'notification-state', { target }),
        ).enabled,
        false,
      );
      await create(author, 'Sem aviso');
      const notices = () =>
        reader
          .operate('post-notifications', { after: null })
          .then(replyNotificationPage);
      assert.equal((await notices()).items.length, 0);
      await publicAction(reader, 'notification-set', {
        target,
        enabled: true,
        revision: 0,
      });
      const pushAuthority = {
        session: reader.login.session,
        directory: reader.directory,
      };
      await db.daily.subscribe(pushAuthority, {
        endpoint:
          'https://fcm.googleapis.com/fcm/send/synthetic-social-preview',
        keys: { p256dh: 'synthetic', auth: 'synthetic' },
      });
      const watched = await create(author, 'Com sininho'),
        watchedReply = await create(author, 'Reply com sininho', root.id);
      const alerts = await notices();
      assert.equal(
        await db.daily.check(pushAuthority),
        false,
        'Public posts and replies are in-app only',
      );
      await assertPrivatePushEligibility(db, inspector, {
        sender: author.login.session.accountId,
        recipient: reader.login.session.accountId,
        authority: pushAuthority,
      });
      const queued = await inspector.query<{ pending: boolean }>(
        'SELECT pending FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2',
        [reader.login.session.accountId, reader.login.session.deviceId],
      );
      assert.equal(queued.rows[0]?.pending, false);
      await db.daily.configurePush(pushAuthority, {
        messages: false,
        calls: true,
        showCalls: false,
      });
      assert.equal(await db.daily.check(pushAuthority), false);
      await db.daily.configurePush(pushAuthority, {
        messages: true,
        calls: true,
        showCalls: false,
      });
      assert.equal(
        alerts.items.find((item) => item.reply === watched.id)?.kind,
        'post',
      );
      assert.equal(
        alerts.items.find((item) => item.reply === watchedReply.id)?.kind,
        'reply',
      );
      assert.deepEqual(
        new Set(alerts.items.map((item) => item.reply)),
        new Set([watched.id, watchedReply.id]),
      );
      await reader.operate('post-notifications-read', {
        replies: [watched.id],
      });
      assert.equal(
        (await notices()).items.find((item) => item.reply === watched.id)?.read,
        true,
      );
      assert.equal(
        (await notices()).items.find((item) => item.reply === watchedReply.id)
          ?.read,
        false,
      );
      const block = publicBlockState(
        await publicAction(reader, 'block-state', { target }),
      );
      await publicAction(reader, 'block', {
        target,
        blocked: true,
        revision: block.revision,
      });
      assert.equal((await notices()).items.length, 0);
      assert.equal(await db.daily.check(pushAuthority), false);
      await assert.rejects(
        reader.operate('post-public', { id, post: watched.id }),
        bad(404),
      );
      const feed = await db.communityDiscovery.operate(
        'discovery-feed',
        { session: reader.login.session, directory: reader.directory },
        {
          filter: {
            scope: 'all',
            order: 'recent',
            period: 'all',
            community: id,
            tag: null,
          },
          after: null,
        },
      );
      assert.ok(feed && typeof feed === 'object' && 'items' in feed);
      const items = (
        feed as { items: { post: { author: { id: string } | null } }[] }
      ).items;
      assert.ok(items.every((entry) => entry.post.author?.id !== target));
      const authority = {
        session: reader.login.session,
        directory: reader.directory,
      };
      await assert.rejects(db.socialDm.request(authority, target), bad(403));
      const report = crypto.randomUUID(),
        payload = {
          record: report,
          kind: 'post',
          target: watched.id,
          reason: 'Conteúdo denunciado',
        };
      await reader.operate('public-report', payload);
      await reader.operate('public-report', payload);
      await reader.operate('public-report', {
        ...payload,
        record: crypto.randomUUID(),
      });
      await publicAction(reader, 'public-report', {
        record: crypto.randomUUID(),
        kind: 'profile',
        target,
        reason: 'Perfil denunciado',
      });
      const reports = await inspector.query<{ count: string }>(
        'SELECT count(*) FROM hash_talk.public_reports WHERE reporter=$1',
        [readerId.id],
      );
      assert.equal(reports.rows[0]!.count, '3');
      assert.equal((await communities.post(id, watched.id)).status, 'visible');
      const following = profileFollow(
        await publicAction(reader, 'follow', {
          target,
          following: false,
          revision: 1,
        }),
      );
      assert.equal(following.following, false);
      assert.equal(
        profileNotifications(
          await publicAction(reader, 'notification-state', { target }),
        ).enabled,
        false,
      );
      assert.equal(
        ownerId.id,
        (await communities.post(id, root.id)).author?.id,
      );
    },
  );
});

/** Synthetic transport rows isolate classification; no real E2EE content is inserted. */
async function assertPrivatePushEligibility(
  db: Database,
  inspector: pg.Client,
  input: {
    sender: string;
    recipient: string;
    authority: Parameters<Database['daily']['check']>[0];
  },
): Promise<void> {
  const id = crypto.randomUUID();
  await inspector.query(
    "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
    [input.sender, input.recipient],
  );
  try {
    await inspector.query(
      'INSERT INTO hash_talk.message_packets(id,sender,recipient,sender_revision,recipient_revision,hash,body,charge,sender_charge,recipient_charge) VALUES($1,$2,$3,1,1,$4,$5::jsonb,0,0,0)',
      [
        id,
        input.sender,
        input.recipient,
        'a'.repeat(64),
        JSON.stringify({ synthetic: true }),
      ],
    );
    assert.equal(await db.daily.check(input.authority), true);
    await inspector.query(
      'INSERT INTO hash_talk.conversation_controls(account_id,peer,muted_until) VALUES($1,$2,$3)',
      [input.recipient, input.sender, Date.now() + 60000],
    );
    assert.equal(
      await db.daily.check(input.authority),
      false,
      'Muted private messages cannot authorize push because public activity is unread',
    );
  } finally {
    await inspector.query('DELETE FROM hash_talk.message_packets WHERE id=$1', [
      id,
    ]);
    await inspector.query(
      'DELETE FROM hash_talk.conversation_controls WHERE account_id=$1 AND peer=$2',
      [input.recipient, input.sender],
    );
    await inspector.query(
      'DELETE FROM hash_talk.contact_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
      [input.sender, input.recipient],
    );
  }
}
