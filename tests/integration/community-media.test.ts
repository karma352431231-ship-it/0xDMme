import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import {
  communityMediaPartBytes,
  communityMediaState,
} from '../../src/shared/community-media/index.ts';
import type { CommunityMediaSource } from '../../src/shared/community-media/index.ts';
import { postState } from '../../src/shared/community-posts/index.ts';
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
  await media.initialize();
  t.after(async () => {
    await host.close();
    await media.close();
    await inspector.query(
      'DELETE FROM hash_talk.community_media WHERE community_id=ANY($1::uuid[])',
      [[id, other]],
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
  await author.publicIdentity(`m9_${crypto.randomUUID().slice(0, 8)}`);
  const outsiderProfile = await outsider.publicIdentity(
    `m9_${crypto.randomUUID().slice(0, 8)}`,
  );
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
      const response = await fetch(
        `${origin}/api/account/communities/media-part`,
        {
          method: 'POST',
          headers: {
            Origin: origin,
            'Content-Type': 'application/json',
            'X-Hash-Talk-CSRF': author.login.session.csrf,
            Cookie: `hash-talk-session=${author.login.sessionToken}`,
          },
          body: JSON.stringify(await author.proof('media-part', payload)),
        },
      );
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(communityMediaState(await response.json()).received, 1);
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
