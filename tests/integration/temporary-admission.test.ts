import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import type {
  LoginChallenge,
  LoginHandoff,
} from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import { reserveOperationMemory } from '../../src/server/memory-admission/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { waitForBoundary } from '../fixtures/deferred.ts';

await test('temporary SQL admission preserves authentication beyond former global counts', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const url = new URL(config.databaseUrl),
    name =
      'hash_talk_test_temporary_' + crypto.randomUUID().replaceAll('-', ''),
    admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  await admin.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  url.pathname = '/' + name;
  const db = new Database(url.href),
    inspector = new pg.Client({ connectionString: url.href });
  const service = new AccountService({
    store: db.authentication,
    origin: 'https://0xdmme.app',
  });
  const devices = new DeviceService(db.devices);
  const prefix = crypto.randomUUID().replaceAll('-', '');
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    service.opening.close();
    await inspector.query('ROLLBACK');
    await inspector.end();
    await db.close();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  async function authorizedSource() {
    const wallet = Wallet.createRandom();
    const challenge = await service.challenge({
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const login = await service.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    const identity = await createIdentity(
      login.session.deviceId,
      'Synthetic source',
    );
    const recovery = await createRecovery(login.session.accountId, newSecret());
    const genesis = await prepareEvent({
      accountId: login.session.accountId,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: recovery.signing,
      root: recovery.root,
      identities: [identity.public],
      ring: freshKeyring(login.session.accountId),
      profile: null,
    });
    await devices.commit(login.session, { event: genesis, profile: null });
    return { session: login.session, identity: identity.public };
  }
  const source = await authorizedSource(),
    other = await authorizedSource();
  let sequence = 2000;
  function challenge(): LoginChallenge {
    return {
      id: crypto.randomUUID(),
      browserHash: prefix + String(sequence++).padStart(32, '0'),
      address: source.session.address,
      ecosystem: 'evm',
      deviceId: crypto.randomUUID(),
      message: 'Synthetic challenge',
      expiresAt: new Date(Date.now() + 300_000),
    };
  }
  function handoff(): Omit<LoginHandoff, 'address'> {
    return {
      browserHash: prefix + String(sequence++).padStart(32, '0'),
      ticketHash: prefix + String(sequence++).padStart(32, '0'),
      ecosystem: 'evm',
      deviceId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 300_000),
    };
  }
  function link() {
    return {
      id: crypto.randomUUID(),
      codeHash: prefix + String(sequence++).padStart(32, '0'),
      device: source.identity,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }
  await inspector.query(
    `INSERT INTO hash_talk.login_challenges(id,browser_hash,address,device_id,message,expires_at,ecosystem)
    SELECT gen_random_uuid(),$1||lpad(i::text,32,'0'),$2,gen_random_uuid(),'Synthetic challenge',now()+interval '5 minutes','evm'
    FROM generate_series(1,1024) i`,
    [prefix, source.session.address],
  );
  await inspector.query(
    `INSERT INTO hash_talk.login_handoffs(browser_hash,ticket_hash,ecosystem,device_id,expires_at)
    SELECT $1||lpad(i::text,32,'0'),$1||lpad(i::text,32,'0'),'evm',gen_random_uuid(),now()+interval '5 minutes'
    FROM generate_series(1,256) i`,
    [prefix],
  );
  await inspector.query(
    `INSERT INTO hash_talk.device_links(id,account_id,device_id,code_hash,device,expires_at)
    SELECT gen_random_uuid(),$1,$2,$3||lpad(i::text,32,'0'),$4,now()+interval '5 minutes'
    FROM generate_series(1,256) i`,
    [
      source.session.accountId,
      source.session.deviceId,
      prefix,
      JSON.stringify(source.identity),
    ],
  );

  await t.test(
    'new challenges, handoffs and links exceed old counts; attempts and cancellation remain enforced',
    async () => {
      const fresh = challenge(),
        returned = handoff(),
        pending = link();
      await db.authentication.createChallenge(fresh);
      await db.authentication.createHandoff(returned);
      await db.devices.createLink(source.session, pending);
      await assert.rejects(
        db.authentication.claimAttempt(fresh.id, 'wrong-browser'),
      );
      for (let attempt = 0; attempt < 3; attempt++)
        assert.equal(
          (await db.authentication.claimAttempt(fresh.id, fresh.browserHash))
            .id,
          fresh.id,
        );
      await assert.rejects(
        db.authentication.claimAttempt(fresh.id, fresh.browserHash),
      );
      assert.equal(
        (await db.authentication.handoffByTicket(returned.ticketHash))
          .browserHash,
        returned.browserHash,
      );
      await db.authentication.cancelHandoff(returned.browserHash);
      await assert.rejects(
        db.authentication.handoffByTicket(returned.ticketHash),
      );
      assert.equal(
        (await db.devices.link(source.session.accountId, pending.id)).id,
        pending.id,
      );
      await db.devices.cancelLink(source.session, pending.id);
      await assert.rejects(
        db.devices.link(source.session.accountId, pending.id),
      );
    },
  );

  await t.test(
    'former admission locks and locked expired rows cannot block independent creation',
    async () => {
      const constrainedUrl = new URL(url);
      // A valid nested-loop semi-join rescans an unmaterialized locking selector.
      // Force that plan so one batch must remain bounded independently of stats.
      constrainedUrl.searchParams.set(
        'options',
        '-c enable_hashjoin=off -c enable_mergejoin=off -c enable_hashagg=off -c enable_material=off -c enable_sort=off',
      );
      const constrained = new Database(constrainedUrl.href);
      for (const source of [
        'login_challenges',
        'login_handoffs',
        'device_links',
      ]) {
        const key = source === 'login_handoffs' ? 'browser_hash' : 'id',
          filter = source === 'device_links' ? 'code_hash' : 'browser_hash';
        const updated = await inspector.query(
          `UPDATE hash_talk.${source} SET expires_at=now()-interval '1 second'
          WHERE ${key} IN (SELECT ${key} FROM hash_talk.${source} WHERE ${filter} LIKE $1 ORDER BY ${filter} LIMIT 80)`,
          [prefix + '%'],
        );
        assert.equal(updated.rowCount, 80);
      }
      await inspector.query('BEGIN');
      try {
        for (const name of [
          'hash-talk:login-admission',
          'hash-talk:handoff-admission',
          'hash-talk:device-link-admission',
        ])
          await inspector.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            name,
          ]);
        for (const source of [
          'login_challenges',
          'login_handoffs',
          'device_links',
        ]) {
          const key = source === 'login_handoffs' ? 'browser_hash' : 'id';
          await inspector.query(
            `SELECT ${key} FROM hash_talk.${source} WHERE expires_at<=now() ORDER BY expires_at LIMIT 1 FOR UPDATE`,
          );
        }
        await waitForBoundary(
          Promise.all([
            constrained.authentication.createChallenge(challenge()),
            constrained.authentication.createHandoff(handoff()),
            constrained.devices.createLink(source.session, link()),
          ]),
        );
        for (const source of [
          'login_challenges',
          'login_handoffs',
          'device_links',
        ]) {
          const filter =
            source === 'device_links' ? 'code_hash' : 'browser_hash';
          const remaining = await inspector.query<{ total: number }>(
            `SELECT count(*)::integer AS total FROM hash_talk.${source} WHERE expires_at<=now() AND ${filter} LIKE $1`,
            [prefix + '%'],
          );
          assert.equal(
            remaining.rows[0]?.total,
            16,
            source + ' must remove one bounded batch.',
          );
        }
      } finally {
        await inspector.query('ROLLBACK');
        await constrained.close();
      }
    },
  );

  await t.test(
    'concurrent duplicate link IDs have one winner and retain account authorization',
    async () => {
      const pending = link();
      const outcomes = await Promise.allSettled([
        db.devices.createLink(source.session, pending),
        db.devices.createLink(other.session, pending),
      ]);
      assert.equal(
        outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
        1,
      );
      const rejected = outcomes.find(
        (outcome) => outcome.status === 'rejected',
      );
      assert.ok(rejected?.status === 'rejected');
      const reason: unknown = rejected.reason;
      assert.ok(reason instanceof AccountError && reason.status === 409);
      await assert.rejects(
        db.devices.createLink({ ...source.session, csrf: 'invalid' }, link()),
      );
    },
  );

  await t.test(
    'pressure and SQL failure release admission; failed handoff persistence releases opening state',
    async (t) => {
      let available = 0;
      t.mock.method(process, 'availableMemory', () => available);
      for (const request of [
        () => db.authentication.createChallenge(challenge()),
        () => db.authentication.createHandoff(handoff()),
        () => db.devices.createLink(source.session, link()),
      ])
        await assert.rejects(
          request(),
          (error: unknown) =>
            error instanceof AccountError && error.status === 429,
        );
      available = 1_048_576;
      const fresh = challenge();
      await db.authentication.createChallenge(fresh);
      await assert.rejects(db.authentication.createChallenge(fresh));
      t.mock.method(db.authentication, 'createHandoff', () =>
        Promise.reject(new Error('Synthetic persistence failure')),
      );
      await assert.rejects(
        service.startHandoff(
          {
            ecosystem: 'evm',
            deviceId: crypto.randomUUID(),
            opening: {
              receiver: source.identity.wrapping,
              wallet: 'MetaMask',
              nonce: 'a'.repeat(64),
            },
          },
          '',
        ),
      );
      const release = reserveOperationMemory(available);
      assert.ok(release);
      release();
    },
  );
});
