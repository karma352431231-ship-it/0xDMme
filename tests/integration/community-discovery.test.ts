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
import {
  createCommunityAccount,
  rootPostContent,
} from './community-fixture.ts';

await test('cut 6: public feeds, discovery and private references', async (t) => {
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
      classification: { nsfw: false, topics: ['meme'] },
      id,
      meta: { name: `Corte 6 sintético ${id}`, description: '', rules: '' },
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
  async function ranked(filter: unknown, after: string | null) {
    let next = await db.communityRanking.process();
    while (next !== null && next <= Date.now())
      next = await db.communityRanking.process();
    return communities.explore(filter, after);
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
        content: parent
          ? { title: '', text: 'Texto público sintético', tags: [] }
          : await rootPostContent(
              communities,
              group,
              'Texto público sintético',
            ),
        ...(parent ? { parent } : {}),
      }),
    );
  }
  const feed = async (
    actor: typeof reader,
    filter: FeedFilter = baseline,
    after: string | null = null,
  ) => feedPage(await actor.operate('discovery-feed', { filter, after }));
  async function fixtureRoot(actor: typeof reader | null) {
    const read = (after: string | null) =>
      actor
        ? feed(actor, baseline, after)
        : communities.feed(baseline, after).then(feedPage);
    const first = await read(null);
    const pages = first.next ? [first, await read(first.next)] : [first];
    const entry = pages
      .flatMap((page) => page.items)
      .find((item) => item.post.id === root);
    assert.ok(
      entry,
      'The fixture root must be present in the loaded feed pages.',
    );
    return entry;
  }
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
  // Equal timestamps sort by UUID; put the target on the second recent page.
  posts.sort();
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
    'signed feed and followers coexist with authorized readers and cannot write',
    async () => {
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
        );
        await inspector.query(
          'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR SHARE',
          [reader.login.session.accountId],
        );
        const [page] = await Promise.all([
          feed(reader),
          reader.operate('followers-page', {
            id: community,
            tab: 'all',
            after: null,
          }),
        ]);
        assert.equal(page.items.length, 24);
        await assert.rejects(
          db.communities.withReader(
            { session: reader.login.session, directory: reader.directory },
            ({ client }) =>
              client.query(
                'UPDATE hash_talk.accounts SET display_name=display_name WHERE id=$1',
                [reader.login.session.accountId],
              ),
          ),
          (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === '25006',
        );
      } finally {
        await inspector.query('ROLLBACK');
      }
    },
  );
  await t.test(
    'feed waiting for admission rechecks a session ended before it acquires authority',
    async () => {
      const temporary = await make();
      await inspector.query('BEGIN');
      let waiting: ReturnType<typeof feed> | null = null;
      try {
        await inspector.query(
          "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))",
        );
        waiting = feed(temporary);
        const rejected = assert.rejects(waiting, bad(401));
        const until = Date.now() + 500;
        while (
          !(
            await inspector.query(
              "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted",
            )
          ).rowCount
        ) {
          assert.ok(
            Date.now() < until,
            'reader must wait on the held admission gate',
          );
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
        }
        await inspector.query(
          'DELETE FROM hash_talk.login_sessions WHERE account_id=$1',
          [temporary.login.session.accountId],
        );
        await inspector.query('COMMIT');
        await rejected;
      } finally {
        await inspector.query('ROLLBACK');
        await waiting?.catch(() => {});
      }
    },
  );

  await t.test(
    'tie-break pagination and bound filter exclude replies from the general feed',
    async () => {
      const anonymousAccount = await make();
      assert.equal((await feed(anonymousAccount)).items.length, 24);
      await assert.rejects(
        feed(anonymousAccount, { ...baseline, scope: 'saved' }),
        bad(403),
      );
      const first = feedPage(await communities.feed(baseline, null));
      assert.equal(first.items.length, 24);
      assert.ok(!first.items.some((entry) => entry.post.id === root));
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
      const personal = await feed(reader);
      assert.ok(personal.next);
      await assert.rejects(feed(stranger, baseline, personal.next), bad(400));
      await assert.rejects(communities.feed(baseline, personal.next), bad(400));
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
    'following controls the personal feed without controlling participation or publishing follows',
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
    'vote/comment ordering and periods use only public state',
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
      // Fixture posts carry the first tag; only this post gets the second.
      const tag = (await communities.tags(community, null)).items[1]!.id;
      const current = postState(
        await owner.operate('post-state', { id: community, post: root }),
      );
      await owner.operate('post-edit', {
        id: community,
        post: root,
        revision: current.post.revision,
        content: {
          title: 'Post sintético',
          text: 'Texto público sintético',
          tags: [tag],
        },
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
    'own saved and hidden entries are reversible with retries and concurrent revisions',
    async () => {
      const initial = await preference(reader, root);
      const usage = await globalUsage();
      const saved = await set(reader, root, { ...initial, saved: true });
      assert.equal(saved.revision, 1);
      assert.equal((await fixtureRoot(reader)).viewerSaved, true);
      assert.equal((await fixtureRoot(stranger)).viewerSaved, false);
      assert.equal((await fixtureRoot(null)).viewerSaved, undefined);
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
      assert.equal((await fixtureRoot(reader)).viewerSaved, false);
    },
  );
  await t.test(
    'saved reply references respect markers without copying content or sending push',
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
    'largest and activity are distinct; personal hiding cannot alter public rankings',
    async () => {
      const size = explorePage(
        await ranked({ order: 'size', period: 'week' }, null),
      );
      assert.ok(
        size.items.find((item) => item.community.id === community)?.community
          .followers === 2,
      );
      const activity = explorePage(
        await ranked({ order: 'activity', period: 'week' }, null),
      );
      const group = activity.items.find(
        (item) => item.community.id === community,
      );
      assert.equal(group?.activity, 26);
      const current = await preference(reader, root);
      await set(reader, root, { ...current, hidden: true });
      assert.equal(
        explorePage(
          await ranked({ order: 'activity', period: 'week' }, null),
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
          await ranked({ order: 'activity', period: 'week' }, null),
        ).items.find((item) => item.community.id === community)?.activity,
        25,
      );
    },
  );
  await t.test(
    'global capacity rejects a new preference without retaining a reference or charge',
    async () => {
      const usage = await globalUsage(),
        limited = new Database(config.databaseUrl, usage + 1);
      try {
        const service = new CommunityService(
          limited.communities,
          limited.devices,
          limited.communityPosts,
          { discovery: limited.communityDiscovery },
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
    'Largest paginates communities without activity; Trending excludes candidates without signals',
    async () => {
      const extra = Array.from({ length: 26 }, () => crypto.randomUUID());
      ids.push(...extra);
      await inspector.query(
        "INSERT INTO hash_talk.communities(id,owner,name,description,rules) SELECT id,$2,'Descoberta sem atividade '||id::text,'','' FROM unnest($1::uuid[]) AS id",
        [extra, ownerProfile.id],
      );
      for (const order of ['size', 'activity']) {
        let after: string | null = null;
        const seen = new Set<string>();
        for (let page = 0; page < 5; page++) {
          const result = explorePage(
            await ranked({ order, period: 'week' }, after),
          );
          for (const entry of result.items) {
            assert.ok(!seen.has(entry.community.id));
            seen.add(entry.community.id);
          }
          after = result.next;
          if (!after) break;
        }
        assert.equal(after, null);
        if (order === 'size') assert.ok(extra.every((id) => seen.has(id)));
        else assert.ok(extra.every((id) => !seen.has(id)));
      }
    },
  );
  await t.test(
    'public HTTP validates filters and rejects private lists; ended session blocks preferences',
    async () => {
      const result = await fetch(
        `${origin}/api/communities/feed?community=${community}`,
      );
      assert.equal(result.status, 200);
      feedPage(await result.json());
      for (let attempt = 0; attempt < 300; attempt++) {
        const read = await fetch(
          `${origin}/api/communities/feed?community=${community}`,
        );
        assert.equal(
          read.status,
          200,
          'feed não tem teto de 240 consultas/min',
        );
        feedPage(await read.json());
      }
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
      await ranked({ order: 'trending', period: 'week' }, null);
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
    'keyword search covers titles, bodies and low-engagement replies with filter-bound pagination',
    async () => {
      const searchReader = await make();
      await searchReader.publicIdentity(
        `search_${crypto.randomUUID().slice(0, 8)}`,
      );
      const group = crypto.randomUUID();
      ids.push(group);
      await owner.operate('create', {
        classification: { nsfw: false, topics: ['meme'] },
        id: group,
        meta: { name: `Search fixture ${group}`, description: '', rules: '' },
      });
      const entries: string[] = [];
      for (const [title, text] of [
        ['Pedra', 'River content'],
        ['Other title', 'Pedra granite'],
        ['Unrelated', 'Reply context'],
      ]) {
        const post = crypto.randomUUID();
        entries.push(post);
        await owner.operate('post-create', {
          id: group,
          post,
          content: await rootPostContent(communities, group, text!, title),
        });
      }
      const reply = crypto.randomUUID();
      await owner.operate('reply-create', {
        id: group,
        post: reply,
        parent: entries[2],
        content: { title: '', text: 'Pedra reply', tags: [] },
      });
      await inspector.query(
        "UPDATE hash_talk.community_posts SET score=20,created_at=clock_timestamp()-interval '2 days' WHERE id=$1",
        [entries[0]],
      );
      const search = {
        ...baseline,
        community: group,
        order: 'mixed' as const,
        search: 'pedra',
      };
      const publicRead = async (
        filter: FeedFilter = search,
        after: string | null = null,
      ) => feedPage(await communities.feed(filter, after));
      const results = await publicRead();
      assert.equal(results.items[0]?.post.id, entries[0]);
      assert.deepEqual(
        new Set(results.items.map((entry) => entry.post.id)),
        new Set([entries[0], entries[1], reply]),
      );
      assert.deepEqual(
        (await publicRead({ ...search, search: 'PeDrA granite' })).items.map(
          (entry) => entry.post.id,
        ),
        [entries[1]],
      );
      assert.ok(
        !(await publicRead({ ...search, period: 'day' })).items.some(
          (entry) => entry.post.id === entries[0],
        ),
      );
      assert.equal(
        (await publicRead({ ...search, order: 'votes' })).items[0]?.post.id,
        entries[0],
      );
      assert.equal(
        (await publicRead({ ...search, order: 'recent' })).items.at(-1)?.post
          .id,
        entries[0],
      );
      assert.equal(
        (await feed(searchReader, { ...search, scope: 'following' })).items
          .length,
        0,
      );
      await searchReader.operate('follow', { id: group, following: true });
      assert.ok(
        (
          await feed(searchReader, { ...search, scope: 'following' })
        ).items.some((entry) => entry.post.id === entries[0]),
      );
      const response = await fetch(
        `${origin}/api/communities/feed?period=all&q=pedra&community=${group}`,
      );
      assert.equal(response.status, 200);
      assert.equal(feedPage(await response.json()).items.length, 3);
      for (let i = 0; i < 25; i++)
        await owner.operate('post-create', {
          id: group,
          post: crypto.randomUUID(),
          content: await rootPostContent(
            communities,
            group,
            'Paginationstone',
            'Indexed fixture',
          ),
        });
      const paged = { ...search, search: 'paginationstone' };
      const first = await publicRead(paged);
      assert.ok(first.next);
      const second = await publicRead(paged, first.next);
      assert.equal(
        new Set([...first.items, ...second.items].map((entry) => entry.post.id))
          .size,
        25,
      );
      await assert.rejects(
        publicRead({ ...paged, search: 'pedra' }, first.next),
        bad(400),
      );
      const state = postState(
        await owner.operate('post-state', { id: group, post: entries[0] }),
      );
      await owner.operate('post-hide', {
        id: group,
        post: entries[0],
        revision: state.post.revision,
        record: crypto.randomUUID(),
        reason: 'Search visibility fixture',
      });
      assert.ok(
        !(await publicRead()).items.some(
          (entry) => entry.post.id === entries[0],
        ),
      );
    },
  );
  await t.test(
    'synthetic deletion removes preferences and follows; reused handle inherits no references',
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
