import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { get } from 'node:http';
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
  recoveryTransfer,
  recoveryMessage,
  transferContext,
} from '../../src/shared/wallet-recovery/index.ts';
import { canonical, identityOf } from '../../src/shared/devices/index.ts';
import {
  createWalletRecovery,
  walletRecoveryKey,
} from '../../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
  sealTo,
  openFrom,
  recoverSecrets,
  deviceSecrets,
  signEvent,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';

await test('PostgreSQL/HTTP: migração autorizada e retorno cifrado preservam dados e isolam sessões', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const database = new Database(config.databaseUrl);
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45118';
  const accounts = new AccountService({
    store: database.authentication,
    origin,
  });
  const devices = new DeviceService(database.devices, origin);
  const document = new TextEncoder().encode(
    '<!doctype html><title>Recuperação privada</title>',
  );
  const host = createWebServer({
    origin,
    assets: new Map(),
    database,
    objects: { healthy: () => Promise.resolve(true) },
    account: createAccountHandler({
      origin,
      service: accounts,
      devices,
      recoveryDocument: document,
    }),
  });
  await database.migrate();
  await inspector.connect();
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45118, '127.0.0.1', resolve);
  });
  const ids: string[] = [];
  t.after(async () => {
    await host.close();
    for (const table of [
      'device_links',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [ids],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.end();
    await database.close();
  });
  const signer = Wallet.createRandom();
  async function login(
    wallet: Pick<Wallet, 'address' | 'signMessage'> = signer,
  ) {
    const challenge = await accounts.challenge({
      ecosystem: 'evm',
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const result = await accounts.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    if (!ids.includes(result.session.accountId))
      ids.push(result.session.accountId);
    return result;
  }
  const first = await login();
  const pending = await login();
  const outsider = await login(new Wallet(`0x${'2'.padStart(64, '0')}`));
  function post(
    path: string,
    input: unknown,
    auth: typeof first = first,
    csrf = auth.session.csrf,
  ) {
    return fetch(`${origin}/api/account/${path}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: `hash-talk-session=${auth.sessionToken}`,
        'X-Hash-Talk-CSRF': csrf,
      },
      body: JSON.stringify(input),
    });
  }
  const identity = await createIdentity(first.session.deviceId, 'A');
  const receiver = await createIdentity(pending.session.deviceId, 'B');
  const oldCode = newSecret();
  const old = await createRecovery(first.session.accountId, oldCode);
  const oldRing = freshKeyring(first.session.accountId);
  const initial = await prepareEvent({
    accountId: first.session.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: old.signing,
    root: old.root,
    identities: [identity.public],
    ring: oldRing,
    profile: null,
  });
  assert.equal(
    (await post('devices/commit', { event: initial, profile: null })).status,
    200,
  );
  const recovery = createWalletRecovery(first.session, origin);
  const signatures = [
    await signer.signMessage(recoveryMessage(recovery)),
    await signer.signMessage(recoveryMessage(recovery)),
  ];
  const key = await walletRecoveryKey(recovery, signatures);
  const authority = await createRecovery(
    first.session.accountId,
    key,
    recovery,
  );
  const ring = freshKeyring(
    first.session.accountId,
    (await recoverSecrets(initial, oldCode)).ring,
  );
  const migration = await prepareEvent({
    accountId: first.session.accountId,
    previous: initial,
    kind: 'migrate',
    signer: 'recovery',
    signing: old.signing,
    root: authority.root,
    identities: initial.devices.map(identityOf),
    ring,
    profile: null,
  });
  await t.test(
    'somente aparelho autorizado migra, com assinatura antiga e vínculo à conta/origem',
    async () => {
      assert.equal(
        (
          await post(
            'devices/commit',
            { event: migration, profile: null },
            pending,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await post(
            'devices/commit',
            { event: migration, profile: null },
            first,
            'b'.repeat(64),
          )
        ).status,
        403,
      );
      const otherConfig = { ...recovery, origin: 'https://other.example' };
      const otherKey = await walletRecoveryKey(otherConfig, [
        await signer.signMessage(recoveryMessage(otherConfig)),
      ]);
      const otherRoot = await createRecovery(
        first.session.accountId,
        otherKey,
        otherConfig,
      );
      const invalid = await prepareEvent({
        accountId: first.session.accountId,
        previous: initial,
        kind: 'migrate',
        signer: 'recovery',
        signing: old.signing,
        root: otherRoot.root,
        identities: [identity.public],
        ring,
        profile: null,
      });
      assert.equal(
        (await post('devices/commit', { event: invalid, profile: null }))
          .status,
        403,
      );
      assert.equal(
        (await post('devices/commit', { event: migration, profile: null }))
          .status,
        200,
      );
      assert.deepEqual(await deviceSecrets(identity, migration), ring);
      assert.deepEqual((await recoverSecrets(migration, key)).ring, ring);
      await assert.rejects(recoverSecrets(migration, oldCode));
    },
  );
  await t.test(
    'mobile recebe página própria e envia apenas envelope; original exige cookie/CSRF e uso único',
    async () => {
      const input = {
        wallet: 'MetaMask',
        config: recovery,
        receiver: receiver.public.wrapping,
        count: 1,
      };
      assert.equal(
        (await post('recovery-start', input, pending, 'b'.repeat(64))).status,
        403,
      );
      const response = await post('recovery-start', input, pending);
      assert.equal(response.status, 200);
      const receipt = (await response.json()) as {
        ticket: string;
        commitment: string;
      };
      const entry = { ticket: receipt.ticket, commitment: receipt.commitment };
      const url = `${origin}/recovery-entry/${entry.ticket}/${entry.commitment}`;
      const page = await new Promise<{
        status: number | undefined;
        headers: import('node:http').IncomingHttpHeaders;
      }>((resolve, reject) => {
        get(
          url,
          {
            headers: {
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Site': 'cross-site',
            },
          },
          (response) => {
            response.resume();
            response.on('end', () =>
              resolve({
                status: response.statusCode,
                headers: response.headers,
              }),
            );
          },
        ).on('error', reject);
      });
      assert.equal(page.status, 200);
      assert.equal(page.headers['cache-control'], 'no-store');
      assert.equal(page.headers['set-cookie'], undefined);
      assert.equal((await fetch(`${url}?destination=evil`)).status, 404);
      const request = await fetch(`${origin}/api/account/recovery-request`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const transfer = recoveryTransfer(
        ((await request.json()) as { transfer: unknown }).transfer,
      );
      assert.equal(canonical(transfer).includes(signatures[0] ?? ''), false);
      const envelope = await sealTo(
        transfer.receiver,
        { signatures: [signatures[0]] },
        transferContext(transfer),
      );
      const submission = await fetch(`${origin}/api/account/recovery-submit`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, envelope }),
      });
      assert.equal(submission.status, 200);
      assert.equal(submission.headers.get('set-cookie'), null);
      assert.equal((await post('recovery-take', entry, first)).status, 403);
      assert.equal((await post('recovery-take', entry, outsider)).status, 403);
      assert.equal(
        (await post('recovery-take', entry, pending, 'b'.repeat(64))).status,
        403,
      );
      const taken = await post('recovery-take', entry, pending);
      const body = (await taken.json()) as { envelope: typeof envelope };
      assert.deepEqual(
        await openFrom(
          receiver.wrapping,
          body.envelope,
          transferContext(transfer),
        ),
        { signatures: [signatures[0]] },
      );
      assert.equal((await post('recovery-take', entry, pending)).status, 409);
      assert.equal(
        (await post('recovery-submit', { ...entry, envelope }, pending)).status,
        409,
      );
    },
  );
  await t.test(
    'nova instância do serviço recupera histórico; autoridade antiga não assina novos eventos',
    async () => {
      const restored = await recoverSecrets(
        migration,
        await walletRecoveryKey(recovery, [signatures[0] ?? '']),
      );
      const recoveredRing = freshKeyring(
        first.session.accountId,
        restored.ring,
      );
      const event = await prepareEvent({
        accountId: first.session.accountId,
        previous: migration,
        kind: 'recover',
        signer: 'recovery',
        signing: restored.signing,
        root: migration.root,
        identities: [identity.public, receiver.public],
        ring: recoveredRing,
        profile: null,
      });
      assert.equal(
        (
          await post(
            'devices/commit',
            { event: await signEvent(event, old.signing), profile: null },
            pending,
          )
        ).status,
        409,
      );
      assert.equal(
        (await post('devices/commit', { event, profile: null }, pending))
          .status,
        200,
      );
      assert.deepEqual(await deviceSecrets(receiver, event), recoveredRing);
      assert.deepEqual(
        recoveredRing.keys.slice(0, oldRing.epoch),
        oldRing.keys,
      );
      assert.equal(
        (
          await new DeviceService(database.devices, origin).read(
            pending.session,
            { after: 0 },
          )
        ).revision,
        3,
      );
    },
  );
});
