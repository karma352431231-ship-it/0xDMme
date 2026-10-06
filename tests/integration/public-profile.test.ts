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
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    await host.close();
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
      return publicProfiles.operate(
        operation,
        login.session,
        await proof(operation, payload),
      );
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
        png.length,
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
