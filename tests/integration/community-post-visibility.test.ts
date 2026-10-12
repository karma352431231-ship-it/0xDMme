import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { publicModerationPolicy } from '../../src/shared/public-moderation/index.ts';
import { feedFilter } from '../../src/shared/community-discovery/index.ts';

await test('bloqueio automático retira post e atividade derivada, preenche a paginação e conserva o registro após coleta', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  await db.migrate();
  const account = crypto.randomUUID(),
    author = crypto.randomUUID(),
    community = crypto.randomUUID(),
    post = crypto.randomUUID(),
    reply = crypto.randomUUID(),
    media = crypto.randomUUID(),
    review = crypto.randomUUID(),
    handle = `visibility_${author.slice(0, 8)}`;
  t.after(async () => {
    try {
      await pool.query(
        'DELETE FROM hash_talk.public_moderation WHERE owner=$1',
        [author],
      );
      await pool.query(
        'DELETE FROM hash_talk.community_posts WHERE community_id=$1',
        [community],
      );
      await pool.query('DELETE FROM hash_talk.communities WHERE id=$1', [
        community,
      ]);
      await pool.query('DELETE FROM hash_talk.accounts WHERE id=$1', [account]);
    } finally {
      await pool.end();
      await db.close();
    }
  });
  await pool.query('INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)', [
    account,
    `0x${randomBytes(20).toString('hex')}`,
  ]);
  await pool.query(
    'INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,$3)',
    [author, account, handle],
  );
  await pool.query(
    "INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,'Teste de visibilidade','','')",
    [community, author],
  );
  await pool.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,media_ids) VALUES($1,$2,$3,'Título restrito','Texto restrito',$4)",
    [post, community, author, [media]],
  );
  await pool.query(
    "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text,parent_id,root_id) VALUES($1,$2,$3,'','Resposta ao original',$4,$4)",
    [reply, community, author, post],
  );
  for (let index = 0; index < 25; index++)
    await pool.query(
      "INSERT INTO hash_talk.community_posts(id,community_id,author,title,text) VALUES($1,$2,$3,'','Post permitido')",
      [crypto.randomUUID(), community, author],
    );
  await pool.query(
    "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy) VALUES($1,$2,'post-media',$3,$4,$5)",
    [review, author, media, 'a'.repeat(64), publicModerationPolicy],
  );
  const filter = feedFilter({
    scope: 'all',
    order: 'recent',
    period: 'all',
    community,
    tag: null,
  });
  const summary = () => db.profileSocial.summary(handle);
  const activity = async () =>
    (
      await pool.query<{ contributions: number }>(
        'SELECT contributions FROM hash_talk.community_discussion_participants WHERE post_id=$1 AND profile_id=$2',
        [post, author],
      )
    ).rows[0]?.contributions ?? 0;
  // Block a reply independently: its contribution must no longer boost its parent.
  const replyMedia = crypto.randomUUID(),
    replyReview = crypto.randomUUID();
  await pool.query(
    'UPDATE hash_talk.community_posts SET media_ids=$2 WHERE id=$1',
    [reply, [replyMedia]],
  );
  await pool.query(
    "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy) VALUES($1,$2,'post-media',$3,$4,$5)",
    [replyReview, author, replyMedia, 'c'.repeat(64), publicModerationPolicy],
  );
  assert.equal(await activity(), 1);
  await pool.query(
    "UPDATE hash_talk.public_moderation SET status='held',model_hash=$2,runtime='fixture',frames=1,automatic_verdict='hold',completed_lease=$3 WHERE id=$1",
    [replyReview, 'd'.repeat(64), crypto.randomUUID()],
  );
  assert.equal(await activity(), 0);
  assert.equal(
    (
      await db.communityPosts.discussion(community, post, {
        order: 'votes',
        after: null,
      })
    ).items.length,
    0,
  );
  await pool.query(
    "UPDATE hash_talk.community_posts SET media_ids='{}' WHERE id=$1",
    [reply],
  );
  assert.equal(await activity(), 1);
  assert.equal((await summary()).posts, 26);
  for (const status of [
    'rejected',
    'held',
    'failed',
    'discarding',
    'expired',
  ]) {
    const verdict = status === 'held' ? 'hold' : 'reject';
    await pool.query(
      "UPDATE hash_talk.public_moderation SET status=$2,model_hash=$3,runtime='fixture',frames=1,automatic_verdict=$4,completed_lease=$5 WHERE id=$1",
      [review, status, 'b'.repeat(64), verdict, crypto.randomUUID()],
    );
    const publicPost = await db.communityPosts.read(community, post);
    assert.equal(publicPost.status, 'removed');
    assert.equal(publicPost.title, '');
    assert.equal(publicPost.text, '');
    assert.equal(publicPost.author, null);
    assert.equal(
      (await db.communityPosts.read(community, reply)).status,
      'removed',
    );
    const page = await db.communityPosts.list(community, null, null);
    assert.equal(page.items.length, 24);
    assert.ok(page.next);
    assert.equal(
      page.items.some((item) => item.id === post),
      false,
    );
    const feed = await db.communityDiscovery.feed(filter, null);
    assert.equal(feed.items.length, 24);
    const next = await db.communityDiscovery.feed(filter, feed.next);
    assert.equal(next.items.length, 1);
    const metrics = await summary();
    assert.equal(metrics.posts, 25);
    assert.equal(metrics.replies, 0);
    assert.equal(
      (
        await db.communityDiscovery.profileActivity(author, 'overview', null)
      ).items.some((item) => item.post.id === post || item.post.id === reply),
      false,
    );
  }
  // A new policy/review cannot reopen a previous refusal before approval.
  const recheck = crypto.randomUUID();
  await pool.query(
    "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy,created_at,expires_at) VALUES($1,$2,'post-media',$3,$4,$5,now(),now()+interval '7 days')",
    [recheck, author, media, 'a'.repeat(64), publicModerationPolicy],
  );
  assert.equal(
    (await db.communityPosts.read(community, post)).status,
    'removed',
  );
  await pool.query(
    "UPDATE hash_talk.public_moderation SET status='approved',model_hash=$2,runtime='fixture',frames=1,automatic_verdict='allow',completed_lease=$3 WHERE id=$1",
    [recheck, 'b'.repeat(64), crypto.randomUUID()],
  );
  assert.equal(
    (await db.communityPosts.read(community, post)).status,
    'visible',
  );
  // Replacing the refused attachment also restores the text without deleting governance records.
  await pool.query('DELETE FROM hash_talk.public_moderation WHERE id=$1', [
    recheck,
  ]);
  await pool.query(
    "UPDATE hash_talk.community_posts SET media_ids='{}' WHERE id=$1",
    [post],
  );
  assert.equal(
    (await db.communityPosts.read(community, post)).status,
    'visible',
  );
  assert.equal((await summary()).posts, 26);
});
