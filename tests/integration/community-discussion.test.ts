import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';
import { AccountError } from '../../src/shared/account/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import { feedPage } from '../../src/shared/community-discovery/index.ts';
import { discussionPage } from '../../src/shared/community-discussion/index.ts';
import type { DiscussionOrder } from '../../src/shared/community-discussion/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { Database } from '../../src/server/database/index.ts';
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

await test('feed e discussão: elegibilidade, representantes, diversidade e árvore pública', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo necessário.');
  const db = new Database(config.databaseUrl),
    sql = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45145',
    account = new AccountService({ store: db.authentication, origin }),
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
    community = crypto.randomUUID();
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      replies: (id, parent, after) => communities.replies(id, parent, after),
      discussion: (id, parent, selection) =>
        communities.discussion(id, parent, selection),
    }),
  });
  await db.migrate();
  await sql.connect();
  t.after(async () => {
    if (host.server.listening) await host.close();
    await sql.query('DELETE FROM hash_talk.communities WHERE id=$1', [
      community,
    ]);
    for (const table of [
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await sql.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [accounts],
      );
    await sql.query('DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])', [
      accounts,
    ]);
    await sql.query(
      'DELETE FROM hash_talk.login_challenges WHERE address=ANY($1::text[])',
      [addresses],
    );
    await sql.end();
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
  const people = await Promise.all(Array.from({ length: 8 }, () => make()));
  const identities = await Promise.all(
    people.map((person) =>
      person.publicIdentity(`thread_${crypto.randomUUID().slice(0, 8)}`),
    ),
  );
  const owner = people[0]!,
    followed = people[1]!,
    stranger = people[2]!,
    reader = people[7]!;
  await owner.operate('create', {
    classification: { nsfw: false, topics: ['meme'] },
    id: community,
    meta: { name: 'Discussão sintética', description: '', rules: '' },
  });
  const defaultTag = (await db.communityPosts.tags(community, null)).items[0]!
    .id;
  const create = async (
    who: typeof owner,
    parent: string | null = null,
    id: string = crypto.randomUUID(),
  ) => {
    await who.operate(parent ? 'reply-create' : 'post-create', {
      id: community,
      post: id,
      content: {
        title: parent ? '' : 'Título sintético',
        text: 'Texto público sintético',
        tags: parent ? [] : [defaultTag],
      },
      ...(parent ? { parent } : {}),
    });
    return id;
  };
  const follow = async (target: string) => {
    const operation = 'follow',
      proof = {
        directory: reader.directory,
        payload: { target, following: true, revision: 0 },
      };
    await profiles.operate(operation, reader.login.session, {
      ...proof,
      signature: await sign(
        reader.identity.signing,
        publicProfileBody(
          reader.login.session.accountId,
          reader.login.session.deviceId,
          operation,
          proof,
        ),
      ),
    });
  };
  const stats = async (id: string) =>
    (
      await sql.query<{ participants: number; activity: string }>(
        'SELECT discussion_participants AS participants,discussion_activity::text AS activity FROM hash_talk.community_posts WHERE id=$1',
        [id],
      )
    ).rows[0]!;
  const replies = async (
    parent: string,
    order: DiscussionOrder = 'discussed',
    after: string | null = null,
  ) =>
    discussionPage(
      await communities.discussion(community, parent, { order, after }),
    );
  const feed = async (scope = 'all', order = 'mixed') =>
    feedPage(
      await reader.operate('discovery-feed', {
        filter: { scope, order, period: 'all', community: null, tag: null },
        after: null,
      }),
    );
  const remove = async (who: typeof owner, post: string) => {
    const state = postState(
      await who.operate('post-state', { id: community, post }),
    );
    await who.operate('post-delete', {
      id: community,
      post,
      revision: state.post.revision,
    });
  };
  const upvotes = async (posts: string[]) => {
    for (const who of people.slice(0, 5))
      for (const post of posts)
        await who.operate('post-vote', {
          id: community,
          post,
          position: 1,
          voteRevision: 0,
        });
  };
  const root = await create(owner),
    low = await create(followed, root),
    popular = await create(stranger, root),
    repeated = await create(followed, root);
  const nested = await create(owner, popular);
  await t.test(
    'descendentes distintos vencem mensagens repetidas; próprio autor não acrescenta atividade',
    async () => {
      await create(stranger, popular);
      for (let i = 0; i < 6; i++) await create(owner, repeated);
      await create(people[3]!, nested);
      await create(people[4]!, nested);
      assert.deepEqual(await stats(popular), {
        participants: 3,
        activity: '15',
      });
      assert.deepEqual(await stats(repeated), {
        participants: 1,
        activity: '6',
      });
      assert.equal((await replies(root)).items[0]?.id, popular);
      assert.equal((await replies(popular, 'oldest')).items[0]?.id, nested);
    },
  );
  await t.test(
    'leitura assinada dos ramos conserva votos privados sem expor o leitor publicamente',
    async () => {
      await reader.operate('post-vote', {
        id: community,
        post: popular,
        position: 1,
        voteRevision: 0,
      });
      const signed = discussionPage(
        await reader.operate('post-replies', {
          id: community,
          post: root,
          order: 'votes',
          after: null,
        }),
      );
      assert.equal(signed.items[0]?.id, popular);
      assert.equal(signed.items[0]?.viewer?.vote, 1);
      assert.equal((await replies(root, 'votes')).items[0]?.viewer, undefined);
      await reader.operate('post-vote', {
        id: community,
        post: popular,
        position: 0,
        voteRevision: 1,
      });
    },
  );
  await follow(identities[1]!.id);
  await follow(identities[2]!.id);
  await t.test(
    'Destaques exige votos/participantes, com ou sem follow, e Seguindo preserva original + reply mais antigo',
    async () => {
      const general = await feed();
      assert.ok(general.items.some((item) => item.post.id === popular));
      for (const id of [low, repeated])
        assert.ok(!general.items.some((item) => item.post.id === id));
      await reader.operate('follow', { id: community, following: true });
      const following = await feed('following', 'recent');
      assert.ok(following.items.some((item) => item.post.id === root));
      assert.deepEqual(
        following.items
          .filter((item) => item.post.root === root)
          .map((item) => item.post.id),
        [low],
      );
    },
  );
  await t.test(
    'limiar de cinco votos é líquido e representante é único por original/autor em toda a paginação',
    async () => {
      await upvotes([low, repeated]);
      await people[5]!.operate('post-vote', {
        id: community,
        post: low,
        position: -1,
        voteRevision: 0,
      });
      let page = await feed();
      assert.ok(!page.items.some((item) => item.post.id === low));
      assert.ok(page.items.some((item) => item.post.id === repeated));
      await people[5]!.operate('post-vote', {
        id: community,
        post: low,
        position: 0,
        voteRevision: 1,
      });
      assert.equal((await replies(root, 'votes')).items[0]?.score, 5);
      // Same score/activity/date: followed-author bonus deterministically wins.
      const other = await create(stranger, root);
      for (const who of people.slice(0, 5))
        await who.operate('post-vote', {
          id: community,
          post: other,
          position: 1,
          voteRevision: 0,
        });
      await sql.query(
        'UPDATE hash_talk.community_posts SET created_at=$2 WHERE id=ANY($1::uuid[])',
        [[low, other], '2026-10-10T12:00:00.000Z'],
      );
      // Stranger stays eligible after removing its follow; membership alone is insufficient for replies.
      await sql.query(
        'UPDATE hash_talk.public_profile_follows SET following=false WHERE follower=$1 AND target=$2',
        [identities[7]!.id, identities[2]!.id],
      );
      const sample = await feed();
      assert.ok(sample.items.some((item) => item.post.id === popular));
      const bonusRoot = await create(owner, null, identities[1]!.id),
        a = await create(followed, bonusRoot),
        b = await create(stranger, bonusRoot);
      await upvotes([a, b]);
      await sql.query(
        'UPDATE hash_talk.community_posts SET created_at=$2 WHERE id=ANY($1::uuid[])',
        [[a, b], '2026-10-10T14:00:00.000Z'],
      );
      const priority = (await feed()).items.map((item) => item.post.id);
      assert.ok(priority.includes(bonusRoot));
      assert.ok(priority.includes(a) && priority.includes(b));
      assert.ok(priority.indexOf(a) < priority.indexOf(b));
      const publicPage = await communities.feed(
        {
          scope: 'all',
          order: 'mixed',
          period: 'all',
          community: null,
          tag: null,
        },
        null,
      );
      assert.ok(publicPage.items.some((item) => item.post.id === popular));
      for (let i = 0; i < 25; i++) await create(owner);
      page = await feed();
      const all = [...page.items];
      while (page.next) {
        page = feedPage(
          await reader.operate('discovery-feed', {
            filter: {
              scope: 'all',
              order: 'mixed',
              period: 'all',
              community: null,
              tag: null,
            },
            after: page.next,
          }),
        );
        all.push(...page.items);
      }
      const selected = all.filter(
        (item) =>
          item.post.root === root && item.post.author?.id === identities[1]!.id,
      );
      assert.equal(selected.length, 1);
      assert.equal(selected[0]?.post.id, repeated);
      assert.equal(new Set(all.map((item) => item.post.id)).size, all.length);
    },
  );
  await t.test(
    'cursores paginam datas empatadas sem repetir e ficam vinculados ao pai/ordem; HTTP valida entrada',
    async () => {
      const parent = await create(owner),
        ids: string[] = [];
      for (let i = 0; i < 26; i++) ids.push(await create(stranger, parent));
      await sql.query(
        'UPDATE hash_talk.community_posts SET created_at=$2 WHERE id=ANY($1::uuid[])',
        [ids, '2026-10-10T13:00:00.000Z'],
      );
      for (const order of ['oldest', 'recent', 'discussed', 'votes'] as const) {
        const first = await replies(parent, order),
          second = await replies(parent, order, first.next);
        assert.equal(first.items.length, 24);
        assert.equal(second.items.length, 2);
        assert.equal(
          new Set([...first.items, ...second.items].map((item) => item.id))
            .size,
          26,
        );
        await assert.rejects(replies(root, order, first.next), AccountError);
        await assert.rejects(
          replies(parent, order === 'votes' ? 'oldest' : 'votes', first.next),
          AccountError,
        );
      }
      await new Promise<void>((resolve, reject) => {
        host.server.once('error', reject);
        host.server.listen(45145, '127.0.0.1', resolve);
      });
      const url = `${origin}/api/communities/${community}/posts/${parent}/replies`;
      assert.equal((await fetch(url + '?order=wallet')).status, 400);
      assert.equal((await fetch(url + '?order=votes&private=yes')).status, 400);
      const response = await fetch(url + '?order=oldest');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const page = discussionPage(await response.json());
      assert.equal(page.items.length, 24);
      assert.ok(!JSON.stringify(page).includes(reader.wallet.address));
    },
  );
  await t.test(
    'excluir/ocultar/restaurar muda engajamento sem apagar descendentes; retries não duplicam',
    async () => {
      const before = await stats(popular),
        child = (await replies(nested, 'oldest')).items[0]!;
      await remove(people[3]!, child.id);
      assert.equal(
        (await stats(popular)).participants,
        before.participants - 1,
      );
      assert.ok(!(await feed()).items.some((item) => item.post.id === popular));
      const record = crypto.randomUUID(),
        state = postState(
          await owner.operate('post-state', { id: community, post: nested }),
        );
      await owner.operate('post-hide', {
        id: community,
        post: nested,
        revision: state.post.revision,
        record,
        reason: 'Teste',
      });
      assert.equal((await stats(popular)).participants, 1);
      const marker = (await replies(popular, 'oldest')).items[0]!;
      assert.equal(marker.status, 'removed');
      assert.equal(marker.text, '');
      assert.equal((await replies(nested)).items.length, 2);
      await owner.operate('post-decide', {
        id: community,
        post: nested,
        revision: marker.revision,
        record,
        decision: 'Restaurar',
        restore: true,
      });
      assert.equal((await stats(popular)).participants, 2);
      const retry = crypto.randomUUID(),
        payload = {
          id: community,
          post: retry,
          parent: popular,
          content: { title: '', text: 'Retry sintético', tags: [] },
        };
      await Promise.all([
        people[6]!.operate('reply-create', payload),
        people[6]!.operate('reply-create', payload),
      ]);
      assert.equal((await stats(popular)).participants, 3);
      assert.ok((await feed()).items.some((item) => item.post.id === popular));
    },
  );
  await t.test(
    'backfill recompõe dados existentes e cobrança incremental é liberada ao excluir conta',
    async () => {
      const before = await stats(popular);
      await sql.query('BEGIN');
      try {
        await sql.query(
          'DELETE FROM hash_talk.community_discussion_participants',
        );
        // Rollback-only replay: remove later ranking dependencies before
        // recreating the historical discussion columns. Rollback restores them.
        await sql.query(
          'DROP TRIGGER profile_ranking_post_changed ON hash_talk.community_posts; DROP TRIGGER comment_received ON hash_talk.community_posts',
        );
        await sql.query(
          'DROP TRIGGER community_ranking_discussion_visibility ON hash_talk.community_posts; DROP INDEX hash_talk.community_discussion_media_refs; DROP TABLE hash_talk.community_discussion_participants CASCADE; DROP FUNCTION hash_talk.prepare_discussion_visibility() CASCADE; DROP FUNCTION hash_talk.refresh_discussion_visibility() CASCADE; DROP FUNCTION hash_talk.discussion_media_blocked(uuid[]); DROP FUNCTION hash_talk.track_discussion_post() CASCADE; DROP FUNCTION hash_talk.adjust_discussion_contribution(uuid,uuid,integer); DROP FUNCTION hash_talk.track_discussion_participant(); ALTER TABLE hash_talk.community_posts DROP COLUMN discussion_participants, DROP COLUMN discussion_activity, DROP COLUMN discussion_blocked; DROP INDEX hash_talk.community_reply_first; DROP INDEX hash_talk.community_reply_votes',
        );
        // This rollback-only historical rehearsal also needs its original
        // accounting dependency, retired from the live catalog by migration 076.
        const legacy = await readFile(
          new URL(
            '../../src/server/database/migrations/013-messages.sql',
            import.meta.url,
          ),
          'utf8',
        );
        const accounting = legacy.match(
          /CREATE FUNCTION hash_talk\.track_message_usage\(\)[\s\S]*?\$\$;/u,
        )?.[0];
        assert.ok(
          accounting,
          'Historical global accounting definition required.',
        );
        await sql.query(accounting);
        await sql.query(
          await readFile(
            new URL(
              '../../src/server/database/migrations/062-discussion-engagement.sql',
              import.meta.url,
            ),
            'utf8',
          ),
        );
        assert.deepEqual(await stats(popular), before);
      } finally {
        await sql.query('ROLLBACK');
      }
      const profile = identities[6]!.id;
      await sql.query('BEGIN');
      try {
        const beforeUsage = await sql.query<{ bytes: string }>(
          'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
        );
        const removed = await sql.query(
          'DELETE FROM hash_talk.community_discussion_participants WHERE profile_id=$1 RETURNING post_id',
          [profile],
        );
        const afterUsage = await sql.query<{ bytes: string }>(
          'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
        );
        assert.equal(
          Number(beforeUsage.rows[0]!.bytes) -
            Number(afterUsage.rows[0]!.bytes),
          removed.rows.length * 256,
        );
      } finally {
        await sql.query('ROLLBACK');
      }

      for (const table of [
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await sql.query(`DELETE FROM hash_talk.${table} WHERE account_id=$1`, [
          people[6]!.login.session.accountId,
        ]);
      await sql.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        people[6]!.login.session.accountId,
      ]);
      assert.equal((await stats(popular)).participants, 2);
      assert.equal(
        (
          await sql.query<{ count: string }>(
            'SELECT count(*) FROM hash_talk.community_discussion_participants WHERE profile_id=$1',
            [profile],
          )
        ).rows[0]!.count,
        '0',
      );
      assert.equal(
        (await replies(popular, 'oldest')).items.at(-1)?.author,
        null,
      );
    },
  );
});
