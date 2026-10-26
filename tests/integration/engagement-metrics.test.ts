import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
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
import { postState } from '../../src/shared/community-posts/index.ts';
import { EngagementMetricsStore } from '../../src/server/database/engagement-metrics.ts';
import {
  createEngagementHandler,
  engagementCsv,
} from '../../src/server/engagement-metrics/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import type { EngagementMetric } from '../../src/shared/engagement-metrics/index.ts';
import { publicModerationPolicy } from '../../src/shared/public-moderation/index.ts';
import { closeDisposablePool } from '../fixtures/disposable-pool.ts';

await test('engagement metrics preserve transactional facts, privacy, deletion and independent reports', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('An exclusive test database is required.');
  const administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  const name =
    'hash_talk_test_engagement_facts_' +
    crypto.randomUUID().replaceAll('-', '');
  await administrator.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
  const isolated = new URL(config.databaseUrl);
  isolated.pathname = '/' + name;
  const environment = { ...process.env, HASH_TALK_DATABASE_URL: isolated.href };
  const db = new Database(isolated.href);
  const inspector = new pg.Client({ connectionString: isolated.href });
  await db.migrate();
  await inspector.connect();
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
  );
  const accounts: string[] = [];
  const addresses: string[] = [];
  const reviews: string[] = [];
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const origin = 'http://127.0.0.1:45130';
  let collectorAvailable = true;
  const host = createWebServer({
    origin,
    database: db,
    assets: new Map(),
    objects: { healthy: () => Promise.resolve(true) },
    engagement: createEngagementHandler({
      origin,
      observe: (input) =>
        collectorAvailable
          ? db.engagementMetrics.observe(input)
          : Promise.reject(new Error('Synthetic collector outage.')),
      observeVisitor: (input) => db.engagementMetrics.observeVisitor(input),
      recordFailures: (summary) =>
        db.engagementMetrics.noteCollectionFailure(summary),
    }),
  });
  t.after(async () => {
    await host.close();
    await inspector.query(
      'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query(
      'DELETE FROM hash_talk.public_moderation WHERE id=ANY($1::uuid[])',
      [reviews],
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
    await db.engagementMetrics.collect();
    await inspector.end();
    await db.close();
    try {
      await administrator.query(`DROP DATABASE "${name}"`);
    } finally {
      await administrator.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45130, '127.0.0.1', resolve);
  });
  async function metric(
    name: EngagementMetric,
    extra: Record<string, unknown> = {},
  ): Promise<string | null> {
    const report = await db.engagementMetrics.report({
      metrics: [name],
      preset: 'last24h',
      ...extra,
    });
    return report.rows[0]?.values[name]?.value ?? null;
  }
  const accountService = new AccountService({
    store: db.authentication,
    origin,
  });
  const beforeAccounts = BigInt((await metric('accounts_created'))!);
  const beforeProfiles = BigInt((await metric('public_profiles_created'))!);
  const make = () =>
    createCommunityAccount({
      account: accountService,
      devices: new DeviceService(db.devices),
      profiles: new PublicProfileService(db.publicProfiles, db.devices),
      communities,
      accounts,
      addresses,
    });
  const owner = await make();
  const profile = await owner.publicIdentity(
    `metrics_${crypto.randomUUID().slice(0, 8)}`,
  );
  const reader = await make();
  await reader.publicIdentity(`reader_${crypto.randomUUID().slice(0, 8)}`);
  for (const id of ids)
    await owner.operate('create', {
      id,
      meta: {
        name: `Synthetic engagement ${id}`,
        description: 'Test data only.',
        rules: 'Test policy.',
      },
      classification: { nsfw: false, topics: ['tech'] },
    });
  const community = ids[0]!;
  const post = crypto.randomUUID();
  const reply = crypto.randomUUID();
  const content = await rootPostContent(
    communities,
    community,
    'Synthetic public text.',
    'Synthetic metric post',
  );
  const replyContent = { title: '', text: 'Synthetic reply.', tags: [] };
  await t.test(
    'new accounts and public profiles remain separate; edits and login do not create them',
    async () => {
      assert.equal(
        BigInt((await metric('accounts_created'))!) - beforeAccounts,
        2n,
      );
      assert.equal(
        BigInt((await metric('public_profiles_created'))!) - beforeProfiles,
        2n,
      );
      await owner.publicIdentity(profile.handle);
      const challenge = await accountService.challenge({
        address: owner.wallet.address,
        chainId: 1,
        deviceId: owner.login.session.deviceId,
      });
      await accountService.login(
        {
          id: challenge.id,
          signature: await owner.wallet.signMessage(challenge.message),
        },
        challenge.browserToken,
      );
      assert.equal(
        BigInt((await metric('accounts_created'))!) - beforeAccounts,
        2n,
      );
      assert.equal(
        BigInt((await metric('public_profiles_created'))!) - beforeProfiles,
        2n,
      );
    },
  );
  await t.test(
    'creation and first publication count once; rollback and invalid admission count nothing',
    async () => {
      await owner.operate('post-create', { id: community, post, content });
      await owner.operate('post-create', { id: community, post, content });
      await reader.operate('reply-create', {
        id: community,
        post: reply,
        parent: post,
        content: replyContent,
      });
      for (const name of [
        'posts_created',
        'posts_published',
        'replies_created',
        'replies_published',
      ] as const)
        assert.equal(await metric(name, { communityIds: [community] }), '1');
      await inspector.query('BEGIN');
      await inspector.query(
        'INSERT INTO hash_talk.community_posts(id,community_id,author,title,text) VALUES($1,$2,$3,$4,$5)',
        [crypto.randomUUID(), community, profile.id, '', 'Rolled back.'],
      );
      await inspector.query('ROLLBACK');
      assert.equal(
        await metric('posts_created', { communityIds: [community] }),
        '1',
      );
      const own = postState(
        await owner.operate('post-state', { id: community, post }),
      );
      await owner.operate('post-edit', {
        id: community,
        post,
        revision: own.post.revision,
        content: { ...content, text: 'Edited public text.' },
      });
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '1',
      );
    },
  );
  await t.test(
    'concurrent duplicate views preserve independent post and reply counters',
    async () => {
      const input = { items: [{ community, post, token: 'a'.repeat(32) }] };
      await Promise.all([
        db.communityViews.observe(input),
        db.communityViews.observe(input),
      ]);
      await db.communityViews.observe({
        items: [{ community, post: reply, token: 'a'.repeat(32) }],
      });
      assert.equal(
        await metric('post_views_estimated', { postIds: [post] }),
        '1',
      );
      assert.equal(
        await metric('reply_views_estimated', { postIds: [post] }),
        '1',
      );
      const pool = new pg.Pool({ connectionString: isolated.href });
      const closePool = closeDisposablePool(pool);
      const observation = {
        id: crypto.randomUUID(),
        kind: 'share',
        category: 'post',
        community,
        post,
      };
      try {
        await assert.rejects(
          new EngagementMetricsStore(pool, 1).observe({ items: [observation] }),
        );
        assert.equal(
          await metric('share_actions_started', { postIds: [post] }),
          '0',
        );
      } finally {
        await closePool();
      }
    },
  );
  await t.test(
    'vote transitions retain additions and distinguish user withdrawal from cleanup',
    async () => {
      const vote = (position: number, voteRevision: number) =>
        reader.operate('post-vote', {
          id: community,
          post,
          position,
          voteRevision,
        });
      await vote(1, 0);
      await vote(1, 0);
      await vote(-1, 1);
      assert.equal(await metric('upvotes_added', { postIds: [post] }), '1');
      assert.equal(
        await metric('upvotes_removed', {
          postIds: [post],
          removalCause: 'user',
        }),
        '1',
      );
      assert.equal(await metric('downvotes_added', { postIds: [post] }), '1');
      assert.equal(await metric('upvotes_current', { postIds: [post] }), '0');
      await inspector.query(
        'DELETE FROM hash_talk.community_votes WHERE post_id=$1',
        [post],
      );
      assert.equal(
        await metric('downvotes_removed', {
          postIds: [post],
          removalCause: 'cleanup',
        }),
        '1',
      );
      assert.equal(await metric('downvotes_current', { postIds: [post] }), '0');
    },
  );
  await t.test(
    'visitor markers never enter entity observations; repeated observations count once',
    async () => {
      const page = {
        id: crypto.randomUUID(),
        kind: 'page',
        category: 'post',
        community,
        post,
      };
      await db.engagementMetrics.observe({ items: [page] });
      await db.engagementMetrics.observe({ items: [page] });
      assert.equal(
        await metric('public_page_views', {
          communityIds: [community],
          pageCategories: ['post'],
        }),
        '1',
      );
      const previous = BigInt(
        (await metric('public_site_visitors_estimated'))!,
      );
      const visitor = {
        id: crypto.randomUUID(),
        marker: crypto.randomUUID().replaceAll('-', ''),
      };
      await db.engagementMetrics.observeVisitor(visitor);
      await db.engagementMetrics.observeVisitor({
        ...visitor,
        id: crypto.randomUUID(),
      });
      assert.equal(
        BigInt((await metric('public_site_visitors_estimated'))!) - previous,
        1n,
      );
      const report = await db.engagementMetrics.report({
        metrics: ['public_site_visitors_estimated'],
        preset: 'last7d',
      });
      assert.equal(
        report.rows[0]!.values.public_site_visitors_estimated!.value,
        null,
      );
      assert.ok(report.rows[0]!.values.public_site_visitors_estimated!.reason);
      const columns = await inspector.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='engagement_visitors'",
      );
      assert.deepEqual(columns.rows.map((row) => row.column_name).sort(), [
        'charge',
        'marker',
        'seen_at',
      ]);
      assert.equal(
        (
          await inspector.query(
            "SELECT 1 FROM hash_talk.engagement_observations WHERE id=$1 AND expires_at>clock_timestamp()+interval '6 days'",
            [visitor.id],
          )
        ).rowCount,
        1,
      );
    },
  );
  await t.test(
    'collection has no administrative report route and rejects origin or schema injection',
    async () => {
      const response = (path: string, input: unknown, requestOrigin = origin) =>
        fetch(`${origin}${path}`, {
          method: 'POST',
          headers: {
            Origin: requestOrigin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
      assert.equal(
        (
          await response('/api/engagement/observations', {
            items: [
              {
                id: crypto.randomUUID(),
                kind: 'copy',
                category: 'post',
                community,
                post,
              },
            ],
          })
        ).status,
        204,
      );
      assert.equal(
        (
          await response('/api/engagement/visitors', {
            id: crypto.randomUUID(),
            marker: 'e'.repeat(32),
            post,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await response(
            '/api/engagement/observations',
            { items: [] },
            'https://untrusted.invalid',
          )
        ).status,
        403,
      );
      assert.equal(
        (await fetch(`${origin}/api/engagement/report`)).status,
        404,
      );
      assert.equal(await metric('links_copied', { postIds: [post] }), '1');
    },
  );
  await t.test(
    'collector failure is visible after recovery and cannot fabricate a successful observation',
    async () => {
      const input = {
        items: [
          {
            id: crypto.randomUUID(),
            kind: 'page',
            category: 'feed',
            community: null,
            post: null,
          },
        ],
      };
      const send = () =>
        fetch(`${origin}/api/engagement/observations`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
      const before = BigInt(
        (await metric('public_page_views', { pageCategories: ['feed'] }))!,
      );
      collectorAvailable = false;
      try {
        assert.equal((await send()).status, 503);
      } finally {
        collectorAvailable = true;
      }
      assert.equal(
        await metric('public_page_views', { pageCategories: ['feed'] }),
        String(before),
      );
      assert.equal((await send()).status, 204);
      assert.equal(
        await metric('public_page_views', { pageCategories: ['feed'] }),
        String(before + 1n),
      );
      const report = await db.engagementMetrics.report({
        metrics: ['public_page_views'],
        preset: 'last24h',
      });
      assert.ok(
        report.coverage.some((item) => item.reason === 'collection_failure'),
      );
    },
  );
  await t.test(
    'qualified view corrections propagate across reporting scopes without changing public counters',
    async () => {
      const filters = [{}, { communityIds: [community] }, { postIds: [post] }];
      const before = await Promise.all(
        filters.map((filter) => metric('post_views_estimated', filter)),
      );
      const publicBefore = (
        await inspector.query<{ views: string }>(
          'SELECT views::text FROM hash_talk.community_posts WHERE id=$1',
          [post],
        )
      ).rows[0]!.views;
      const bucket = (
        await inspector.query<{ bucket: Date }>(
          "SELECT bucket FROM hash_talk.engagement_counts WHERE metric='post_views_estimated' AND scope='post' AND entity=$1 ORDER BY bucket DESC LIMIT 1",
          [post],
        )
      ).rows[0]!.bucket.toISOString();
      await db.engagementMetrics.correct({
        id: crypto.randomUUID(),
        kind: 'traffic',
        metric: 'post_views_estimated',
        scope: 'post',
        entity: post,
        bucket,
        category: 'all',
        delta: '-1',
        reason: 'invalid_traffic',
      });
      for (const [index, filter] of filters.entries())
        assert.equal(
          await metric('post_views_estimated', filter),
          String(BigInt(before[index]!) - 1n),
        );
      assert.equal(
        (
          await inspector.query<{ views: string }>(
            'SELECT views::text FROM hash_talk.community_posts WHERE id=$1',
            [post],
          )
        ).rows[0]!.views,
        publicBefore,
      );
    },
  );
  await t.test(
    'reports share a cutoff, deduplicate contributors and export complete bounded selections',
    async () => {
      await owner.operate('post-create', {
        id: ids[1],
        post: crypto.randomUUID(),
        content: await rootPostContent(
          communities,
          ids[1]!,
          'Synthetic public text.',
          'Synthetic metric post',
        ),
      });
      assert.equal(
        await metric('public_contributors_distinct', {
          communityIds: [community, ids[1]],
          eligibility: 'promotable',
        }),
        '2',
      );
      const query = {
        metrics: ['posts_created', 'replies_created'],
        preset: 'last24h',
        communityIds: ids,
        groupBy: 'community',
        orderBy: { by: 'posts_created', direction: 'desc' },
        limit: 1,
      };
      const first = await db.engagementMetrics.report(query);
      assert.ok(first.next);
      const next = await db.engagementMetrics.report({
        ...query,
        preset: undefined,
        from: first.query.from,
        to: first.query.to,
        cursor: first.next,
      });
      assert.notEqual(first.rows[0]!.dimension, next.rows[0]!.dimension);
      const all = await db.engagementMetrics.report(query, { all: true });
      assert.equal(all.next, null);
      assert.equal(new Set(all.rows.map((row) => row.dimension)).size, 3);
      assert.ok(engagementCsv(all).includes('posts_created'));
      await assert.rejects(
        db.engagementMetrics.report({
          ...query,
          metrics: ['accounts_created'],
        }),
      );
    },
  );
  await t.test(
    'removal and restoration do not count a second first publication',
    async () => {
      const initial = postState(
        await owner.operate('post-state', { id: community, post }),
      );
      const record = crypto.randomUUID();
      await owner.operate('post-hide', {
        id: community,
        post,
        revision: initial.post.revision,
        record,
        reason: 'Synthetic visibility test.',
      });
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '1',
      );
      assert.equal(
        await metric('posts_published', {
          communityIds: [community],
          eligibility: 'promotable',
        }),
        '0',
      );
      const hidden = postState(
        await owner.operate('post-state', { id: community, post }),
      );
      await owner.operate('post-decide', {
        id: community,
        post,
        revision: hidden.post.revision,
        record,
        decision: 'Restore synthetic test.',
        restore: true,
      });
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '1',
      );
    },
  );
  await t.test(
    'content first hidden by media review counts creation before publication',
    async () => {
      const media = crypto.randomUUID(),
        review = crypto.randomUUID(),
        draft = crypto.randomUUID();
      reviews.push(review);
      await inspector.query(
        `INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy,status)
        VALUES($1,$2,'post-media',$3,$4,$5,'failed')`,
        [review, profile.id, media, 'c'.repeat(64), publicModerationPolicy],
      );
      await inspector.query(
        'INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,media_ids) VALUES($1,$2,$3,$4,$5,$6)',
        [
          draft,
          community,
          profile.id,
          'Synthetic review',
          'Synthetic content.',
          [media],
        ],
      );
      assert.equal(
        await metric('posts_created', { communityIds: [community] }),
        '2',
      );
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '1',
      );
      await inspector.query(
        "UPDATE hash_talk.community_posts SET media_ids='{}' WHERE id=$1",
        [draft],
      );
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '2',
      );
      await inspector.query(
        "UPDATE hash_talk.community_posts SET title='Edited after publication' WHERE id=$1",
        [draft],
      );
      assert.equal(
        await metric('posts_published', { communityIds: [community] }),
        '2',
      );
    },
  );
  await t.test(
    'filtered infrastructure backups preserve daily aggregates without temporary identifiers',
    async () => {
      await db.engagementMetrics.collect();
      const result = spawnSync(
        'python3',
        ['tests/fixtures/engagement-backup.py'],
        {
          cwd: new URL('../../', import.meta.url),
          env: environment,
          encoding: 'utf8',
          timeout: 60_000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes('preserved aggregates'));
    },
  );
  await t.test(
    'deletion retires detail without erasing accepted project totals; cleanup is bounded',
    async () => {
      const before = await metric('posts_created');
      const own = postState(
        await owner.operate('post-state', { id: community, post }),
      );
      await owner.operate('post-delete', {
        id: community,
        post,
        revision: own.post.revision,
      });
      assert.equal(await metric('posts_created'), before);
      const retired = await db.engagementMetrics.report({
        metrics: ['post_views_estimated'],
        preset: 'last24h',
        postIds: [post],
      });
      assert.equal(retired.rows[0]!.values.post_views_estimated!.value, null);
      assert.equal(
        retired.rows[0]!.values.post_views_estimated!.reason,
        'entity_missing_or_erased',
      );
      await inspector.query(
        "UPDATE hash_talk.engagement_contributors SET published_at=clock_timestamp()-interval '31 days' WHERE post=$1",
        [reply],
      );
      for (let step = 0; step < 4; step++) await db.engagementMetrics.collect();
      assert.equal(
        (
          await inspector.query(
            "SELECT 1 FROM hash_talk.engagement_adjustments WHERE scope='post' AND entity=$1",
            [post],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.engagement_contributors WHERE post=$1',
            [reply],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await inspector.query(
            "SELECT 1 FROM hash_talk.engagement_counts WHERE scope='post' AND entity=$1",
            [post],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.engagement_contributors WHERE post=$1',
            [post],
          )
        ).rowCount,
        0,
      );
      const expired = crypto.randomUUID().replaceAll('-', '');
      await db.engagementMetrics.observeVisitor({
        id: crypto.randomUUID(),
        marker: expired,
      });
      await inspector.query(
        "UPDATE hash_talk.engagement_visitors SET seen_at=clock_timestamp()-interval '49 hours' WHERE marker=encode(sha256(convert_to($1,'UTF8')),'hex')",
        [expired],
      );
      await db.engagementMetrics.collect();
      assert.equal(
        (
          await inspector.query(
            "SELECT 1 FROM hash_talk.engagement_visitors WHERE marker=encode(sha256(convert_to($1,'UTF8')),'hex')",
            [expired],
          )
        ).rowCount,
        1,
      );
      await inspector.query(
        "UPDATE hash_talk.engagement_visitors SET seen_at=clock_timestamp()-interval '8 days' WHERE marker=encode(sha256(convert_to($1,'UTF8')),'hex')",
        [expired],
      );
      await db.engagementMetrics.collect();
      assert.equal(
        (
          await inspector.query(
            "SELECT 1 FROM hash_talk.engagement_visitors WHERE marker=encode(sha256(convert_to($1,'UTF8')),'hex')",
            [expired],
          )
        ).rowCount,
        0,
      );
      assert.ok(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.engagement_snapshots LIMIT 1',
          )
        ).rowCount,
      );
      const snapshots = await db.engagementMetrics.snapshotsPage();
      assert.ok(
        snapshots.rows.some(
          (item) => item.metric === 'public_site_visitors_estimated',
        ),
      );
    },
  );
  await t.test(
    'the operator command produces independent read-only JSON with explicit limitations',
    async () => {
      const expected = await db.engagementMetrics.report({
        metrics: ['accounts_created', 'public_profiles_created'],
        preset: 'last24h',
      });
      const result = spawnSync(
        process.execPath,
        [
          'src/tools/report-engagement.ts',
          '--metrics',
          'accounts_created,public_profiles_created',
          '--format',
          'json',
        ],
        {
          cwd: new URL('../../', import.meta.url),
          env: environment,
          encoding: 'utf8',
          timeout: 15000,
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const report: unknown = JSON.parse(result.stdout);
      assert.ok(
        typeof report === 'object' && report !== null && 'rows' in report,
      );
      assert.ok(result.stdout.includes('public_profiles_created'));
      assert.deepEqual(report.rows, expected.rows);
    },
  );
});
