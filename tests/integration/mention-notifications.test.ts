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
import { mentionToken } from '../../src/shared/public-mentions/index.ts';
import { mentionNotificationPage } from '../../src/shared/mention-notifications/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';

await test('mention notifications are private, idempotent and respect edits, blocks, deletion and hidden media', async (t) => {
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
    review = crypto.randomUUID(),
    hiddenMedia = crypto.randomUUID();
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
    });
  const author = await make(),
    recipient = await make(),
    outsider = await make();
  const suffix = crypto.randomUUID().slice(0, 8);
  const actor = await author.publicIdentity('actor_' + suffix),
    target = await recipient.publicIdentity('target_' + suffix);
  await outsider.publicIdentity('other_' + suffix);
  await author.operate('create', {
    classification: { nsfw: false, topics: ['meme'] },
    id: community,
    meta: { name: 'Menções ' + suffix, description: '', rules: '' },
  });
  async function operation(
    user: typeof author,
    name: string,
    payload: Record<string, unknown>,
  ) {
    const proof = { directory: user.directory, payload };
    return profiles.operate(name, user.login.session, {
      ...proof,
      signature: await sign(
        user.identity.signing,
        publicProfileBody(
          user.login.session.accountId,
          user.login.session.deviceId,
          name,
          proof,
        ),
      ),
    });
  }
  const inbox = async (user = recipient, after: string | null = null) =>
    mentionNotificationPage(
      await operation(user, 'mention-notifications', { after }),
    );
  const tag = (await communities.tags(community, null)).items[0]!.id;
  const token = mentionToken({
    kind: 'user',
    id: target.id,
    label: target.handle,
  });
  const self = mentionToken({
    kind: 'user',
    id: actor.id,
    label: actor.handle,
  });
  const content = {
    title: 'Olá ' + token,
    text: token + ' ' + token + ' ' + self,
    tags: [tag],
  };
  await author.operate('post-create', { id: community, post, content });
  await author.operate('post-create', { id: community, post, content });
  const first = await inbox();
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]!.actor.id, actor.id);
  assert.equal(first.items[0]!.source.id, post);
  assert.equal(first.items[0]!.read, false);
  assert.equal(first.items[0]!.text.includes('(u:'), false);
  assert.equal((await inbox(author)).items.length, 0);
  assert.equal((await inbox(outsider)).items.length, 0);
  await operation(outsider, 'mention-notifications-read', {
    ids: [first.items[0]!.id],
  });
  assert.equal((await inbox()).items[0]!.read, false);
  await operation(recipient, 'mention-notifications-read', {
    ids: [first.items[0]!.id],
  });
  assert.equal((await inbox()).items[0]!.read, true);
  // Editing around an unchanged mention preserves the opened notice and arrival ID.
  await author.operate('post-edit', {
    id: community,
    post,
    revision: 1,
    content: { ...content, text: content.text + '!' },
  });
  assert.equal((await inbox()).items[0]!.id, first.items[0]!.id);
  assert.equal((await inbox()).items[0]!.read, true);
  await author.operate('post-edit', {
    id: community,
    post,
    revision: 2,
    content: { ...content, title: 'Sem menção', text: 'Alterado' },
  });
  assert.equal((await inbox()).items.length, 0);
  await author.operate('post-edit', {
    id: community,
    post,
    revision: 3,
    content,
  });
  const readded = (await inbox()).items[0]!;
  assert.notEqual(readded.id, first.items[0]!.id);
  assert.equal(readded.read, false);
  await pool.query(
    'INSERT INTO hash_talk.social_blocks(actor,target) VALUES($1,$2)',
    [target.id, actor.id],
  );
  assert.equal((await inbox()).items.length, 0);
  const blocked = crypto.randomUUID();
  await author.operate('post-create', {
    id: community,
    post: blocked,
    content,
  });
  assert.equal(
    Number(
      (
        await pool.query<{ count: string }>(
          'SELECT count(*) FROM hash_talk.public_mention_notifications WHERE source_post=$1',
          [blocked],
        )
      ).rows[0]!.count,
    ),
    0,
  );
  await pool.query(
    'UPDATE hash_talk.social_blocks SET blocked=false WHERE actor=$1 AND target=$2',
    [target.id, actor.id],
  );
  assert.equal((await inbox()).items.length, 1);
  // Rejected media suppresses the current notification projection without copied text.
  await pool.query(
    "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy,status) VALUES($1,$2,'post-media',$3,$4,'0xdmme-public-explicit-v2','pending')",
    [review, actor.id, hiddenMedia, 'a'.repeat(64)],
  );
  await pool.query(
    "UPDATE hash_talk.public_moderation SET status='rejected',model_hash=$2,runtime='fixture',frames=1,automatic_verdict='reject',completed_lease=$3 WHERE id=$1",
    [review, 'b'.repeat(64), crypto.randomUUID()],
  );
  await pool.query(
    'UPDATE hash_talk.community_posts SET media_ids=$2 WHERE id=$1',
    [post, [hiddenMedia]],
  );
  assert.equal((await inbox()).items.length, 0);
  await pool.query(
    "UPDATE hash_talk.community_posts SET media_ids='{}' WHERE id=$1",
    [post],
  );
  const reply = crypto.randomUUID();
  await author.operate('reply-create', {
    id: community,
    parent: post,
    post: reply,
    content: { title: '', text: token, tags: [] },
  });
  assert.equal(
    (await inbox()).items.find((item) => item.source.id === reply)?.source.kind,
    'reply',
  );
  await author.operate('post-delete', {
    id: community,
    post: reply,
    revision: 1,
  });
  assert.equal((await inbox()).items.length, 1);
  await author.operate('post-delete', { id: community, post, revision: 4 });
  assert.equal((await inbox()).items.length, 0);
  // The same contract applies to public profile and community descriptions.
  await operation(author, 'description', {
    revision: 0,
    description: 'Conheça ' + token,
  });
  assert.equal((await inbox()).items[0]!.source.kind, 'profile');
  await operation(author, 'description', {
    revision: 1,
    description: 'Conheça ' + token + '!',
  });
  assert.equal((await inbox()).items.length, 1);
  await operation(author, 'description', { revision: 2, description: '' });
  assert.equal((await inbox()).items.length, 0);
  await author.operate('edit', {
    id: community,
    revision: 1,
    meta: { name: 'Menções ' + suffix, description: token, rules: '' },
  });
  const communityNotice = (await inbox()).items[0]!;
  assert.equal(communityNotice.source.kind, 'community');
  assert.equal(communityNotice.source.name, 'Menções ' + suffix);
  await author.operate('edit', {
    id: community,
    revision: 2,
    meta: { name: 'Menções ' + suffix, description: '', rules: '' },
  });
  assert.equal((await inbox()).items.length, 0);
  // Read a full page with a cursor, while recipient write stays limited to explicit IDs.
  for (let index = 0; index < 26; index++)
    await author.operate('post-create', {
      id: community,
      post: crypto.randomUUID(),
      content: { ...content, title: 'Página ' + index },
    });
  const page = await inbox();
  assert.equal(page.items.length, 24);
  assert.ok(page.next);
  const next = await inbox(recipient, page.next);
  assert.equal(next.items.length, 2);
  assert.equal(next.next, null);
  assert.equal(
    new Set([...page.items, ...next.items].map((item) => item.id)).size,
    26,
  );
  // Admission is atomic: lack of capacity rolls back both source and notice.
  const usage = await pool.query<{ bytes: string }>(
    'SELECT used_bytes AS bytes FROM hash_talk.content_usage WHERE singleton',
  );
  const limited = new Database(
    config.databaseUrl,
    Number(usage.rows[0]!.bytes),
  );
  const refused = crypto.randomUUID();
  try {
    const limitedCommunities = new CommunityService(
      limited.communities,
      limited.devices,
      limited.communityPosts,
    );
    const payload = { id: community, post: refused, content };
    await assert.rejects(
      limitedCommunities.operate(
        'post-create',
        author.login.session,
        await author.proof('post-create', payload),
      ),
      { status: 503 },
    );
    assert.equal(
      (
        await pool.query(
          'SELECT id FROM hash_talk.community_posts WHERE id=$1',
          [refused],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT id FROM hash_talk.public_mention_notifications WHERE source_post=$1',
          [refused],
        )
      ).rowCount,
      0,
    );
  } finally {
    await limited.close();
  }
  const columns = await pool.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='public_mention_notifications'",
  );
  assert.equal(
    columns.rows.some((row) =>
      ['text', 'title', 'handle', 'wallet', 'account_id'].includes(
        row.column_name,
      ),
    ),
    false,
  );
});
