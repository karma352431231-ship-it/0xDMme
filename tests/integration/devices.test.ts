import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  linkProof,
  profileProof,
  sign,
  verifyHistory,
} from '../../src/shared/devices/index.ts';
import type { LinkCode } from '../../src/shared/devices/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import {
  aesKey,
  createIdentity,
  createRecovery,
  deviceSecrets,
  newSecret,
  recoverSecrets,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  remainingIdentities,
  recoveryIdentities,
} from '../../src/client/device-operations/index.ts';
import {
  emptyProfile,
  openProfile,
  sealProfile,
} from '../../src/client/account-profile/index.ts';

await test('dispositivos persistentes: login isolado, vínculo único, conflito, recuperação, autorização e HTTP', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const database = new Database(config.databaseUrl);
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45113';
  const account = new AccountService({
    store: database.authentication,
    origin,
  });
  const devices = new DeviceService(database.devices);
  const signer = Wallet.createRandom();
  const ids: string[] = [];
  const http = createAccountHandler({ service: account, devices, origin });
  const host = createWebServer({
    origin,
    assets: new Map(),
    database,
    objects: { healthy: () => Promise.resolve(true) },
    account: http,
  });
  await database.migrate();
  await inspector.connect();
  await new Promise<void>((resolve) =>
    host.server.listen(45113, '127.0.0.1', resolve),
  );
  t.after(async () => {
    await host.close();
    await inspector.query('BEGIN');
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
    await inspector.query('COMMIT');
    await inspector.end();
    await database.close();
  });
  async function login(deviceId: string = crypto.randomUUID()) {
    const challenge = await account.challenge({
      ecosystem: 'evm',
      address: signer.address,
      chainId: 1,
      deviceId,
    });
    const result = await account.login(
      {
        id: challenge.id,
        signature: await signer.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    if (!ids.includes(result.session.accountId))
      ids.push(result.session.accountId);
    return result;
  }
  async function post(
    session: AccountSession,
    auth: { token: string; csrf?: string },
    path: string,
    input: unknown,
  ) {
    return fetch(`${origin}/api/account/${path}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: `hash-talk-session=${auth.token}`,
        'X-Hash-Talk-CSRF': auth.csrf ?? session.csrf,
      },
      body: JSON.stringify(input),
    });
  }
  const first = await login();
  const firstIdentity = await createIdentity(first.session.deviceId, 'Mac A');
  const secret = newSecret();
  const recovery = await createRecovery(first.session.accountId, secret);
  const ring = freshKeyring(first.session.accountId);
  const genesis = await prepareEvent({
    accountId: first.session.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [firstIdentity.public],
    ring,
    profile: null,
  });
  await t.test(
    'perfil legado iniciado antes da configuração não atravessa a nova autorização',
    async () => {
      const profile = await sealProfile({
        accountId: first.session.accountId,
        revision: 1,
        key: await aesKey(newSecret()),
        profile: emptyProfile(),
      });
      await inspector.query('BEGIN');
      await inspector.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [first.session.accountId],
      );
      const writing = account.saveProfile(first.sessionToken, profile).then(
        () => null,
        (error: unknown) => error,
      );
      try {
        await waitForAccountLock(inspector);
        // Model initialization becoming visible while a legacy write waits.
        // The record belongs exclusively to this synthetic test identity.
        await inspector.query(
          'INSERT INTO hash_talk.device_directories (account_id,revision,head,event) VALUES ($1,$2,$3,$4)',
          [
            first.session.accountId,
            genesis.revision,
            await eventHash(genesis),
            genesis,
          ],
        );
        await inspector.query('COMMIT');
        const result = await writing;
        const stored = await account.profile(first.sessionToken);
        await inspector.query(
          'DELETE FROM hash_talk.device_directories WHERE account_id=$1',
          [first.session.accountId],
        );
        await inspector.query(
          'UPDATE hash_talk.accounts SET profile_revision=0, profile_iv=NULL, profile_ciphertext=NULL WHERE id=$1',
          [first.session.accountId],
        );
        assert.ok(
          result instanceof AccountError && result.status === 409,
          'Gravação antiga não pode atravessar a inicialização.',
        );
        assert.equal(stored, null);
      } finally {
        await inspector.query('ROLLBACK');
        await writing;
      }
    },
  );
  await devices.commit(first.session, { event: genesis, profile: null });
  const second = await login();
  const secondIdentity = await createIdentity(second.session.deviceId, 'Mac B');
  const code: LinkCode = {
    version: 1,
    id: crypto.randomUUID(),
    accountId: first.session.accountId,
    nonce: await digest(newSecret()),
    expiresAt: new Date(Date.now() + 299_000).toISOString(),
    device: secondIdentity.public,
  };
  await devices.start(second.session, {
    code,
    signature: await sign(secondIdentity.signing, linkProof(code)),
  });

  await t.test(
    'conta conectada sem chave não autoriza aparelho; código adulterado e campos secretos são recusados',
    async () => {
      assert.equal(second.session.historyAuthorized, false);
      await assert.rejects(devices.inspect(second.session, code));
      await assert.rejects(
        devices.inspect(first.session, { ...code, nonce: 'a'.repeat(64) }),
      );
      await assert.rejects(
        devices.start(second.session, {
          code,
          signature: await sign(secondIdentity.signing, linkProof(code)),
          recoverySecret: secret,
        }),
      );
      const denied = await post(
        first.session,
        { token: first.sessionToken, csrf: 'a'.repeat(64) },
        'devices/read',
        { after: 0 },
      );
      assert.equal(denied.status, 403);
      await denied.text();
      const wrongAccount = await login();
      await assert.rejects(
        devices.start(wrongAccount.session, {
          code,
          signature: await sign(secondIdentity.signing, linkProof(code)),
        }),
      );
    },
  );
  const linked = await prepareEvent({
    accountId: first.session.accountId,
    previous: genesis,
    kind: 'link',
    signer: first.session.deviceId,
    signing: firstIdentity.signing,
    root: recovery.root,
    identities: [firstIdentity.public, secondIdentity.public],
    ring,
    linkId: code.id,
    profile: null,
  });
  await t.test(
    'cancelamento e prazo assinado impedem reativar um código antigo',
    async () => {
      const target = await login();
      const identity = await createIdentity(
        target.session.deviceId,
        'Cancelado',
      );
      const cancelled: LinkCode = {
        ...code,
        id: crypto.randomUUID(),
        device: identity.public,
      };
      const request = {
        code: cancelled,
        signature: await sign(identity.signing, linkProof(cancelled)),
      };
      await devices.start(target.session, request);
      await devices.cancel(target.session, { id: cancelled.id });
      await assert.rejects(devices.inspect(first.session, cancelled));
      await assert.rejects(
        devices.start(target.session, request),
        /já utilizado/,
      );
      const expired = {
        ...cancelled,
        id: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      await assert.rejects(
        devices.start(target.session, {
          code: expired,
          signature: await sign(identity.signing, linkProof(expired)),
        }),
        /expirado/,
      );
    },
  );
  await t.test(
    'vinculação concorrente tem um único commit, e código reaproveitado falha',
    async () => {
      await devices.inspect(first.session, code);
      const results = await Promise.allSettled([
        devices.commit(first.session, { event: linked, profile: null }),
        devices.commit(first.session, { event: linked, profile: null }),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      await assert.rejects(
        devices.inspect(first.session, code),
        /já utilizado/,
      );
      await assert.rejects(
        devices.commit(first.session, { event: linked, profile: null }),
      );
      assert.deepEqual(await deviceSecrets(secondIdentity, linked), ring);
    },
  );
  const profile = emptyProfile();
  profile.preferences.readReceipts = true;
  const envelope = await sealProfile({
    profile,
    accountId: first.session.accountId,
    revision: 1,
    key: await aesKey(ring.keys[0] ?? ''),
  });
  await devices.saveProfile(first.session, {
    head: await eventHash(linked),
    profile: envelope,
    signature: await sign(
      firstIdentity.signing,
      profileProof(
        first.session.accountId,
        first.session.deviceId,
        await eventHash(linked),
        envelope,
      ),
    ),
  });
  await t.test(
    'perfil exige prova atual; login pendente e endpoint legado não podem sobrescrevê-lo',
    async () => {
      const third = await login();
      await assert.rejects(
        account.saveProfile(third.sessionToken, { ...envelope, revision: 2 }),
      );
      await assert.rejects(
        devices.saveProfile(third.session, {
          head: await eventHash(linked),
          profile: { ...envelope, revision: 2 },
          signature: linked.signature,
        }),
      );
      await assert.rejects(
        devices.saveProfile(first.session, {
          head: await eventHash(genesis),
          profile: { ...envelope, revision: 2 },
          signature: linked.signature,
        }),
      );
      assert.deepEqual(
        await openProfile({
          envelope: (await account.profile(second.sessionToken))!,
          key: await aesKey(ring.keys[0] ?? ''),
          accountId: first.session.accountId,
        }),
        profile,
      );
      const current = await database.devices.current(first.session.accountId);
      assert.ok(current);
      assert.equal(canonical(current.event).includes(secret), false);
      assert.equal(
        canonical(current.event).includes(ring.keys[0] ?? ''),
        false,
      );
    },
  );
  const rotated = freshKeyring(first.session.accountId, ring);
  const rotatedProfile = await sealProfile({
    profile,
    accountId: first.session.accountId,
    revision: 2,
    key: await aesKey(rotated.keys[1] ?? ''),
  });
  const revoked = await prepareEvent({
    accountId: first.session.accountId,
    previous: linked,
    kind: 'revoke',
    signer: first.session.deviceId,
    signing: firstIdentity.signing,
    root: recovery.root,
    identities: remainingIdentities(linked, second.session.deviceId),
    ring: rotated,
    profile: rotatedProfile,
  });
  await t.test(
    'revogação e perfil são atômicos, sessões encerram e novo segredo não abre com chave revogada',
    async () => {
      await assert.rejects(
        devices.commit(first.session, {
          event: revoked,
          profile: { ...rotatedProfile, revision: 3 },
        }),
      );
      assert.equal(
        (await database.devices.current(first.session.accountId))?.revision,
        2,
      );
      await devices.commit(first.session, {
        event: revoked,
        profile: rotatedProfile,
      });
      await assert.rejects(account.session(second.sessionToken));
      await assert.rejects(deviceSecrets(secondIdentity, revoked));
      await assert.rejects(
        openProfile({
          envelope: rotatedProfile,
          key: await aesKey(ring.keys[0] ?? ''),
          accountId: first.session.accountId,
        }),
      );
      const reauthenticated = await login(second.session.deviceId);
      await assert.rejects(
        devices.start(reauthenticated.session, {
          code,
          signature: await sign(secondIdentity.signing, linkProof(code)),
        }),
      );
      await assert.rejects(
        devices.commit(reauthenticated.session, {
          event: linked,
          profile: null,
        }),
      );
    },
  );
  await t.test('código expirado falha sem alterar diretório', async () => {
    const target = await login();
    const identity = await createIdentity(target.session.deviceId, 'Expirado');
    const pending = {
      ...code,
      id: crypto.randomUUID(),
      device: identity.public,
    };
    await devices.start(target.session, {
      code: pending,
      signature: await sign(identity.signing, linkProof(pending)),
    });
    await inspector.query(
      "UPDATE hash_talk.device_links SET expires_at=now()-interval '1 second' WHERE id=$1",
      [pending.id],
    );
    const event = await prepareEvent({
      accountId: first.session.accountId,
      previous: revoked,
      kind: 'link',
      signer: first.session.deviceId,
      signing: firstIdentity.signing,
      root: recovery.root,
      identities: [firstIdentity.public, identity.public],
      ring: rotated,
      linkId: pending.id,
      profile: null,
    });
    await assert.rejects(
      devices.commit(first.session, { event, profile: null }),
    );
    assert.equal(
      (await database.devices.current(first.session.accountId))?.revision,
      3,
    );
  });
  let previous = revoked;
  const active = [{ logged: first, identity: firstIdentity }];
  for (const choice of ['nenhum', 'alguns', 'todos'] as const) {
    await t.test(
      `recuperação limpa revoga ${choice}: sessões e novas chaves seguem a escolha`,
      async () => {
        const clean = await login();
        const identity = await createIdentity(
          clean.session.deviceId,
          'Mac recuperado',
        );
        await assert.rejects(recoverSecrets(previous, newSecret()));
        const restored = await recoverSecrets(previous, secret);
        const next = freshKeyring(clean.session.accountId, restored.ring);
        const selected =
          choice === 'nenhum'
            ? []
            : choice === 'alguns'
              ? [active[0]!.identity.public.id]
              : active.map((item) => item.identity.public.id);
        const preserved = await sealProfile({
          profile,
          accountId: clean.session.accountId,
          revision: previous.revision,
          key: await aesKey(next.keys.at(-1) ?? ''),
        });
        const event = await prepareEvent({
          accountId: clean.session.accountId,
          previous,
          kind: 'recover',
          signer: 'recovery',
          signing: restored.signing,
          root: recovery.root,
          identities: [
            ...recoveryIdentities(previous, selected),
            identity.public,
          ],
          ring: next,
          profile: preserved,
        });
        // A valid root signature cannot recover into another session's device.
        await assert.rejects(
          devices.commit(first.session, { event, profile: preserved }),
        );
        const result = await post(
          clean.session,
          { token: clean.sessionToken },
          'devices/commit',
          { event, profile: preserved },
        );
        assert.equal(result.status, 200);
        await result.text();
        for (const item of active) {
          if (selected.includes(item.identity.public.id)) {
            await assert.rejects(account.session(item.logged.sessionToken));
            await assert.rejects(deviceSecrets(item.identity, event));
          } else {
            assert.equal(
              (await account.session(item.logged.sessionToken)).deviceId,
              item.identity.public.id,
            );
            assert.deepEqual(await deviceSecrets(item.identity, event), next);
          }
        }
        assert.deepEqual(await deviceSecrets(identity, event), next);
        await assert.rejects(
          devices.commit(clean.session, { event, profile: preserved }),
        );
        const reopened = new Database(config.databaseUrl);
        try {
          const persisted = await reopened.devices.page(
            clean.session.accountId,
            0,
          );
          assert.equal(
            (await verifyHistory(persisted, clean.session.accountId))?.revision,
            event.revision,
          );
          assert.deepEqual((await recoverSecrets(event, secret)).ring, next);
          const saved = await account.profile(clean.sessionToken);
          assert.ok(saved);
          assert.deepEqual(
            await openProfile({
              envelope: saved,
              key: await aesKey(next.keys.at(-1) ?? ''),
              accountId: clean.session.accountId,
            }),
            profile,
          );
        } finally {
          await reopened.close();
        }
        for (let index = active.length - 1; index >= 0; index -= 1)
          if (selected.includes(active[index]!.identity.public.id))
            active.splice(index, 1);
        active.push({ logged: clean, identity });
        previous = event;
      },
    );
  }
  await t.test(
    'o fluxo de autoridade também se vincula a uma conta Solana',
    async () => {
      const key = ed25519.utils.randomPrivateKey();
      const address = base58.encode(ed25519.getPublicKey(key));
      const challenge = await account.challenge({
        ecosystem: 'solana',
        address,
        chainId: 'solana:mainnet',
        deviceId: crypto.randomUUID(),
      });
      const logged = await account.login(
        {
          id: challenge.id,
          signature: base58.encode(
            ed25519.sign(new TextEncoder().encode(challenge.message), key),
          ),
        },
        challenge.browserToken,
      );
      ids.push(logged.session.accountId);
      const identity = await createIdentity(logged.session.deviceId, 'Solana');
      const root = await createRecovery(logged.session.accountId, newSecret());
      const event = await prepareEvent({
        accountId: logged.session.accountId,
        previous: null,
        kind: 'initialize',
        signer: 'recovery',
        signing: root.signing,
        root: root.root,
        identities: [identity.public],
        ring: freshKeyring(logged.session.accountId),
        profile: null,
      });
      await devices.commit(logged.session, { event, profile: null });
      assert.equal(
        (await database.devices.current(logged.session.accountId))?.revision,
        1,
      );
    },
  );
});

async function waitForAccountLock(inspector: pg.Client): Promise<void> {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    await inspector.query('SELECT pg_stat_clear_snapshot()');
    const result = await inspector.query(
      "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='hash-talk' AND wait_event_type='Lock' AND query LIKE '%hash_talk.accounts%'",
    );
    if (result.rowCount) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Gravação concorrente não aguardou o lock de configuração.');
}
