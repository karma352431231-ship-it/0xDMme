import { measurePostSignals } from '../../src/server/database/post-ranking-signals.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { measureRanking } from '../../src/server/database/community-ranking-metrics.ts';
import {
  Database,
  CommunityRankingStore,
} from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { CommunityRankingService } from '../../src/server/community-ranking/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createCommunityAccount,
  rootPostContent,
} from './community-fixture.ts';
import type { PublicProfile } from '../../src/shared/public-profile/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import { explorePage } from '../../src/shared/community-discovery/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';

await test('rankings: métricas exatas, votos agregados, eventos, recuperação e publicação', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45124',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices);
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
    { discovery: db.communityDiscovery },
  );
  const worker = new CommunityRankingService(
    db.communityRanking,
    db.workSignals,
    { fallbackMs: 0 },
  );
  const accounts: string[] = [],
    addresses: string[] = [],
    ids: string[] = [crypto.randomUUID(), crypto.randomUUID()];
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    await worker.close();
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
      profiles,
      communities,
      accounts,
      addresses,
    });
  const users = [await make(), await make(), await make()];
  const publicUsers: PublicProfile[] = [];
  for (const user of users)
    publicUsers.push(
      await user.publicIdentity(`rank_${crypto.randomUUID().slice(0, 8)}`),
    );
  const owner = users[0]!,
    community = ids[0]!,
    archived = ids[1]!;
  for (const id of ids)
    await owner.operate('create', {
      classification: { nsfw: false, topics: ['meme'] },
      id,
      meta: { name: `Ranking sintético ${id}`, description: '', rules: '' },
    });
  const original = crypto.randomUUID(),
    reply = crypto.randomUUID();
  await owner.operate('post-create', {
    id: community,
    post: original,
    content: await rootPostContent(
      communities,
      community,
      'Discussão sintética',
    ),
  });
  await users[1]!.operate('reply-create', {
    id: community,
    post: reply,
    parent: original,
    content: { title: '', text: 'Resposta sintética', tags: [] },
  });
  const third = crypto.randomUUID();
  await users[2]!.operate('post-create', {
    id: community,
    post: third,
    content: await rootPostContent(communities, community, 'Outro autor'),
  });
  await inspector.query(
    "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-interval '2 hours' WHERE id=ANY($1::uuid[])",
    [[original, reply, third]],
  );
  await inspector.query(
    'UPDATE hash_talk.communities SET archived=true WHERE id=$1',
    [archived],
  );
  async function refresh() {
    await worker.flush();
  }
  async function page(order: string = 'trending', after: string | null = null) {
    return explorePage(
      await communities.explore({ order, period: 'day' }, after),
    );
  }
  await t.test(
    'medição respeita o prazo com JIT forçado e devolve a conexão após sucesso ou erro',
    async () => {
      await inspector.query('SET jit=on');
      await inspector.query('SET jit_above_cost=0');
      await inspector.query('SET statement_timeout=4000');
      try {
        const rows = await measureRanking(inspector, ids, new Date());
        assert.equal(
          rows.find((row) => row.community_id === community)?.day.current
            .participants,
          3,
        );
        async function reusable() {
          assert.equal(
            (await inspector.query<{ jit: string }>('SHOW jit')).rows[0]?.jit,
            'on',
          );
          assert.equal(
            (
              await inspector.query<{ transaction_read_only: string }>(
                'SHOW transaction_read_only',
              )
            ).rows[0]?.transaction_read_only,
            'off',
          );
        }
        await reusable();
        await assert.rejects(
          measureRanking(inspector, ['invalid-uuid'], new Date()),
          { code: '22P02' },
        );
        await reusable();
        assert.equal(
          (await measureRanking(inspector, ids, new Date())).length,
          ids.length,
        );
      } finally {
        await inspector.query('RESET jit');
        await inspector.query('RESET jit_above_cost');
        await inspector.query('RESET statement_timeout');
      }
    },
  );
  await t.test(
    'únicos não somam horários, conversa exclui auto-resposta e três autores entram em novas',
    async () => {
      await refresh();
      const result = await page(),
        row = result.items.find((r) => r.community.id === community)!;
      assert.equal(row.participants, 3);
      assert.equal(row.activity, 3);
      assert.equal(row.historyComplete, false);
      assert.ok(
        (await page('new')).items.some((r) => r.community.id === community),
      );
      assert.ok(!result.items.some((r) => r.community.id === archived));
      assert.ok(
        (await page('size')).items.some((r) => r.community.id === archived),
      );
      const metrics = await inspector.query<{
        metrics: {
          day: { current: { conversations: number; occupied: number } };
        };
      }>(
        'SELECT metrics FROM hash_talk.community_ranking_state WHERE community_id=$1',
        [community],
      );
      assert.equal(metrics.rows[0]!.metrics.day.current.conversations, 1);
      assert.equal(metrics.rows[0]!.metrics.day.current.occupied, 1);
    },
  );
  await t.test(
    'coleta respeita a âncora de uma rodada em andamento na fronteira dos 14 dias',
    async () => {
      const at = (
        await inspector.query<{ at: Date }>(
          "SELECT date_trunc('milliseconds',clock_timestamp())-interval '1 second' AS at",
        )
      ).rows[0]!.at;
      const deltaAt = new Date(at.getTime() - 14 * 86400000 + 500);
      await inspector.query(
        'INSERT INTO hash_talk.community_upvote_deltas(post_id,at,delta) VALUES($1,$2,1)',
        [original, deltaAt],
      );
      await inspector.query(
        'UPDATE hash_talk.community_ranking_settings SET round_cutoff=$1 WHERE singleton',
        [at],
      );
      try {
        await db.communityRanking.process();
        assert.equal(
          (
            await inspector.query(
              'SELECT 1 FROM hash_talk.community_upvote_deltas WHERE post_id=$1 AND at=$2',
              [original, deltaAt],
            )
          ).rowCount,
          1,
        );
      } finally {
        await inspector.query(
          'DELETE FROM hash_talk.community_upvote_deltas WHERE post_id=$1 AND at=$2',
          [original, deltaAt],
        );
        await inspector.query(
          'UPDATE hash_talk.community_ranking_settings SET round_cutoff=NULL WHERE singleton',
        );
      }
    },
  );
  await t.test(
    'voto recente em post antigo, retry e reversão não multiplicam positivos',
    async () => {
      await inspector.query(
        "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-interval '10 days' WHERE id=$1",
        [original],
      );
      const vote = postState(
        await users[1]!.operate('post-state', {
          id: community,
          post: original,
        }),
      ).vote;
      const payload = {
        id: community,
        post: original,
        voteRevision: vote.revision,
        position: 1,
      };
      await users[1]!.operate('post-vote', payload);
      await users[1]!.operate('post-vote', payload);
      await inspector.query(
        "UPDATE hash_talk.community_upvote_deltas SET at=clock_timestamp()-interval '1 hour' WHERE post_id=$1",
        [original],
      );
      await refresh();
      assert.equal(
        (await page()).items.find((r) => r.community.id === community)!.upvotes,
        1,
      );
      const state = postState(
        await users[1]!.operate('post-state', {
          id: community,
          post: original,
        }),
      );
      await users[1]!.operate('post-vote', {
        id: community,
        post: original,
        voteRevision: state.vote.revision,
        position: -1,
      });
      await refresh();
      assert.equal(
        (await page()).items.find((r) => r.community.id === community)!.upvotes,
        0,
      );
      const columns = await inspector.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='community_upvote_deltas'",
      );
      assert.deepEqual(columns.rows.map((r) => r.column_name).sort(), [
        'at',
        'charge',
        'delta',
        'post_id',
      ]);
    },
  );
  await t.test(
    'voters count only inside the selected window without previous-window growth',
    async () => {
      const voter = await make();
      await voter.publicIdentity(`rank_${crypto.randomUUID().slice(0, 8)}`);
      const active = async () =>
        (await measureRanking(inspector, [community], new Date())).find(
          (row) => row.community_id === community,
        )!.day;
      const before = await active();
      const state = postState(
        await voter.operate('post-state', { id: community, post: third }),
      );
      await voter.operate('post-vote', {
        id: community,
        post: third,
        voteRevision: state.vote.revision,
        position: 1,
      });
      const now = await active();
      assert.equal(now.current.participants, before.current.participants + 1);
      // The same vote cast 30 hours ago belongs to the previous window.
      await inspector.query(
        "UPDATE hash_talk.community_votes SET voted_at=clock_timestamp()-interval '30 hours' WHERE post_id=$1 AND position=1 AND voted_at>clock_timestamp()-interval '1 minute'",
        [third],
      );
      const earlier = await active();
      assert.equal(earlier.current.participants, before.current.participants);
      assert.equal(earlier.previous.participants, 0);
      await refresh();
      const row = (await page()).items.find(
        (r) => r.community.id === community,
      )!;
      assert.equal(row.participants, earlier.current.participants);
      assert.equal(row.previousParticipants, earlier.previous.participants);
      // A withdrawn vote stops counting, so later checks see the original members.
      const cast = postState(
        await voter.operate('post-state', { id: community, post: third }),
      );
      await voter.operate('post-vote', {
        id: community,
        post: third,
        voteRevision: cast.vote.revision,
        position: 0,
      });
      const withdrawn = await active();
      assert.equal(withdrawn.current.participants, before.current.participants);
      assert.equal(
        withdrawn.previous.participants,
        before.previous.participants,
      );
    },
  );
  await t.test(
    'rollback não deixa pendência nem sinal; exclusão do original retira respostas',
    async () => {
      const before = await inspector.query<{ revision: string }>(
        'SELECT revision::text FROM hash_talk.community_ranking_state WHERE community_id=$1',
        [community],
      );
      await inspector.query('BEGIN');
      await inspector.query(
        'UPDATE hash_talk.communities SET name=$2 WHERE id=$1',
        [community, 'Rollback'],
      );
      await inspector.query('ROLLBACK');
      assert.equal(
        (
          await inspector.query<{ revision: string }>(
            'SELECT revision::text FROM hash_talk.community_ranking_state WHERE community_id=$1',
            [community],
          )
        ).rows[0]!.revision,
        before.rows[0]!.revision,
      );
      const state = postState(
        await owner.operate('post-state', { id: community, post: original }),
      );
      await owner.operate('post-delete', {
        id: community,
        post: original,
        revision: state.post.revision,
      });
      await refresh();
      assert.equal(
        (await page()).items.find((r) => r.community.id === community)!
          .activity,
        1,
      );
      assert.ok(
        !(await page('new')).items.some((r) => r.community.id === community),
      );
    },
  );
  await t.test(
    'leitores reutilizam geração; paginação conserva snapshot e cursor expirado exige reinício',
    async () => {
      const extra: string[] = Array.from({ length: 30 }, () =>
        crypto.randomUUID(),
      );
      ids.push(...extra);
      await inspector.query(
        "INSERT INTO hash_talk.communities(id,owner,name,description,rules) SELECT id,$2,'Candidata sem atividade '||id::text,'','' FROM unnest($1::uuid[]) id",
        [extra, publicUsers[0]!.id],
      );
      await refresh();
      const first = await page('size');
      assert.ok(
        !(await page()).items.some((item) => extra.includes(item.community.id)),
      );
      assert.ok(first.next);
      const before = await inspector.query(
        'SELECT sum(processed)::text AS n FROM hash_talk.community_ranking_state',
      );
      const second = await page('size', first.next);
      assert.equal(second.generation, first.generation);
      assert.equal(
        new Set([...first.items, ...second.items].map((r) => r.community.id))
          .size,
        first.items.length + second.items.length,
      );
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT sum(processed)::text AS n FROM hash_talk.community_ranking_state',
          )
        ).rows,
        before.rows,
      );
      const raced = await Promise.allSettled([
        page('size', first.next),
        inspector.query(
          'DELETE FROM hash_talk.community_ranking_generations WHERE id=$1',
          [first.generation],
        ),
      ]);
      assert.equal(raced[1].status, 'fulfilled');
      const read = raced[0];
      if (read.status === 'fulfilled') assert.ok(read.value.items.length > 0);
      else
        assert.ok(
          read.reason instanceof AccountError && read.reason.status === 409,
        );
      await inspector.query(
        "UPDATE hash_talk.community_ranking_generations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [first.generation],
      );
      await assert.rejects(page('size', first.next), { status: 409 });
      await refresh();
    },
  );
  await t.test(
    'aceite local mede publicação, atualização afetada e leitura com universo de 1.000 comunidades',
    async () => {
      const extra = Array.from({ length: 1000 - ids.length }, () =>
        crypto.randomUUID(),
      );
      ids.push(...extra);
      await inspector.query(
        "INSERT INTO hash_talk.communities(id,owner,name,description,rules) SELECT id,$2,'Candidata do ensaio local '||id::text,'','' FROM unnest($1::uuid[]) id",
        [extra, publicUsers[0]!.id],
      );
      const walStart = (
        await inspector.query<{ lsn: string }>(
          'SELECT pg_current_wal_lsn()::text AS lsn',
        )
      ).rows[0]!.lsn;
      let started = performance.now();
      await refresh();
      const firstBuildMs = performance.now() - started;
      const current = await page('size');
      const count = await inspector.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM hash_talk.community_ranking_entries WHERE generation=$1 AND period='day'",
        [current.generation],
      );
      assert.equal(
        count.rows[0]!.n,
        (
          await inspector.query<{ n: number }>(
            'SELECT count(*)::integer AS n FROM hash_talk.communities',
          )
        ).rows[0]!.n,
      );
      started = performance.now();
      for (let i = 0; i < 3; i++)
        await measureRanking(inspector, ids, new Date());
      const referencePerReadMs = (performance.now() - started) / 3;
      started = performance.now();
      for (let i = 0; i < 20; i++) await page('size');
      const publishedPerReadMs = (performance.now() - started) / 20;
      const before = await inspector.query<{
        community_id: string;
        processed: string;
      }>(
        'SELECT community_id,processed::text FROM hash_talk.community_ranking_state ORDER BY community_id',
      );
      await inspector.query(
        'UPDATE hash_talk.communities SET name=$2 WHERE id=$1',
        [community, 'Atualização isolada do ensaio'],
      );
      started = performance.now();
      await refresh();
      const affectedUpdateMs = performance.now() - started;
      const after = await inspector.query<{
        community_id: string;
        processed: string;
      }>(
        'SELECT community_id,processed::text FROM hash_talk.community_ranking_state ORDER BY community_id',
      );
      assert.equal(
        after.rows.filter(
          (row, i) => row.processed !== before.rows[i]?.processed,
        ).length,
        1,
      );
      const evidence = {
        candidates: count.rows[0]!.n,
        firstBuildMs,
        affectedUpdateMs,
        referencePerReadMs,
        publishedPerReadMs,
        ...(
          await inspector.query<{
            walGeneratedBytes: number;
            rankingRelationBytes: number;
          }>(
            `SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),$1::pg_lsn)::float8 AS "walGeneratedBytes",
          (SELECT sum(pg_total_relation_size(c.oid))::float8 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='hash_talk' AND (c.relname LIKE 'community_ranking_%' OR c.relname='community_upvote_deltas') AND c.relkind='r') AS "rankingRelationBytes"`,
            [walStart],
          )
        ).rows[0],
        observedProcessRssBytes: process.memoryUsage().rss,
        observedHeapUsedBytes: process.memoryUsage().heapUsed,
        reference:
          'seis métricas para todo o universo por leitura; comparação sintética, não benchmark da versão antiga',
        scope:
          'PostgreSQL local de testes, dados sintéticos; RSS inclui executor e fixtures, WAL inclui toda escrita local no intervalo; não comprova capacidade da VPS ou de milhões de comunidades',
      };
      await mkdir('.local', { recursive: true });
      await writeFile(
        '.local/ranking-cut8-acceptance.json',
        JSON.stringify(evidence, null, 2) + '\n',
      );
      t.diagnostic(JSON.stringify(evidence));
    },
  );
  await t.test(
    'cache tem orçamento próprio, expira cursores sob pressão e não trunca candidatos',
    async () => {
      const pool = new pg.Pool({
        connectionString: config.databaseUrl,
        max: 1,
      });
      const needed =
        Number(
          (
            await inspector.query<{ bytes: string }>(
              'SELECT (256+768*count(*))::text AS bytes FROM hash_talk.community_ranking_state',
            )
          ).rows[0]!.bytes,
        ) + (await db.communityRanking.profiles.publicationBytes(inspector));
      const previous = await page('size');
      await inspector.query(
        'UPDATE hash_talk.communities SET name=$2 WHERE id=$1',
        [community, 'Pressão sintética de cache'],
      );
      try {
        const insufficient = new CommunityRankingStore(
          pool,
          3_000_000_000,
          needed - 1,
        );
        await assert.rejects(insufficient.process(), { status: 503 });
        assert.equal((await page('size')).generation, previous.generation);
        const bounded = new CommunityRankingStore(
          pool,
          3_000_000_000,
          needed + 1024,
        );
        let next = await bounded.process();
        while (next !== null && next <= Date.now())
          next = await bounded.process();
        const current = await page('size');
        assert.notEqual(current.generation, previous.generation);
        const usage = await inspector.query<{
          used: string;
          actual: string;
        }>(`SELECT used_bytes::text AS used,
        (coalesce((SELECT sum(charge) FROM hash_talk.community_ranking_generations),0)+coalesce((SELECT sum(charge) FROM hash_talk.community_ranking_entries),0)+coalesce((SELECT sum(charge) FROM hash_talk.profile_ranking_entries),0))::text AS actual
        FROM hash_talk.community_ranking_cache_usage WHERE singleton`);
        assert.equal(usage.rows[0]!.used, usage.rows[0]!.actual);
        assert.ok(Number(usage.rows[0]!.used) <= needed + 1024);
        assert.equal(
          (
            await inspector.query<{ n: number }>(
              "SELECT count(*)::integer AS n FROM hash_talk.community_ranking_entries WHERE generation=$1 AND period='day'",
              [current.generation],
            )
          ).rows[0]!.n,
          (
            await inspector.query<{ n: number }>(
              'SELECT count(*)::integer AS n FROM hash_talk.communities',
            )
          ).rows[0]!.n,
        );
        assert.ok(previous.next);
        await assert.rejects(page('size', previous.next), { status: 409 });
      } finally {
        await pool.end();
      }
    },
  );
  await t.test(
    'returning contributors occupy distinct buckets inside the selected window',
    async () => {
      const examples = [
        { user: owner, hours: 3 },
        { user: owner, hours: 4 },
        { user: owner, hours: 25 },
        { user: owner, hours: 180 },
        { user: users[1]!, hours: 30 },
      ];
      for (const example of examples) {
        const id = crypto.randomUUID();
        await example.user.operate('post-create', {
          id: community,
          post: id,
          content: await rootPostContent(
            communities,
            community,
            'Retorno sintético',
          ),
        });
        await inspector.query(
          "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-$2*interval '1 hour' WHERE id=$1",
          [id, example.hours],
        );
      }
      await refresh();
      const stored = await inspector.query<{
        metrics: {
          day: { current: { participants: number; returning: number } };
          week: { current: { participants: number; returning: number } };
        };
      }>(
        'SELECT metrics FROM hash_talk.community_ranking_state WHERE community_id=$1',
        [community],
      );
      const metrics = stored.rows[0]!.metrics;
      assert.equal(metrics.day.current.participants, 2);
      assert.equal(metrics.day.current.returning, 1);
      assert.equal(metrics.week.current.participants, 3);
      assert.equal(metrics.week.current.returning, 1);
    },
  );
  await t.test(
    'accounts and communities share bounded, published 24h/7d/30d receipt windows',
    async () => {
      const root = crypto.randomUUID();
      await owner.operate('post-create', {
        id: community,
        post: root,
        content: await rootPostContent(
          communities,
          community,
          'Old post, recent activity',
        ),
      });
      await inspector.query(
        "UPDATE hash_talk.community_posts SET created_at=clock_timestamp()-interval '35 days' WHERE id=$1",
        [root],
      );
      const click = {
        items: [{ community, post: root, token: 'e'.repeat(32) }],
      };
      await Promise.all(
        Array.from({ length: 4 }, () => db.communityViews.shareClicks(click)),
      );
      const receipts = await inspector.query<{ n: number }>(
        'SELECT count(*)::integer AS n FROM hash_talk.community_share_clicks WHERE post_id=$1',
        [root],
      );
      assert.equal(receipts.rows[0]!.n, 1);
      const total = await inspector.query<{ n: number }>(
        'SELECT sum(shares)::integer AS n FROM hash_talk.community_post_engagement WHERE post_id=$1',
        [root],
      );
      assert.equal(total.rows[0]!.n, 1);
      await db.communityViews.observe({
        items: [{ community, post: root, token: 'f'.repeat(32) }],
      });
      await inspector.query(
        'DELETE FROM hash_talk.community_post_engagement WHERE post_id=$1',
        [root],
      );
      await refresh();
      const cached = await db.communityRanking.accountsPage('month', null);
      await inspector.query(
        `INSERT INTO hash_talk.community_post_engagement(post_id,at,views,shares)
      SELECT $1,clock_timestamp()-days*interval '1 day',views,shares FROM (VALUES(0.1,5,1),(5,7,2),(20,11,3),(31,13,4)) e(days,views,shares)`,
        [root],
      );
      // Reading a published ranking does not query/rebuild live source metrics.
      assert.deepEqual(
        await db.communityRanking.accountsPage('month', null),
        cached,
      );
      const signals = await measurePostSignals(inspector, {
        ids: [publicUsers[0]!.id],
        cutoff: new Date(),
        target: 'author',
      });
      for (const [period, views, shares] of [
        ['day', 5, 1],
        ['week', 12, 3],
        ['month', 23, 6],
      ] as const) {
        const value = signals.find((row) => row.period === period)!;
        assert.equal(value.views, views);
        assert.equal(value.shares, shares);
      }
      await refresh();
      for (const [period, views] of [
        ['day', 5],
        ['week', 12],
        ['month', 23],
      ] as const) {
        const accountsPage = await db.communityRanking.accountsPage(
          period,
          null,
        );
        const entry = accountsPage.items.find(
          (row) => row.profile.id === publicUsers[0]!.id,
        )!;
        assert.equal(entry.views, views);
        assert.equal(entry.historyComplete, false);
        const groups = explorePage(
          await communities.explore({ order: 'trending', period }, null),
        );
        assert.equal(groups.generation, accountsPage.generation);
        assert.equal(
          groups.items.find((row) => row.community.id === community)!.views,
          views,
        );
        assert.ok(!JSON.stringify(entry).includes('wallet'));
      }
      const columns = await inspector.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='community_post_engagement'",
      );
      assert.deepEqual(columns.rows.map((r) => r.column_name).sort(), [
        'at',
        'charge',
        'post_id',
        'shares',
        'views',
      ]);
      await owner.operate('post-delete', {
        id: community,
        post: root,
        revision: 1,
      });
      await refresh();
      const removed = await db.communityRanking.accountsPage('month', null);
      assert.equal(
        removed.items.find((row) => row.profile.id === publicUsers[0]!.id)
          ?.views ?? 0,
        0,
      );
    },
  );
  await t.test(
    '1,000 accounts reuse published pages and recompute only an affected author',
    async () => {
      const authors = Array.from({ length: 1000 }, () => crypto.randomUUID());
      accounts.push(...authors);
      await inspector.query(
        `INSERT INTO hash_talk.accounts(id,address) SELECT id,'0x'||lpad(replace(id::text,'-',''),40,'0') FROM unnest($1::uuid[]) id`,
        [authors],
      );
      await inspector.query(
        `INSERT INTO hash_talk.public_profiles(id,account_id,handle) SELECT id,id,'load_'||substr(replace(id::text,'-',''),1,24) FROM unnest($1::uuid[]) id`,
        [authors],
      );
      const roots = await inspector.query<{ id: string; author: string }>(
        `INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,created_at)
      SELECT gen_random_uuid(),$2,id,'Synthetic load','Synthetic only',clock_timestamp()-interval '35 days' FROM unnest($1::uuid[]) id RETURNING id,author`,
        [authors, community],
      );
      await inspector.query(
        `INSERT INTO hash_talk.community_post_engagement(post_id,at,views,shares)
      SELECT id,clock_timestamp()-interval '1 hour',10,1 FROM unnest($1::uuid[]) id`,
        [roots.rows.map((r) => r.id)],
      );
      const started = performance.now();
      await refresh();
      const firstBuildMs = performance.now() - started;
      const first = await db.communityRanking.accountsPage('month', null);
      assert.equal(first.items.length, 24);
      assert.ok(first.next);
      const second = await db.communityRanking.accountsPage(
        'month',
        first.next,
      );
      assert.equal(second.generation, first.generation);
      assert.equal(
        new Set([...first.items, ...second.items].map((r) => r.profile.id))
          .size,
        48,
      );
      await assert.rejects(
        db.communityRanking.accountsPage('week', first.next),
        { status: 400 },
      );
      const count = await inspector.query<{ n: number }>(
        "SELECT count(*)::integer AS n FROM hash_talk.profile_ranking_entries WHERE generation=$1 AND period='month' AND profile_id=ANY($2::uuid[])",
        [first.generation, authors],
      );
      assert.equal(count.rows[0]!.n, 1000);
      const before = await inspector.query<{
        profile_id: string;
        processed: string;
      }>(
        'SELECT profile_id,processed::text FROM hash_talk.profile_ranking_state ORDER BY profile_id',
      );
      const readAt = performance.now();
      for (let i = 0; i < 20; i++)
        await db.communityRanking.accountsPage('month', null);
      const publishedPerReadMs = (performance.now() - readAt) / 20;
      assert.deepEqual(
        (
          await inspector.query(
            'SELECT profile_id,processed::text FROM hash_talk.profile_ranking_state ORDER BY profile_id',
          )
        ).rows,
        before.rows,
      );
      await inspector.query(
        'UPDATE hash_talk.community_post_engagement SET views=views+1 WHERE post_id=$1',
        [roots.rows[0]!.id],
      );
      const updateAt = performance.now();
      await refresh();
      const affectedUpdateMs = performance.now() - updateAt;
      const after = await inspector.query<{
        profile_id: string;
        processed: string;
      }>(
        'SELECT profile_id,processed::text FROM hash_talk.profile_ranking_state ORDER BY profile_id',
      );
      assert.equal(
        after.rows.filter(
          (row, index) => row.processed !== before.rows[index]?.processed,
        ).length,
        1,
      );
      const evidence = {
        accounts: 1000,
        firstBuildMs,
        affectedUpdateMs,
        publishedPerReadMs,
        scope:
          'Local PostgreSQL synthetic data; no VPS capacity claim. Full snapshot publication includes communities and accounts.',
      };
      await mkdir('.local', { recursive: true });
      await writeFile(
        '.local/account-ranking-performance.json',
        JSON.stringify(evidence, null, 2) + '\n',
      );
      t.diagnostic(JSON.stringify(evidence));
    },
  );
  // Start deadline-driven work only after deterministic source/cache fixtures.
  await t.test(
    'vencimentos reais atualizam métricas e novidade sem evento nem fallback',
    async () => {
      const id = crypto.randomUUID();
      ids.push(id);
      await owner.operate('create', {
        classification: { nsfw: false, topics: ['meme'] },
        id,
        meta: { name: 'Vencimento sintético', description: '', rules: '' },
      });
      const post = crypto.randomUUID();
      await owner.operate('post-create', {
        id,
        post,
        content: await rootPostContent(communities, id, 'Expiração da janela'),
      });
      await inspector.query(
        "UPDATE hash_talk.community_posts SET created_at=date_trunc('milliseconds',clock_timestamp())-interval '24 hours'+interval '400 milliseconds' WHERE id=$1",
        [post],
      );
      await inspector.query(
        "UPDATE hash_talk.communities SET created_at=date_trunc('milliseconds',clock_timestamp())-interval '7 days'+interval '400 milliseconds' WHERE id=$1",
        [id],
      );
      await refresh();
      worker.start();
      const until = Date.now() + 3000;
      let expired = false;
      while (!expired && Date.now() < until) {
        const metrics = await inspector.query<{ expired: boolean }>(
          "SELECT (metrics->'day'->'current'->>'contributions')::integer=0 AS expired FROM hash_talk.community_ranking_state WHERE community_id=$1",
          [id],
        );
        expired = metrics.rows[0]!.expired;
        if (!expired)
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(expired, true);
      assert.ok(!(await page('new')).items.some((r) => r.community.id === id));
    },
  );
  await t.test(
    'evento confirmado acorda produtor e recuperação encontra trabalho sem sinal',
    async () => {
      await db.workSignals.start();
      worker.start();
      await inspector.query(
        'UPDATE hash_talk.communities SET name=$2 WHERE id=$1',
        [community, 'Evento confirmado'],
      );
      const until = Date.now() + 3000;
      let processed = false;
      while (!processed && Date.now() < until) {
        const result = await inspector.query<{ ready: boolean }>(
          'SELECT revision=processed AS ready FROM hash_talk.community_ranking_state WHERE community_id=$1',
          [community],
        );
        processed = result.rows[0]!.ready;
        if (!processed)
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(processed, true);
      await worker.close();
      await inspector.query(
        'UPDATE hash_talk.communities SET name=$2 WHERE id=$1',
        [community, 'Recuperação'],
      );
      const recovering = new CommunityRankingService(
        db.communityRanking,
        db.workSignals,
      );
      try {
        await recovering.flush();
      } finally {
        await recovering.close();
      }
      assert.equal(
        (
          await inspector.query<{ ready: boolean }>(
            'SELECT revision=processed AS ready FROM hash_talk.community_ranking_state WHERE community_id=$1',
            [community],
          )
        ).rows[0]!.ready,
        true,
      );
    },
  );
});
