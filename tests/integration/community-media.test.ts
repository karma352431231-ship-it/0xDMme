import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  readFile,
  rm,
  realpath,
  writeFile,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import {
  communityMediaLimits,
  communityMediaPartBytes,
  communityMediaState,
} from '../../src/shared/community-media/index.ts';
import type { CommunityMediaSource } from '../../src/shared/community-media/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
import type { CommunityPost } from '../../src/shared/community-posts/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { CommunityMediaService } from '../../src/server/community-media/index.ts';
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
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import {
  publicModerationNotice,
  publicModerationRetentionMs,
} from '../../src/shared/public-moderation/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../../src/server/public-media/index.ts';
import { publicPostMediaPath } from '../../src/shared/public-media/index.ts';
import { feedFilter } from '../../src/shared/community-discovery/index.ts';
import {
  PublicModerationScanner,
  PublicModerationWorker,
  publicModerationBinding,
} from '../../src/server/public-moderation/index.ts';
import { readMediaRuntime } from '../../src/server/community-media/index.ts';

function firstMedia(post: CommunityPost | undefined): string | undefined {
  return post?.media?.[0]?.id;
}

await test('mídia das comunidades: cadeia real, autorização, vínculo atômico, capacidade e limpeza', async (t) => {
  const ffmpeg = process.env['HASH_TALK_MEDIA_FFMPEG'],
    ffprobe = process.env['HASH_TALK_MEDIA_FFPROBE'];
  if (!ffmpeg || !ffprobe) {
    t.skip(
      'Configure os executáveis FFmpeg/ffprobe para a integração real. CI configura ambos.',
    );
    return;
  }
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  const root = await realpath(
      await mkdtemp(join(tmpdir(), '0xdmme-community-integration-')),
    ),
    db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const media = new CommunityMediaService({
    store: db.communityMedia,
    directory: root,
    environment: process.env,
  });
  const origin = 'http://127.0.0.1:45125',
    account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices);
  const communities = new CommunityService(
    db.communities,
    db.devices,
    db.communityPosts,
    { media },
  );
  const accounts: string[] = [],
    addresses: string[] = [],
    publicOwners: string[] = [],
    id = crypto.randomUUID(),
    other = crypto.randomUUID();
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      post: (id, post) => communities.post(id, post),
    }),
    account: createAccountHandler({ origin, service: account, communities }),
  });
  await db.migrate();
  await inspector.connect();
  assert.equal(
    (
      await inspector.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM hash_talk.community_media',
      )
    ).rows[0]?.count,
    0,
    'Esta fixture usa outro diretório de objetos; isole o banco de mídia antes do teste.',
  );
  await media.initialize();
  t.after(async () => {
    await host.close();
    await media.close();
    await inspector.query(
      'DELETE FROM hash_talk.community_media WHERE community_id=ANY($1::uuid[])',
      [[id, other]],
    );
    await inspector.query(
      'DELETE FROM hash_talk.public_moderation WHERE owner=ANY($1::uuid[])',
      [publicOwners],
    );
    await inspector.query(
      'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
      [[id, other]],
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
    await rm(root, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45125, '127.0.0.1', resolve);
  });
  const make = () =>
      createCommunityAccount({
        account,
        devices,
        profiles,
        communities,
        accounts,
        addresses,
      }),
    author = await make(),
    outsider = await make();
  const authorProfile = await author.publicIdentity(
    `m9_${crypto.randomUUID().slice(0, 8)}`,
  );
  const outsiderProfile = await outsider.publicIdentity(
    `m9_${crypto.randomUUID().slice(0, 8)}`,
  );
  publicOwners.push(authorProfile.id, outsiderProfile.id);
  for (const community of [id, other])
    await author.operate('create', {
      id: community,
      meta: { name: 'Mídia sintética', description: '', rules: '' },
    });
  const run = promisify(execFile),
    photo = join(root, 'fixture.png'),
    gif = join(root, 'fixture.gif'),
    video = join(root, 'fixture.mp4');
  await run(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=red:s=64x64',
    '-frames:v',
    '1',
    photo,
  ]);
  await run(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=96x64:r=20:d=1',
    '-vf',
    'format=rgb8',
    gif,
  ]);
  await run(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=320x240:r=60:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '4',
    '-c:a',
    'aac',
    '-shortest',
    video,
  ]);
  const bytes = await readFile(photo);
  const descriptor = (
    kind: CommunityMediaSource['kind'],
    data: Uint8Array,
  ): CommunityMediaSource => ({
    id: crypto.randomUUID(),
    kind,
    bytes: data.length,
    hash: createHash('sha256').update(data).digest('hex'),
  });
  const input = descriptor('photo', bytes),
    bad = (status: number) => (error: unknown) =>
      error instanceof AccountError && error.status === status;
  const state = (media: string) =>
    author.operate('media-status', { id, media }).then(communityMediaState);
  const reserve = (source: CommunityMediaSource) =>
    author.operate('media-reserve', { id, source }).then(communityMediaState);
  async function httpOperation(
    actor: typeof author,
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(
      `${origin}/api/account/communities/${operation}`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-Hash-Talk-CSRF': actor.login.session.csrf,
          Cookie: `hash-talk-session=${actor.login.sessionToken}`,
        },
        body: JSON.stringify(await actor.proof(operation, payload)),
      },
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  async function ready(source: CommunityMediaSource, data: Uint8Array) {
    await reserve(source);
    for (
      let index = 0;
      index < Math.ceil(data.length / communityMediaPartBytes);
      index++
    )
      await author.operate('media-part', {
        id,
        media: source.id,
        index,
        bytes: encode(
          data.subarray(
            index * communityMediaPartBytes,
            (index + 1) * communityMediaPartBytes,
          ),
        ),
      });
    await author.operate('media-finish', { id, media: source.id });
    let current = await state(source.id);
    const deadline = Date.now() + 15000;
    while (current.status === 'processing' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      current = await state(source.id);
    }
    assert.equal(
      current.status,
      'ready',
      current.error ?? 'Preparação incompleta',
    );
    return current;
  }
  const usage = () => vaultUsage(inspector, author.login.session.accountId),
    before = await usage();
  const post = crypto.randomUUID();
  await t.test(
    'upload e preparação por HTTP, reenvio idempotente e leituras restritas',
    async () => {
      await reserve(input);
      await reserve(input);
      const payload = { id, media: input.id, index: 0, bytes: encode(bytes) };
      const response = await httpOperation(author, 'media-part', payload);
      assert.equal(communityMediaState(response).received, 1);
      await author.operate('media-part', payload);
      await assert.rejects(
        author.operate('media-part', {
          ...payload,
          bytes: encode(Buffer.alloc(bytes.length, 1)),
        }),
        bad(409),
      );
      await assert.rejects(
        outsider.operate('media-status', { id, media: input.id }),
        bad(404),
      );
      const current = await ready(input, bytes);
      assert.equal(current.result?.width, 64);
      assert.ok(current.result?.thumbnailBytes);
      const result = await author.operate('media-get', {
        id,
        media: input.id,
        index: 0,
        thumbnail: false,
      });
      assert.ok(result);
      const thumb = await author.operate('media-get', {
        id,
        media: input.id,
        index: 0,
        thumbnail: true,
      });
      assert.ok(thumb);
      const anonymous = await fetch(
        `${origin}/api/communities/${id}/media/${input.id}`,
      );
      assert.equal(anonymous.status, 404);
      assert.equal(await usage(), before);
    },
  );
  await t.test(
    'HTTP transfere 100 MB em 382 partes e outro usuário no mesmo endereço sem teto de 60 pedidos',
    async () => {
      // Synthetic bytes exercise durable transport, without decoding a fake video.
      const data = Buffer.alloc(communityMediaLimits.video.source, 9),
        candidate = descriptor('video', data),
        second = descriptor('photo', bytes),
        parts = Math.ceil(data.length / communityMediaPartBytes);
      await httpOperation(author, 'media-reserve', { id, source: candidate });
      for (let index = 0; index < parts; index++) {
        const result = await httpOperation(author, 'media-part', {
          id,
          media: candidate.id,
          index,
          bytes: encode(
            data.subarray(
              index * communityMediaPartBytes,
              (index + 1) * communityMediaPartBytes,
            ),
          ),
        });
        assert.equal(communityMediaState(result).received, index + 1);
      }
      await httpOperation(outsider, 'media-reserve', { id, source: second });
      const received = await httpOperation(outsider, 'media-part', {
        id,
        media: second.id,
        index: 0,
        bytes: encode(bytes),
      });
      assert.equal(communityMediaState(received).received, 1);
      await httpOperation(author, 'media-cancel', { id, media: candidate.id });
      await httpOperation(outsider, 'media-cancel', { id, media: second.id });
      await media.clean();
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.community_media WHERE id=ANY($1::uuid[])',
            [[candidate.id, second.id]],
          )
        ).rowCount,
        0,
      );
      assert.equal(await usage(), before);
    },
  );
  await t.test(
    'post sem legenda, retries e nenhuma referência/URL/miniatura pública',
    async () => {
      const content = { title: '', text: '', tag: null, media: [input.id] };
      const created = postState(
        await author.operate('post-create', { id, post, content }),
      );
      assert.deepEqual(created.content?.media, [input.id]);
      await author.operate('post-create', { id, post, content });
      await author.operate('role', {
        id,
        revision: (await communities.read(id)).revision,
        target: outsiderProfile.id,
        moderator: true,
      });
      const review = postState(
        await outsider.operate('post-state', { id, post }),
      );
      assert.equal(review.manager, true);
      assert.equal(review.content, null);
      await author.operate('post-edit', {
        id,
        post,
        revision: created.post.revision,
        content: { ...content, text: 'Legenda sintética' },
      });
      const captionReview = postState(
        await outsider.operate('post-state', { id, post }),
      );
      assert.equal(captionReview.content?.text, 'Legenda sintética');
      assert.equal(captionReview.content?.media, undefined);
      await author.operate('role', {
        id,
        revision: (await communities.read(id)).revision,
        target: outsiderProfile.id,
        moderator: false,
      });
      const value = JSON.stringify(await communities.post(id, post));
      for (const privateValue of [
        input.id,
        input.hash,
        'thumbnailBytes',
        'media_ids',
      ])
        assert.equal(value.includes(privateValue), false);
      await assert.rejects(
        outsider.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content,
        }),
        bad(403),
      );
      await assert.rejects(
        author.operate('post-create', {
          id: other,
          post: crypto.randomUUID(),
          content,
        }),
        bad(403),
      );
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content: { ...content, media: [input.id, input.id] },
        }),
        bad(400),
      );
    },
  );
  await t.test(
    'GIFs e vídeo reais; conjuntos, substituição e replies usam o contrato comum',
    async () => {
      const animation = await readFile(gif),
        clip = await readFile(video);
      const gifs = await Promise.all(
        Array.from({ length: 3 }, () =>
          Promise.resolve(descriptor('gif', animation)),
        ),
      );
      for (const item of gifs) await ready(item, animation);
      const reply = crypto.randomUUID();
      await author.operate('reply-create', {
        id,
        parent: post,
        post: reply,
        content: {
          title: '',
          text: '',
          tag: null,
          media: gifs.map((r) => r.id),
        },
      });
      const current = await state(gifs[0]!.id);
      assert.equal(current.result?.seconds, 1);
      assert.equal(current.result?.fps, 20);
      const item = descriptor('video', clip),
        prepared = await ready(item, clip);
      assert.equal(prepared.result?.fps, 30);
      assert.equal(prepared.result?.type, 'video/mp4');
      const revision = (await communities.post(id, post)).revision;
      await assert.rejects(
        author.operate('post-edit', {
          id,
          post,
          revision,
          content: {
            title: '',
            text: 'Teste',
            tag: null,
            media: [input.id, item.id],
          },
        }),
        bad(400),
      );
      const changed = postState(
        await author.operate('post-edit', {
          id,
          post,
          revision,
          content: { title: '', text: '', tag: null, media: [item.id] },
        }),
      );
      await media.clean();
      assert.equal((await state(item.id)).status, 'attached');
      await assert.rejects(state(input.id), bad(404));
      await author.operate('post-delete', {
        id,
        post,
        revision: changed.post.revision,
      });
      await media.clean();
      await assert.rejects(state(item.id), bad(404));
      assert.equal(await usage(), before);
    },
  );
  await t.test(
    'expiração limpa somente uploads não vinculados; falha nunca fica pronta',
    async () => {
      const invalid = descriptor(
        'photo',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      );
      await reserve(invalid);
      await author.operate('media-part', {
        id,
        media: invalid.id,
        index: 0,
        bytes: encode(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      });
      await author.operate('media-finish', { id, media: invalid.id });
      let failed = await state(invalid.id);
      while (failed.status === 'processing') {
        await new Promise((resolve) => setTimeout(resolve, 25));
        failed = await state(invalid.id);
      }
      assert.equal(failed.status, 'uploading');
      assert.ok(failed.error);
      assert.equal(failed.result, null);
      await inspector.query(
        "UPDATE hash_talk.community_media SET expires_at=now()-interval '1 day' WHERE community_id=$1",
        [id],
      );
      await media.clean();
      await assert.rejects(state(invalid.id), bad(404));
      const attached = await inspector.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM hash_talk.community_media WHERE community_id=$1 AND status='attached'",
        [id],
      );
      assert.equal(attached.rows[0]?.count, 3);
    },
  );
  await t.test(
    'análise vincula resultado e miniatura; descarte exige remoção física e preserva texto/links e aprovados',
    async () => {
      const attached = await inspector.query<{
        id: string;
        post_id: string;
        moderation_review: string;
        created_at: Date;
      }>(
        "SELECT id,post_id,moderation_review,created_at FROM hash_talk.community_media WHERE community_id=$1 AND status='attached' ORDER BY id",
        [id],
      );
      assert.equal(attached.rows.length, 3);
      const model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' },
        jobs = [];
      for (let i = 0; i < 3; i++) {
        const job = await db.publicModeration.claim(model);
        assert.ok(job);
        const candidate = await db.communityMedia.moderationCandidate(job);
        assert.ok(candidate);
        const row = attached.rows.find((item) => item.id === job.target);
        assert.ok(row);
        assert.equal(job.owner, authorProfile.id);
        assert.equal(job.id, row.moderation_review);
        assert.equal(
          candidate.resultHash,
          createHash('sha256')
            .update(
              await readFile(
                join(root, 'community-media', candidate.id, 'result'),
              ),
            )
            .digest('hex'),
        );
        assert.equal(
          candidate.thumbnailHash,
          createHash('sha256')
            .update(
              await readFile(
                join(root, 'community-media', candidate.id, 'thumbnail'),
              ),
            )
            .digest('hex'),
        );
        const stored = await inspector.query<{
          created_at: Date;
          expires_at: Date;
        }>(
          'SELECT created_at,expires_at FROM hash_talk.public_moderation WHERE id=$1',
          [job.id],
        );
        assert.equal(
          stored.rows[0]!.created_at.getTime(),
          row.created_at.getTime(),
        );
        assert.equal(
          stored.rows[0]!.expires_at.getTime() - row.created_at.getTime(),
          publicModerationRetentionMs,
        );
        await db.publicModeration.finish(
          job,
          {
            ...job,
            frames: 21,
            expectedFrames: 21,
            verdict: i === 0 ? 'hold' : 'allow',
          },
          (client, review) => db.communityMedia.bindModeration(client, review),
        );
        jobs.push(job);
      }
      const held = jobs[0]!,
        approved = jobs[1]!;
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=ANY($1::uuid[])",
        [[held.id, approved.id]],
      );
      const failure = join(root, 'community-media', held.target, 'unexpected');
      await writeFile(failure, 'fixture de falha');
      const globalUsage = async () =>
        Number(
          (
            await inspector.query<{ bytes: string }>(
              'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
            )
          ).rows[0]!.bytes,
        );
      const before = await globalUsage(),
        charge = Number(
          (
            await inspector.query<{ charge: string }>(
              'SELECT charge::text AS charge FROM hash_talk.community_media WHERE id=$1',
              [held.target],
            )
          ).rows[0]!.charge,
        );
      await assert.rejects(media.clean(), /Objeto irregular/);
      assert.equal(await globalUsage(), before);
      assert.equal(
        (
          await inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.public_moderation WHERE id=$1',
            [held.id],
          )
        ).rows[0]!.status,
        'discarding',
      );
      await unlink(failure);
      await media.clean();
      assert.equal(before - (await globalUsage()), charge);
      await assert.rejects(state(held.target), bad(404));
      await assert.rejects(
        reserve({ ...descriptor('gif', await readFile(gif)), id: held.target }),
        bad(409),
      );
      assert.equal((await state(approved.target)).status, 'attached');
      const body = { directory: author.directory, payload: { after: null } };
      const notices = await profiles.operate(
        'moderation-notices',
        author.login.session,
        {
          ...body,
          signature: await sign(
            author.identity.signing,
            publicProfileBody(
              author.login.session.accountId,
              author.login.session.deviceId,
              'moderation-notices',
              body,
            ),
          ),
        },
      );
      assert.equal(
        notices.map(publicModerationNotice).find((item) => item.id === held.id)
          ?.status,
        'expired',
      );
      const reply = attached.rows[0]!.post_id,
        current = postState(
          await author.operate('post-state', { id, post: reply }),
        );
      assert.ok(current.content);
      const edited = postState(
        await author.operate('post-edit', {
          id,
          post: reply,
          revision: current.post.revision,
          content: {
            ...current.content,
            text: 'Texto preservado após o descarte.',
          },
        }),
      );
      assert.equal(edited.content?.text, 'Texto preservado após o descarte.');
      assert.equal(
        (await communities.post(id, reply)).text,
        'Texto preservado após o descarte.',
      );
      assert.equal(
        JSON.stringify(await communities.post(id, reply)).includes(
          approved.target,
        ),
        false,
      );
    },
  );
  await t.test(
    'mídia aprovada é pública em posts, replies e feed; ocultação, corrupção e exclusão fecham os bytes',
    async () => {
      const model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' },
        accepted = new Database(config.databaseUrl, 3_000_000_000, [model]),
        clip = descriptor('video', await readFile(video)),
        animation = descriptor('gif', await readFile(gif)),
        rootPost = crypto.randomUUID(),
        reply = crypto.randomUUID();
      const publicOrigin = 'http://127.0.0.1:45128';
      const publicHost = createWebServer({
        origin: publicOrigin,
        assets: new Map(),
        database: accepted,
        objects: { healthy: () => Promise.resolve(true) },
        publicMedia: createPublicMediaHandler(
          new PublicMediaService(
            {
              profiles: accepted.publicProfiles,
              communities: accepted.communities,
              media: accepted.communityMedia,
            },
            root,
          ),
        ),
        communities: createCommunityHandler({
          read: (id) => accepted.communities.read(id),
          list: (after) => accepted.communities.list(after),
          post: (community, id) => accepted.communityPosts.read(community, id),
          postPage: (community, after, tag) =>
            accepted.communityPosts.list(community, after, tag),
          replies: (community, parent, after) =>
            accepted.communityPosts.replies(community, parent, after),
          feed: (filter, after) =>
            accepted.communityDiscovery.feed(filter, after),
        }),
      });
      try {
        await new Promise<void>((resolve, reject) => {
          publicHost.server.once('error', reject);
          publicHost.server.listen(45128, '127.0.0.1', resolve);
        });
        await ready(clip, await readFile(video));
        await author.operate('post-create', {
          id,
          post: rootPost,
          content: {
            title: 'Vídeo sintético',
            text: 'Legenda',
            tag: null,
            media: [clip.id],
          },
        });
        await ready(animation, await readFile(gif));
        await author.operate('reply-create', {
          id,
          post: reply,
          parent: rootPost,
          content: {
            title: '',
            text: 'Resposta',
            tag: null,
            media: [animation.id],
          },
        });
        const reviews = await inspector.query<{ id: string; target: string }>(
          "SELECT id,target FROM hash_talk.public_moderation WHERE target=ANY($1::uuid[]) AND status='pending'",
          [[clip.id, animation.id]],
        );
        assert.equal(reviews.rows.length, 2);
        for (const job of reviews.rows) {
          assert.equal(
            (
              await fetch(
                publicOrigin +
                  `/api/public-media/post-media/${job.target}/${job.id}`,
              )
            ).status,
            404,
          );
        }
        const runtime = readMediaRuntime(process.env);
        assert.ok(runtime);
        const scanner = new PublicModerationScanner({
          runtime,
          directory: root,
          candidates: {
            avatar: () => Promise.resolve(null),
            media: (job) => db.communityMedia.moderationCandidate(job),
          },
          detector: {
            model,
            size: 32,
            classify: (frames) =>
              Promise.resolve(frames.map(() => 'allow' as const)),
          },
        });
        const worker = new PublicModerationWorker({
          queue: db.publicModeration,
          bind: publicModerationBinding(db),
          runner: scanner,
        });
        try {
          await worker.run();
        } finally {
          await worker.close();
        }
        const scanned = await inspector.query<{
          frames: number;
          status: string;
        }>(
          'SELECT frames,status FROM hash_talk.public_moderation WHERE id=ANY($1::uuid[]) ORDER BY frames',
          [reviews.rows.map((job) => job.id)],
        );
        assert.deepEqual(scanned.rows, [
          { frames: 21, status: 'approved' },
          { frames: 61, status: 'approved' },
        ]);
        const visible = await accepted.communityPosts.read(id, rootPost),
          published = visible.media?.[0];
        assert.ok(published);
        assert.equal(published.id, clip.id);
        assert.equal(
          (await communities.post(id, rootPost)).media,
          undefined,
          'O aplicativo não aceita o modelo simulado.',
        );
        assert.equal(
          firstMedia(
            (await accepted.communityPosts.list(id, null, null)).items.find(
              (p) => p.id === rootPost,
            ),
          ),
          clip.id,
        );
        assert.equal(
          firstMedia(
            (
              await accepted.communityPosts.replies(id, rootPost, null)
            ).items.find((p) => p.id === reply),
          ),
          animation.id,
        );
        const filter = feedFilter({
            scope: 'all',
            order: 'recent',
            period: 'all',
            community: id,
            tag: null,
          }),
          feed = await accepted.communityDiscovery.feed(filter, null);
        assert.equal(
          firstMedia(feed.items.find((p) => p.post.id === rootPost)?.post),
          clip.id,
        );
        const content = await readFile(
            join(root, 'community-media', clip.id, 'result'),
          ),
          path = publicPostMediaPath(published),
          download = await fetch(publicOrigin + path);
        assert.equal(download.status, 200);
        assert.equal(download.headers.get('Cache-Control'), 'no-store');
        assert.equal(download.headers.get('Content-Type'), 'video/mp4');
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
        // ON DELETE SET NULL removes the uploader link; accepted public bytes/history remain.
        await inspector.query(
          'UPDATE hash_talk.community_media SET author=NULL WHERE id=$1',
          [clip.id],
        );
        assert.equal((await fetch(publicOrigin + path)).status, 200);
        assert.equal(
          firstMedia(await accepted.communityPosts.read(id, rootPost)),
          clip.id,
        );
        await inspector.query(
          'UPDATE hash_talk.community_media SET author=$2 WHERE id=$1',
          [clip.id, authorProfile.id],
        );
        const head = await fetch(publicOrigin + path, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(
          Number(head.headers.get('Content-Length')),
          content.length,
        );
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        const thumb = await fetch(
          publicOrigin + publicPostMediaPath(published, true),
        );
        assert.equal(thumb.status, 200);
        assert.equal(thumb.headers.get('Content-Type'), 'image/png');
        assert.deepEqual(
          Buffer.from(await thumb.arrayBuffer()),
          await readFile(join(root, 'community-media', clip.id, 'thumbnail')),
        );
        const corrupted = Buffer.from(content);
        corrupted[0] = corrupted[0]! ^ 1;
        await writeFile(
          join(root, 'community-media', clip.id, 'result'),
          corrupted,
        );
        assert.equal((await fetch(publicOrigin + path)).status, 503);
        await writeFile(
          join(root, 'community-media', clip.id, 'result'),
          content,
        );
        const removal = crypto.randomUUID();
        await author.operate('post-hide', {
          id,
          post: rootPost,
          revision: visible.revision,
          record: removal,
          reason: 'Ensaio local.',
        });
        assert.equal((await fetch(publicOrigin + path)).status, 404);
        assert.equal(
          (await accepted.communityPosts.read(id, rootPost)).media,
          undefined,
        );
        await author.operate('post-decide', {
          id,
          post: rootPost,
          revision: (await communities.post(id, rootPost)).revision,
          record: removal,
          decision: 'Restaurado no ensaio.',
          restore: true,
        });
        assert.equal((await fetch(publicOrigin + path)).status, 200);
        for (const post of [rootPost, reply])
          await author.operate('post-delete', {
            id,
            post,
            revision: (await communities.post(id, post)).revision,
          });
        assert.equal((await fetch(publicOrigin + path)).status, 404);
        await media.clean();
        assert.equal((await fetch(publicOrigin + path)).status, 404);
      } finally {
        await publicHost.close();
        await accepted.close();
      }
    },
  );
  await t.test(
    'reserva recusa falta de capacidade com rollback e libera somente após coleta',
    async () => {
      const usage = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      const limited = new Database(
        config.databaseUrl,
        Number(usage.rows[0]!.bytes) + 10,
      );
      try {
        const authority = {
            session: author.login.session,
            directory: author.directory,
          },
          candidate = descriptor('video', await readFile(video));
        await assert.rejects(
          limited.communityMedia.reserve(authority, id, candidate),
          bad(503),
        );
        assert.equal(
          (
            await inspector.query(
              'SELECT 1 FROM hash_talk.community_media WHERE id=$1',
              [candidate.id],
            )
          ).rowCount,
          0,
        );
      } finally {
        await limited.close();
      }
    },
  );
  await t.test(
    'partes persistidas retomam após interrupção e cancelamento coleta sem aceitar mídia',
    async () => {
      const data = Buffer.alloc(communityMediaPartBytes + 100, 9),
        candidate = descriptor('video', data);
      await reserve(candidate);
      const authority = {
        session: author.login.session,
        directory: author.directory,
      };
      const lease = await db.communityMedia.begin(authority, {
        community: id,
        id: candidate.id,
        index: 0,
        hash: createHash('sha256')
          .update(data.subarray(0, communityMediaPartBytes))
          .digest('hex'),
      });
      assert.ok(lease.writer);
      await db.communityMedia.resumeInterrupted();
      await author.operate('media-part', {
        id,
        media: candidate.id,
        index: 0,
        bytes: encode(data.subarray(0, communityMediaPartBytes)),
      });
      assert.equal((await state(candidate.id)).received, 1);
      await assert.rejects(
        author.operate('media-finish', { id, media: candidate.id }),
        bad(409),
      );
      await author.operate('media-part', {
        id,
        media: candidate.id,
        index: 1,
        bytes: encode(data.subarray(communityMediaPartBytes)),
      });
      assert.equal((await state(candidate.id)).received, 2);
      await author.operate('media-cancel', { id, media: candidate.id });
      await assert.rejects(state(candidate.id), bad(404));
    },
  );
  await t.test(
    'aparelho revogado entre escrita e confirmação não confirma bytes',
    async () => {
      const candidate = descriptor('photo', bytes);
      await reserve(candidate);
      const authority = {
        session: author.login.session,
        directory: author.directory,
      };
      const lease = await db.communityMedia.begin(authority, {
        community: id,
        id: candidate.id,
        index: 0,
        hash: candidate.hash,
      });
      assert.ok(lease.writer);
      await inspector.query(
        'DELETE FROM hash_talk.login_sessions WHERE account_id=$1',
        [author.login.session.accountId],
      );
      await assert.rejects(
        db.communityMedia.part(authority, {
          community: id,
          id: candidate.id,
          writer: lease.writer,
          hash: candidate.hash,
        }),
        /Sessão encerrada ou expirada/u,
      );
      await db.communityMedia.release(candidate.id, lease.writer);
      assert.equal(
        (
          await inspector.query<{ count: number }>(
            'SELECT cardinality(received) AS count FROM hash_talk.community_media WHERE id=$1',
            [candidate.id],
          )
        ).rows[0]?.count,
        0,
      );
    },
  );
});
