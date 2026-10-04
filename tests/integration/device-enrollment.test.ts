import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
  aesKey,
  deviceSecrets,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import {
  emptyProfile,
  sealProfile,
} from '../../src/client/account-profile/index.ts';
import {
  canonical,
  digest,
  eventHash,
  linkProof,
  profileProof,
  sign,
} from '../../src/shared/devices/index.ts';
import {
  enrollmentBody,
  enrollmentMac,
  verifyEnrollmentMac,
} from '../../src/shared/device-enrollment/index.ts';
import { accountSession } from '../../src/shared/account/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';

await test('vinculação sem wallet, uso único, autorização automática e confirmação sensível persistida', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const database = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45119',
    signer = Wallet.createRandom();
  const account = new AccountService({
      store: database.authentication,
      origin,
    }),
    devices = new DeviceService(database.devices);
  const http = createAccountHandler({ service: account, devices, origin });
  const host = createWebServer({
    origin,
    assets: new Map(),
    database,
    objects: { healthy: () => Promise.resolve(true) },
    account: http,
  });
  let accountId: string | null = null;
  await database.migrate();
  await inspector.connect();
  await new Promise<void>((resolve) =>
    host.server.listen(45119, '127.0.0.1', resolve),
  );
  t.after(async () => {
    await host.close();
    if (accountId) {
      for (const table of [
        'device_links',
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE account_id=$1`,
          [accountId],
        );
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        accountId,
      ]);
    }
    await inspector.end();
    await database.close();
  });
  async function login(deviceId: string, previous?: string) {
    const challenge = await account.challenge({
      ecosystem: 'evm',
      address: signer.address,
      chainId: 1,
      deviceId,
    });
    return account.login(
      {
        id: challenge.id,
        signature: await signer.signMessage(challenge.message),
      },
      challenge.browserToken,
      previous,
    );
  }
  async function post(
    path: string,
    input: unknown,
    auth?: { session: AccountSession; token: string },
  ) {
    return fetch(origin + '/api/account/' + path, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(auth
          ? {
              Cookie: 'hash-talk-session=' + auth.token,
              'X-Hash-Talk-CSRF': auth.session.csrf,
            }
          : {}),
      },
      body: JSON.stringify(input),
    });
  }
  const source = await login(crypto.randomUUID());
  accountId = source.session.accountId;
  assert.equal(source.session.walletConfirmed, true);
  const identity = await createIdentity(source.session.deviceId, 'Origem'),
    recovery = await createRecovery(accountId, newSecret()),
    ring = freshKeyring(accountId);
  const genesis = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  await devices.commit(source.session, { event: genesis, profile: null });
  const payload = {
    id: crypto.randomUUID(),
    codeHash: await digest('a'.repeat(64)),
    root: await digest(canonical(genesis.root)),
    head: await eventHash(genesis),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
  const auth = { session: source.session, token: source.sessionToken };
  const created = await post(
    'devices/enrollment-create',
    {
      ...payload,
      signature: await sign(
        identity.signing,
        enrollmentBody(accountId, identity.public.id, payload),
      ),
    },
    auth,
  );
  assert.equal(created.status, 200);
  const target = await createIdentity(crypto.randomUUID(), 'Destino');
  const code = {
    version: 1 as const,
    accountId,
    id: crypto.randomUUID(),
    nonce: 'b'.repeat(64),
    expiresAt: payload.expiresAt,
    device: target.public,
  };
  const proof = await enrollmentMac('a'.repeat(64), code),
    input = {
      id: payload.id,
      codeHash: payload.codeHash,
      code,
      signature: await sign(target.signing, linkProof(code)),
      proof,
    };
  const joined = await Promise.all([
    post('enrollment-join', input),
    post('enrollment-join', input),
  ]);
  assert.deepEqual(joined.map((r) => r.status).sort(), [200, 409]);
  const result = joined.find((r) => r.status === 200)!;
  const token = result.headers
    .get('set-cookie')
    ?.match(/hash-talk-session=([a-f0-9]{64})/u)?.[1];
  assert.ok(token);
  const session = accountSession(await result.json());
  assert.equal(session.accountId, accountId);
  assert.equal(session.walletConfirmed, false);
  await assert.rejects(account.rename(token, { name: 'Antes de autorizar' }));
  const candidate = await post(
    'devices/enrollment-pending',
    { id: payload.id },
    auth,
  );
  assert.equal(candidate.status, 200);
  await verifyEnrollmentMac('a'.repeat(64), code, proof);
  const linked = await prepareEvent({
    accountId,
    previous: genesis,
    kind: 'link',
    signer: identity.public.id,
    signing: identity.signing,
    root: recovery.root,
    identities: [identity.public, target.public],
    ring,
    linkId: code.id,
    profile: null,
  });
  await devices.commit(source.session, { event: linked, profile: null });
  assert.deepEqual(await deviceSecrets(target, linked), ring);
  await account.rename(token, { name: 'Uso comum autorizado' });
  const profile = await sealProfile({
    accountId,
    revision: 1,
    key: await aesKey(ring.keys[0]!),
    profile: emptyProfile(),
  });
  await devices.saveProfile(session, {
    head: await eventHash(linked),
    profile,
    signature: await sign(
      target.signing,
      profileProof(
        accountId,
        target.public.id,
        await eventHash(linked),
        profile,
      ),
    ),
  });
  const revoked = await prepareEvent({
    accountId,
    previous: linked,
    kind: 'revoke',
    signer: target.public.id,
    signing: target.signing,
    root: recovery.root,
    identities: [target.public],
    ring: freshKeyring(accountId, ring),
    profile: null,
  });
  await assert.rejects(
    devices.commit(session, { event: revoked, profile: null }),
  );
  await assert.rejects(
    devices.commit(
      { ...session, walletConfirmed: true },
      { event: revoked, profile: null },
    ),
  );
  const confirmed = await login(target.public.id, token);
  assert.equal(confirmed.session.accountId, accountId);
  assert.equal(confirmed.session.deviceId, target.public.id);
  assert.equal(confirmed.session.walletConfirmed, true);
  await assert.rejects(account.session(token));
  // A single wallet login persists the capability for all subsequent sensitive operations.
  await database.devices.assertEnrollmentSource(
    confirmed.session,
    await eventHash(linked),
  );
  await database.devices.assertEnrollmentSource(
    confirmed.session,
    await eventHash(linked),
  );
  // Rotation requires preserving the encrypted profile as well.
  const nextRing = freshKeyring(accountId, ring);
  const nextProfile = await sealProfile({
    accountId,
    revision: 2,
    key: await aesKey(nextRing.keys[1]!),
    profile: emptyProfile(),
  });
  const final = await prepareEvent({
    accountId,
    previous: linked,
    kind: 'revoke',
    signer: identity.public.id,
    signing: identity.signing,
    root: recovery.root,
    identities: [identity.public],
    ring: nextRing,
    profile: nextProfile,
  });
  await devices.commit(source.session, { event: final, profile: nextProfile });
  await assert.rejects(account.session(confirmed.sessionToken));
  const fresh = await login(target.public.id);
  assert.equal(fresh.session.accountId, accountId);
  assert.notEqual(fresh.session.deviceId, target.public.id);
});
