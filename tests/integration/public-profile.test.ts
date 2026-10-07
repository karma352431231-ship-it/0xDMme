import { PublicModerationService } from '../../src/server/public-moderation/index.ts';
import { publicModerationRetargeting } from '../../src/server/public-moderation/index.ts';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../../src/server/public-media/index.ts';
import { publicAvatarPath } from '../../src/shared/public-media/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import {
  PublicProfileService,
  createPublicProfileHandler,
} from '../../src/server/public-profile/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { publicModerationNotice } from '../../src/shared/public-moderation/index.ts';
import { createHash } from 'node:crypto';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';

await test('perfil público: concorrência, consentimento, sessão/aparelho, mídia restrita e reutilização após exclusão', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45118',
    account = new AccountService({ store: db.authentication, origin });
  const devices = new DeviceService(db.devices),
    publicProfiles = new PublicProfileService(db.publicProfiles, db.devices);
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    publicProfiles: createPublicProfileHandler((handle) =>
      publicProfiles.read(handle),
    ),
    account: createAccountHandler({ origin, service: account, publicProfiles }),
  });
  const accounts: string[] = [];
  const addresses: string[] = [];
  const publicOwners = new Set<string>();
  await db.migrate();
  await inspector.connect();
  const moderation = new PublicModerationService({
    profiles: db.publicProfiles,
    communities: db.communities,
  });
  t.after(async () => {
    await host.close();
    await moderation.close();
    await inspector.query(
      'DELETE FROM hash_talk.public_moderation WHERE owner=ANY($1::uuid[])',
      [[...publicOwners]],
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
    host.server.listen(45118, '127.0.0.1', resolve);
  });
  async function create() {
    const wallet = Wallet.createRandom();
    addresses.push(wallet.address.toLowerCase());
    const challenge = await account.challenge({
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const login = await account.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    accounts.push(login.session.accountId);
    const identity = await createIdentity(
        login.session.deviceId,
        'Teste público',
      ),
      recovery = await createRecovery(login.session.accountId, newSecret());
    const ring = freshKeyring(login.session.accountId);
    const event = await prepareEvent({
      accountId: login.session.accountId,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: recovery.signing,
      root: recovery.root,
      identities: [identity.public],
      ring,
      profile: null,
    });
    await devices.commit(login.session, { event, profile: null });
    const directory = await eventHash(event);
    async function proof(operation: string, payload: Record<string, unknown>) {
      const body = { directory, payload };
      return {
        ...body,
        signature: await sign(
          identity.signing,
          publicProfileBody(
            login.session.accountId,
            login.session.deviceId,
            operation,
            body,
          ),
        ),
      };
    }
    async function operate(
      operation: string,
      payload: Record<string, unknown>,
    ) {
      const result = await publicProfiles.operate(
        operation,
        login.session,
        await proof(operation, payload),
      );
      if (result && !Array.isArray(result) && 'profile' in result)
        publicOwners.add(result.profile.id);
      return result;
    }
    return {
      login,
      wallet,
      recovery,
      ring,
      identity,
      event,
      directory,
      proof,
      operate,
    };
  }
  const first = await create(),
    second = await create();
  const handle = `p_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const badStatus = (status: number) => (error: unknown) =>
    error instanceof AccountError && error.status === status;
  await t.test(
    'criação é explícita, sem copiar perfil privado; nome é único/fixo e retry preserva ID',
    async () => {
      assert.equal(await first.operate('state', {}), null);
      await assert.rejects(
        first.operate('create', { handle, consent: false }),
        badStatus(400),
      );
      await assert.rejects(
        first.operate('create', { handle: 'admin', consent: true }),
        badStatus(400),
      );
      const attempts = await Promise.allSettled([
        first.operate('create', {
          handle: handle.toUpperCase(),
          consent: true,
        }),
        second.operate('create', { handle, consent: true }),
      ]);
      assert.equal(
        attempts.filter((item) => item.status === 'fulfilled').length,
        1,
      );
      const found = attempts.find((item) => item.status === 'fulfilled');
      assert.ok(found?.status === 'fulfilled');
      const row = found.value as {
        profile: { id: string; handle: string; avatar: null };
        revision: number;
        pendingAvatar: null;
      };
      assert.equal(row.profile.handle, handle);
      assert.notEqual(row.profile.id, first.login.session.accountId);
      assert.notEqual(row.profile.id, second.login.session.accountId);
      assert.equal(row.pendingAvatar, null);
      const winner = attempts[0]?.status === 'fulfilled' ? first : second;
      assert.deepEqual(
        await winner.operate('create', { handle, consent: true }),
        row,
      );
      await assert.rejects(
        winner.operate('create', { handle: `other_${handle}`, consent: true }),
        badStatus(409),
      );
    },
  );
  const firstOwn = (await first.operate('state', {})) as {
    profile: { id: string };
  } | null;
  const owner = firstOwn ? first : second,
    other = firstOwn ? second : first;
  await t.test(
    'HTTP público lê sem conta e contém apenas o allowlist; mutações exigem origem e CSRF',
    async () => {
      const read = await fetch(
        `${origin}/api/public-profiles/${handle.toUpperCase()}`,
      );
      assert.equal(read.status, 200);
      assert.equal(read.headers.get('cache-control'), 'no-store');
      const profile = (await read.json()) as {
        id: string;
        handle: string;
        avatar: null;
      };
      assert.deepEqual(Object.keys(profile).sort(), ['avatar', 'handle', 'id']);
      assert.equal(profile.avatar, null);
      const denied = await fetch(
        `${origin}/api/account/public-profile/create`,
        {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(
            await owner.proof('create', { handle, consent: true }),
          ),
        },
      );
      assert.equal(denied.status, 401);
      await denied.text();
      for (const headers of [
        {
          Origin: 'https://wrong.example',
          'X-Hash-Talk-CSRF': owner.login.session.csrf,
        },
        { Origin: origin },
      ]) {
        const response = await fetch(
          `${origin}/api/account/public-profile/create`,
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
              Cookie: `hash-talk-session=${owner.login.sessionToken}`,
            },
            body: JSON.stringify(
              await owner.proof('create', { handle, consent: true }),
            ),
          },
        );
        assert.equal(response.status, 403);
        await response.text();
      }
      const missing = await fetch(
        `${origin}/api/public-profiles/${handle}/avatar`,
      );
      assert.equal(missing.status, 404);
      await missing.text();
      assert.equal(await other.operate('state', {}), null);
    },
  );
  await t.test(
    'mais de 240 consultas públicas e autenticadas mantêm conteúdo e isolamento entre contas',
    async () => {
      const expected = await publicProfiles.read(handle),
        readers = await Promise.all(
          [owner, other].map(async (actor) => ({
            body: JSON.stringify(await actor.proof('state', {})),
            state: await actor.operate('state', {}),
            headers: {
              Origin: origin,
              'Content-Type': 'application/json',
              'X-Hash-Talk-CSRF': actor.login.session.csrf,
              Cookie: `hash-talk-session=${actor.login.sessionToken}`,
            },
          })),
        );
      for (let attempt = 0; attempt < 300; attempt++) {
        const visible = await fetch(`${origin}/api/public-profiles/${handle}`);
        assert.equal(visible.status, 200);
        assert.deepEqual(await visible.json(), expected);
        const reader = readers[attempt % readers.length]!;
        const own = await fetch(`${origin}/api/account/public-profile/state`, {
          method: 'POST',
          headers: reader.headers,
          body: reader.body,
        });
        assert.equal(own.status, 200);
        assert.deepEqual(await own.json(), reader.state);
      }
    },
  );
  await t.test(
    'foto é candidata restrita, versionada e cobrada só na capacidade global',
    async () => {
      const png = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      const state = (await owner.operate('state', {})) as { revision: number };
      const total = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      const privateUsage = await vaultUsage(
        inspector,
        owner.login.session.accountId,
      );
      const saved = (await owner.operate('avatar', {
        revision: state.revision,
        avatar: { type: 'image/png', bytes: encode(png) },
      })) as {
        revision: number;
        pendingAvatar: { bytes: string };
        profile: { avatar: null };
      };
      assert.equal(saved.profile.avatar, null);
      assert.equal(saved.pendingAvatar.bytes, encode(png));
      const current = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      assert.equal(
        Number(current.rows[0]?.bytes) - Number(total.rows[0]?.bytes),
        png.length + 1_024,
      );
      assert.equal(
        await vaultUsage(inspector, owner.login.session.accountId),
        privateUsage,
      );
      assert.deepEqual(
        await owner.operate('avatar', {
          revision: state.revision,
          avatar: { type: 'image/png', bytes: encode(png) },
        }),
        saved,
      );
      await assert.rejects(
        owner.operate('avatar', { revision: state.revision, avatar: null }),
        badStatus(409),
      );
      const visible = await publicProfiles.read(handle);
      assert.equal(visible.avatar, null);
      assert.deepEqual(Object.keys(visible).sort(), ['avatar', 'handle', 'id']);
      await assert.rejects(
        other.operate('avatar', { revision: saved.revision, avatar: null }),
        badStatus(404),
      );
      await owner.operate('avatar', { revision: saved.revision, avatar: null });
      const limitedDb = new Database(config.databaseUrl, 0);
      try {
        const service = new PublicProfileService(
          limitedDb.publicProfiles,
          db.devices,
        );
        await assert.rejects(
          service.operate(
            'create',
            other.login.session,
            await other.proof('create', {
              handle: `z_${handle}`,
              consent: true,
            }),
          ),
          badStatus(503),
        );
      } finally {
        await limitedDb.close();
      }
      assert.equal(await other.operate('state', {}), null);
    },
  );
  await t.test(
    'avatar: análise e contestação assinadas, substituição, coleta e capacidade líquida',
    async () => {
      const png = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      const bigger = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-512.png', import.meta.url),
        ),
      );
      async function state() {
        return (await owner.operate('state', {})) as {
          revision: number;
          pendingAvatar: { bytes: string } | null;
        };
      }
      async function upload(bytes: Uint8Array) {
        const own = await state();
        await owner.operate('avatar', {
          revision: own.revision,
          avatar: { type: 'image/png', bytes: encode(bytes) },
        });
        const data = await owner.operate('moderation-notices', { after: null });
        assert.ok(Array.isArray(data));
        const notices = data.map(publicModerationNotice);
        const pending = notices.find((notice) => notice.status === 'pending');
        assert.ok(pending);
        return pending;
      }
      const first = await upload(png),
        model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' };
      const claimed = await db.publicModeration.claim(model);
      assert.ok(claimed);
      assert.equal(claimed.id, first.id);
      assert.equal(
        claimed.contentHash,
        createHash('sha256').update(png).digest('hex'),
      );
      assert.deepEqual(
        (await db.publicProfiles.moderationCandidate(claimed))?.bytes,
        png,
      );
      await db.publicModeration.finish(
        claimed,
        {
          contentHash: claimed.contentHash,
          modelHash: claimed.modelHash,
          frames: 1,
          expectedFrames: 1,
          verdict: 'hold',
        },
        (client, subject) => db.publicProfiles.bindModeration(client, subject),
      );
      const forbidden = await owner.proof('moderation-appeal', {
        id: first.id,
        reason: 'Conteúdo permitido.',
      });
      await assert.rejects(
        publicProfiles.operate('moderation-notices', owner.login.session, {
          ...forbidden,
          payload: { after: null },
        }),
        AccountError,
      );
      const outsider = await create();
      await outsider.operate('create', {
        handle: `q_${crypto.randomUUID().slice(0, 8)}`,
        consent: true,
      });
      await assert.rejects(
        outsider.operate('moderation-appeal', {
          id: first.id,
          reason: 'Outra pessoa',
        }),
        badStatus(404),
      );
      const appealResponse = await fetch(
        `${origin}/api/account/public-profile/moderation-appeal`,
        {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: `hash-talk-session=${owner.login.sessionToken}`,
            'X-Hash-Talk-CSRF': owner.login.session.csrf,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(forbidden),
        },
      );
      assert.equal(appealResponse.status, 200);
      assert.equal(
        publicModerationNotice(await appealResponse.json()).appeal,
        'Conteúdo permitido.',
      );
      await assert.rejects(
        owner.operate('moderation-review', { id: first.id, verdict: 'allow' }),
        badStatus(404),
      );
      const second = await upload(bigger),
        secondClaim = await db.publicModeration.claim(model);
      assert.ok(secondClaim);
      assert.equal(secondClaim.id, second.id);
      await db.publicModeration.finish(
        secondClaim,
        {
          contentHash: secondClaim.contentHash,
          modelHash: secondClaim.modelHash,
          frames: 1,
          expectedFrames: 1,
          verdict: 'allow',
        },
        (client, subject) => db.publicProfiles.bindModeration(client, subject),
      );
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [second.id],
      );
      await moderation.clean();
      assert.equal((await state()).pendingAvatar?.bytes, encode(bigger));
      assert.equal((await publicProfiles.read(handle)).avatar, null);
      const usage = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      assert.ok(
        bigger.length > png.length,
        'A substituição deste caso libera bytes.',
      );
      const limited = new Database(
        config.databaseUrl,
        Number(usage.rows[0]!.bytes) + 1_023,
      );
      try {
        const service = new PublicProfileService(
          limited.publicProfiles,
          db.devices,
        );
        const payload = {
          revision: (await state()).revision,
          avatar: { type: 'image/png', bytes: encode(png) },
        };
        await service.operate(
          'avatar',
          owner.login.session,
          await owner.proof('avatar', payload),
        );
      } finally {
        await limited.close();
      }
      const notices = await owner.operate('moderation-notices', {
        after: null,
      });
      assert.ok(Array.isArray(notices));
      const final = notices
        .map(publicModerationNotice)
        .find((notice) => notice.status === 'pending');
      assert.ok(final);
      const stale = await db.publicModeration.claim(model);
      assert.ok(stale);
      const replaced = await upload(bigger);
      await assert.rejects(
        db.publicModeration.finish(
          stale,
          {
            contentHash: stale.contentHash,
            modelHash: stale.modelHash,
            frames: 1,
            expectedFrames: 1,
            verdict: 'allow',
          },
          (client, subject) =>
            db.publicProfiles.bindModeration(client, subject),
        ),
        badStatus(409),
      );
      assert.equal(await db.publicProfiles.moderationCandidate(stale), null);
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [replaced.id],
      );
      const before = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      assert.equal(
        (await state()).pendingAvatar,
        null,
        'Prazo fecha a leitura antes da coleta física.',
      );
      await moderation.clean();
      assert.equal((await state()).pendingAvatar, null);
      const expired = await owner.operate('moderation-notices', {
        after: null,
      });
      assert.ok(Array.isArray(expired));
      assert.equal(
        expired
          .map(publicModerationNotice)
          .find((notice) => notice.id === replaced.id)?.status,
        'expired',
      );
      const after = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      assert.equal(
        Number(before.rows[0]!.bytes) - Number(after.rows[0]!.bytes),
        bigger.length,
      );
    },
  );
  await t.test(
    'avatar publicado: regra atual, hash e alvo; URI conhecida não libera pendente ou imagem alterada',
    async () => {
      const person = await create(),
        handle = `u_${crypto.randomUUID().slice(0, 8)}`;
      const created = await person.operate('create', { handle, consent: true });
      const profile = created as { profile: { id: string } };
      const bytes = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      await person.operate('avatar', {
        revision: 1,
        avatar: { type: 'image/png', bytes: encode(bytes) },
      });
      const notices = await person.operate('moderation-notices', {
        after: null,
      });
      assert.ok(Array.isArray(notices));
      const old = notices.map(publicModerationNotice)[0]!;
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET policy='0xdmme-public-explicit-v1' WHERE id=$1",
        [old.id],
      );
      const model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' };
      assert.equal(
        await db.publicModeration.claim(model),
        null,
        'A regra antiga não é analisada como se fosse a nova.',
      );
      assert.equal(
        await db.publicModeration.upgrade(publicModerationRetargeting(db)),
        1,
      );
      const current = await person.operate('moderation-notices', {
        after: null,
      });
      assert.ok(Array.isArray(current));
      const pending = current
        .map(publicModerationNotice)
        .find((notice) => notice.status === 'pending');
      assert.ok(pending);
      assert.notEqual(pending.id, old.id);
      assert.equal(
        pending.expiresAt,
        old.expiresAt,
        'Atualizar a regra não renova retenção.',
      );
      const accepted = new Database(config.databaseUrl, 3_000_000_000, [model]);
      const publicHost = createWebServer({
        origin: 'http://127.0.0.1:45127',
        assets: new Map(),
        database: accepted,
        objects: { healthy: () => Promise.resolve(true) },
        publicMedia: createPublicMediaHandler(
          new PublicMediaService({
            profiles: accepted.publicProfiles,
            communities: accepted.communities,
          }),
        ),
      });
      await new Promise<void>((accept, reject) => {
        publicHost.server.once('error', reject);
        publicHost.server.listen(45127, '127.0.0.1', accept);
      });
      const path = publicAvatarPath('avatar', profile.profile.id, pending.id),
        url = `http://127.0.0.1:45127${path}`;
      try {
        assert.equal((await fetch(url)).status, 404);
        const job = await db.publicModeration.claim(model);
        assert.ok(job);
        assert.equal(job.id, pending.id);
        await db.publicModeration.finish(
          job,
          { ...job, frames: 1, expectedFrames: 1, verdict: 'allow' },
          (client, subject) =>
            db.publicProfiles.bindModeration(client, subject),
        );
        assert.equal(
          (await accepted.publicProfiles.read(handle))?.avatar,
          path,
        );
        assert.equal(
          (await db.publicProfiles.read(handle))?.avatar,
          null,
          'A aplicação sem aceite do scanner permanece fechada.',
        );
        const response = await fetch(url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/png');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
        assert.equal(
          (await fetch(url, { method: 'HEAD' })).headers.get('content-length'),
          String(bytes.length),
        );
        const altered = Uint8Array.from(bytes);
        altered[altered.length - 1] = 0;
        await inspector.query(
          'UPDATE hash_talk.public_profiles SET pending_avatar=$2 WHERE id=$1',
          [profile.profile.id, altered],
        );
        assert.equal(
          (await accepted.publicProfiles.read(handle))?.avatar,
          null,
        );
        assert.equal((await fetch(url)).status, 404);
        const own = (await person.operate('state', {})) as { revision: number };
        await person.operate('avatar', {
          revision: own.revision,
          avatar: null,
        });
        assert.equal((await fetch(url)).status, 404);
      } finally {
        await publicHost.close();
        await accepted.close();
      }
    },
  );
  await t.test(
    'assinatura não pode trocar payload/contexto; sessão encerrada e aparelho revogado são recusados',
    async () => {
      const proof = await other.proof('state', {});
      await assert.rejects(
        publicProfiles.operate('create', other.login.session, {
          ...proof,
          payload: { handle: `z_${handle}`, consent: true },
        }),
        AccountError,
      );
      const old = await owner.proof('state', {});
      const challenge = await account.challenge({
        address: owner.wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
      const recovered = await account.login(
        {
          id: challenge.id,
          signature: await owner.wallet.signMessage(challenge.message),
        },
        challenge.browserToken,
      );
      const newIdentity = await createIdentity(
        recovered.session.deviceId,
        'Recuperado',
      );
      const event = await prepareEvent({
        accountId: recovered.session.accountId,
        previous: owner.event,
        kind: 'recover',
        signer: 'recovery',
        signing: owner.recovery.signing,
        root: owner.recovery.root,
        identities: [newIdentity.public],
        ring: freshKeyring(recovered.session.accountId, owner.ring),
        profile: null,
      });
      await devices.commit(recovered.session, { event, profile: null });
      await assert.rejects(
        publicProfiles.operate('state', owner.login.session, old),
        badStatus(403),
      );
      await assert.rejects(
        account.session(owner.login.sessionToken),
        badStatus(401),
      );
      const currentProof = { directory: await eventHash(event), payload: {} };
      const restored = (await publicProfiles.operate(
        'state',
        recovered.session,
        {
          ...currentProof,
          signature: await sign(
            newIdentity.signing,
            publicProfileBody(
              recovered.session.accountId,
              recovered.session.deviceId,
              'state',
              currentProof,
            ),
          ),
        },
      )) as { profile: { id: string } };
      assert.equal(restored.profile.id, (await publicProfiles.read(handle)).id);
      await account.logout(other.login.sessionToken);
      await assert.rejects(other.operate('state', {}), badStatus(401));
    },
  );
  await t.test(
    'exclusão sintética libera @, e nova conta recebe outro ID público',
    async () => {
      const previous = await publicProfiles.read(handle);
      await inspector.query(
        'DELETE FROM hash_talk.device_events WHERE account_id=$1',
        [owner.login.session.accountId],
      );
      await inspector.query(
        'DELETE FROM hash_talk.device_directories WHERE account_id=$1',
        [owner.login.session.accountId],
      );
      await inspector.query(
        'DELETE FROM hash_talk.login_sessions WHERE account_id=$1',
        [owner.login.session.accountId],
      );
      await inspector.query(
        'DELETE FROM hash_talk.login_devices WHERE account_id=$1',
        [owner.login.session.accountId],
      );
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        owner.login.session.accountId,
      ]);
      await assert.rejects(publicProfiles.read(handle), badStatus(404));
      const replacement = await create();
      const next = (await replacement.operate('create', {
        handle,
        consent: true,
      })) as { profile: { id: string } };
      assert.notEqual(next.profile.id, previous.id);
    },
  );
});
