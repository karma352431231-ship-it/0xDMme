import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { AccountError } from '../../src/shared/account/index.ts';
import {
  feedPage,
  explorePage,
  postPreference,
} from '../../src/shared/community-discovery/index.ts';
import type {
  FeedFilter,
  PostPreference,
} from '../../src/shared/community-discovery/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import { Database } from '../../src/server/database/index.ts';
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
import { createCommunityAccount } from './community-fixture.ts';

await test('corte 6: feeds públicos, descoberta e referências privadas', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl }),
    origin = 'http://127.0.0.1:45124';
  const account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices);
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
    db.communityDiscovery,
  );
  const accounts: string[] = [],
    addresses: string[] = [],
    ids = [crypto.randomUUID(), crypto.randomUUID()];
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      feed: (filter, after) => communities.feed(filter, after),
      explore: (filter, after) => communities.explore(filter, after),
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
    host.server.listen(45124, '127.0.0.1', resolve);
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
  const owner = await make(),
    reader = await make(),
    stranger = await make();
  const ownerProfile = await owner.publicIdentity(
    `p6_${crypto.randomUUID().slice(0, 8)}`,
  );
  const readerProfile = await reader.publicIdentity(
    `p6_${crypto.randomUUID().slice(0, 8)}`,
  );
  await stranger.publicIdentity(`p6_${crypto.randomUUID().slice(0, 8)}`);
  for (const id of ids)
    await owner.operate('create', {
      id,
      meta: { name: 'Corte 6 sintético', description: '', rules: '' },
    });
  const community = ids[0]!,
    other = ids[1]!,
    posts: string[] = [],
    baseline = {
      scope: 'all',
      order: 'recent',
      period: 'all',
      community,
      tag: null,
    } satisfies FeedFilter;
  async function globalUsage(): Promise<number> {
    return Number(
      (
        await inspector.query<{ bytes: string }>(
          'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
        )
      ).rows[0]!.bytes,
    );
  }
  const bad = (status: number) => (error: unknown) =>
    error instanceof AccountError && error.status === status;
  async function create(
    id: string,
    group = community,
    parent: string | null = null,
  ) {
    return postState(
      await owner.operate(parent ? 'reply-create' : 'post-create', {
        id: group,
        post: id,
        content: { title: '', text: 'Texto público sintético', tag: null },
        ...(parent ? { parent } : {}),
      }),
    );
  }
  const feed = async (
    actor: typeof reader,
    filter: FeedFilter = baseline,
    after: string | null = null,
  ) => feedPage(await actor.operate('discovery-feed', { filter, after }));
  const preference = async (actor: typeof reader, post: string) =>
    postPreference(
      await actor.operate('discovery-preference', { id: community, post }),
    );
  const set = async (
    actor: typeof reader,
    post: string,
    value: PostPreference,
  ) =>
    postPreference(
      await actor.operate('discovery-preference-set', {
        id: community,
        post,
        preference: value,
      }),
    );
  for (let i = 0; i < 27; i++) {
    const id = crypto.randomUUID();
    posts.push(id);
    await create(id);
  }
  await inspector.query(
    'UPDATE hash_talk.community_posts SET created_at=$2 WHERE community_id=$1',
    [community, new Date(Date.now() - 60_000).toISOString()],
  );
  const root = posts[0]!,
    savedReply = crypto.randomUUID(),
    external = crypto.randomUUID();
  await create(savedReply, community, root);
  await create(external, other);

  await t.test(
    'paginação por desempate e filtro vinculado, sem replies no feed geral',
    async () => {
      const anonymousAccount = await make();
      assert.equal((await feed(anonymousAccount)).items.length, 24);
      await assert.rejects(
        feed(anonymousAccount, { ...baseline, scope: 'saved' }),
        bad(403),
      );
      const first = feedPage(await communities.feed(baseline, null));
      assert.equal(first.items.length, 24);
      assert.ok(first.next);
      const second = feedPage(await communities.feed(baseline, first.next));
      assert.equal(second.items.length, 3);
      const all = [...first.items, ...second.items].map((item) => item.post.id);
      assert.equal(new Set(all).size, 27);
      assert.ok(!all.includes(savedReply));
      await assert.rejects(
        communities.feed({ ...baseline, order: 'votes' }, first.next),
        bad(400),
      );
      assert.ok(
        (
          await communities.feed({ ...baseline, community: null }, null)
        ).items.some((entry) => entry.post.id === external),
      );
      await assert.rejects(
        communities.feed({ ...baseline, scope: 'saved' }, null),
        bad(403),
      );
    },
  );
  await t.test(
    'seguir controla o feed próprio, sem controlar participação ou publicar follows',
    async () => {
      assert.equal(
        (await feed(reader, { ...baseline, scope: 'following' })).items.length,
        0,
      );
      await reader.operate('post-vote', {
        id: community,
        post: root,
        position: 1,
        voteRevision: 0,
      });
      await reader.operate('follow', { id: community, following: true });
      await owner.operate('follow', { id: community, following: true });
      assert.equal(
        (await feed(reader, { ...baseline, scope: 'following' })).items.length,
        24,
      );
      assert.equal(
        (await feed(stranger, { ...baseline, scope: 'following' })).items
          .length,
        0,
      );
      const body = JSON.stringify(await communities.feed(baseline, null));
      assert.ok(!body.includes(readerProfile.id));
      assert.ok(!body.includes(reader.wallet.address));
      assert.ok(!body.includes('following'));
    },
  );
  await t.test(
    'ordenação votos/comentários e períodos usam somente estado público',
    async () => {
      assert.equal(
        (await feed(reader, { ...baseline, order: 'votes' })).items[0]?.post.id,
        root,
      );
      assert.equal(
        (await feed(reader, { ...baseline, order: 'replies' })).items[0]?.post
          .id,
        root,
      );
      await inspector.query(
        "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-interval '8 days' WHERE id=$1",
        [posts[1]],
      );
      const first = await feed(reader, { ...baseline, period: 'week' });
      const second = await feed(
        reader,
        { ...baseline, period: 'week' },
        first.next,
      );
      assert.equal(first.items.length + second.items.length, 26);
      const tag = (await communities.tags(community, null)).items[0]!.id;
      const current = postState(
        await owner.operate('post-state', { id: community, post: root }),
      );
      await owner.operate('post-edit', {
        id: community,
        post: root,
        revision: current.post.revision,
        content: { title: '', text: 'Texto público sintético', tag },
      });
      assert.deepEqual(
        (await feed(reader, { ...baseline, tag })).items.map(
          (entry) => entry.post.id,
        ),
        [root],
      );
      assert.throws(
        () =>
          communities.feed(
            { ...baseline, tag: crypto.randomUUID(), community: null },
            null,
          ),
        bad(400),
      );
    },
  );
  await t.test(
    'salvos/ocultos próprios, reversíveis, retries e revisões concorrentes',
    async () => {
      const initial = await preference(reader, root);
      const usage = await globalUsage();
      const saved = await set(reader, root, { ...initial, saved: true });
      assert.equal(saved.revision, 1);
      assert.equal((await globalUsage()) - usage, 256);
      assert.deepEqual(
        await set(reader, root, { ...initial, saved: true }),
        saved,
      );
      assert.equal((await globalUsage()) - usage, 256);
      const competing = await Promise.allSettled([
        set(reader, root, { ...saved, hidden: true }),
        set(reader, root, { ...saved, saved: false }),
      ]);
      assert.equal(
        competing.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      const current = await preference(reader, root);
      const hidden = await set(reader, root, {
        ...current,
        saved: true,
        hidden: true,
      });
      assert.equal(
        (await feed(reader, { ...baseline, scope: 'saved' })).items[0]?.post.id,
        root,
      );
      assert.equal(
        (await feed(reader, { ...baseline, scope: 'hidden' })).items[0]?.post
          .id,
        root,
      );
      assert.ok(
        !(await feed(reader)).items.some((entry) => entry.post.id === root),
      );
      assert.equal((await preference(stranger, root)).revision, 0);
      assert.equal(
        (await feed(stranger, { ...baseline, scope: 'saved' })).items.length,
        0,
      );
      const changed = await set(reader, root, {
        ...hidden,
        hidden: false,
        saved: false,
      });
      await assert.rejects(
        set(reader, root, { ...saved, hidden: true }),
        bad(409),
      );
      assert.equal((await preference(reader, root)).revision, changed.revision);
    },
  );
  await t.test(
    'referências salvas de respostas respeitam marcadores, sem copiar conteúdo ou enviar push',
    async () => {
      await inspector.query(
        'INSERT INTO hash_talk.push_subscriptions(account_id,device_id,endpoint,subscription,charge) VALUES($1,$2,$3,$4,1024)',
        [
          reader.login.session.accountId,
          reader.login.session.deviceId,
          'https://example.invalid/p6/' + crypto.randomUUID(),
          '{}',
        ],
      );
      const count = (
        await inspector.query<{ n: string }>(
          'SELECT coalesce(sum(generation),0) AS n FROM hash_talk.push_subscriptions',
        )
      ).rows[0]!.n;
      await set(reader, savedReply, {
        saved: true,
        hidden: false,
        revision: 0,
      });
      const state = postState(
        await owner.operate('post-state', { id: community, post: savedReply }),
      );
      await owner.operate('post-delete', {
        id: community,
        post: savedReply,
        revision: state.post.revision,
      });
      const saved = await feed(reader, { ...baseline, scope: 'saved' });
      assert.equal(saved.items[0]?.post.id, savedReply);
      assert.equal(saved.items[0]?.post.text, '');
      assert.equal(
        (
          await inspector.query<{ n: string }>(
            'SELECT coalesce(sum(generation),0) AS n FROM hash_talk.push_subscriptions',
          )
        ).rows[0]!.n,
        count,
      );
      await assert.rejects(
        reader.operate('discovery-preference', { id: other, post: root }),
        bad(404),
      );
    },
  );
  await t.test(
    'maiores e atividade são distintas; ocultações pessoais não mudam rankings públicos',
    async () => {
      const size = explorePage(
        await communities.explore({ order: 'size', period: 'week' }, null),
      );
      assert.ok(
        size.items.find((item) => item.community.id === community)?.community
          .followers === 2,
      );
      const activity = explorePage(
        await communities.explore({ order: 'activity', period: 'week' }, null),
      );
      const group = activity.items.find(
        (item) => item.community.id === community,
      );
      assert.equal(group?.activity, 26);
      const current = await preference(reader, root);
      await set(reader, root, { ...current, hidden: true });
      assert.equal(
        explorePage(
          await communities.explore(
            { order: 'activity', period: 'week' },
            null,
          ),
        ).items.find((item) => item.community.id === community)?.activity,
        26,
      );
      const state = postState(
        await owner.operate('post-state', { id: community, post: root }),
      );
      await owner.operate('post-hide', {
        id: community,
        post: root,
        revision: state.post.revision,
        record: crypto.randomUUID(),
        reason: 'Teste sintético',
      });
      assert.ok(
        !(await communities.feed(baseline, null)).items.some(
          (item) => item.post.id === root,
        ),
      );
      assert.equal(
        explorePage(
          await communities.explore(
            { order: 'activity', period: 'week' },
            null,
          ),
        ).items.find((item) => item.community.id === community)?.activity,
        25,
      );
    },
  );
  await t.test(
    'capacidade global rejeita preferência nova sem deixar referência ou cobrança',
    async () => {
      const usage = await globalUsage(),
        limited = new Database(config.databaseUrl, usage + 1);
      try {
        const service = new CommunityService(
          limited.communities,
          limited.devices,
          limited.communityPosts,
          limited.communityDiscovery,
        );
        await assert.rejects(
          service.operate(
            'discovery-preference-set',
            reader.login.session,
            await reader.proof('discovery-preference-set', {
              id: community,
              post: posts[2],
              preference: { saved: true, hidden: false, revision: 0 },
            }),
          ),
          bad(503),
        );
        assert.equal((await preference(reader, posts[2]!)).revision, 0);
        assert.equal(await globalUsage(), usage);
      } finally {
        await limited.close();
      }
    },
  );
  await t.test(
    'exploração pagina comunidades sem atividade/seguidores e mantém desempates',
    async () => {
      const extra = Array.from({ length: 26 }, () => crypto.randomUUID());
      ids.push(...extra);
      await inspector.query(
        "INSERT INTO hash_talk.communities(id,owner,name,description,rules) SELECT id,$2,'Descoberta sem atividade','','' FROM unnest($1::uuid[]) AS id",
        [extra, ownerProfile.id],
      );
      for (const order of ['size', 'activity']) {
        let after: string | null = null;
        const seen = new Set<string>();
        for (let page = 0; page < 5; page++) {
          const result = explorePage(
            await communities.explore({ order, period: 'week' }, after),
          );
          for (const entry of result.items) {
            assert.ok(!seen.has(entry.community.id));
            seen.add(entry.community.id);
          }
          after = result.next;
          if (!after) break;
        }
        assert.equal(after, null);
        assert.ok(extra.every((id) => seen.has(id)));
      }
    },
  );
  await t.test(
    'HTTP público valida filtros e não admite listas privadas; sessão encerrada barra preferências',
    async () => {
      const result = await fetch(
        `${origin}/api/communities/feed?community=${community}`,
      );
      assert.equal(result.status, 200);
      feedPage(await result.json());
      for (const query of [
        'scope=saved',
        'accountId=private',
        'order=recent&order=votes',
        'period=invalid',
        'tag=' + crypto.randomUUID(),
      ])
        assert.equal(
          (await fetch(`${origin}/api/communities/feed?${query}`)).status,
          400,
        );
      assert.equal(
        (
          await fetch(
            `${origin}/api/communities/explore?order=activity&period=week`,
          )
        ).status,
        200,
      );
      assert.equal(
        (await fetch(`${origin}/api/communities/feed`, { method: 'POST' }))
          .status,
        405,
      );
      await inspector.query(
        'DELETE FROM hash_talk.login_sessions WHERE account_id=$1',
        [reader.login.session.accountId],
      );
      await assert.rejects(preference(reader, root), bad(401));
    },
  );
  await t.test(
    'exclusão sintética elimina preferências/follows; @ reutilizado não herda referências',
    async () => {
      for (const table of [
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE account_id=$1`,
          [reader.login.session.accountId],
        );
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        reader.login.session.accountId,
      ]);
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.community_post_preferences WHERE profile_id=$1',
            [readerProfile.id],
          )
        ).rowCount,
        0,
      );
      const replacement = await make(),
        profile = await replacement.publicIdentity(readerProfile.handle);
      assert.notEqual(profile.id, readerProfile.id);
      assert.equal((await preference(replacement, root)).revision, 0);
      assert.equal(
        (await feed(replacement, { ...baseline, scope: 'saved' })).items.length,
        0,
      );
      assert.equal(
        (await feed(replacement, { ...baseline, scope: 'following' })).items
          .length,
        0,
      );
    },
  );
});
