import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { RepresentativeService } from '../../src/server/representatives/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { object } from '../../src/shared/account/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { groupParticipant } from '../fixtures/group-participant.ts';
import {
  organization,
  registrationStatement,
  representativeHash,
  domainStatement,
  domainClaim,
  revocationStatement,
  credentialStatement,
} from '../../src/shared/representatives/index.ts';
const origin = 'http://127.0.0.1:45119';
await test('organizações/autorizações privadas: ownership, revogação persistente, DNS, concorrência e cota', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await inspector.connect();
  const accounts = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    ids: string[] = [];
  const records = new Map<string, string>();
  let fail = false;
  const representatives = new RepresentativeService(
    db.representatives,
    {
      matches: (domain, record) => {
        if (fail) return Promise.reject(new Error('DNS indisponível'));
        return Promise.resolve(records.get(domain) === record);
      },
    },
    origin,
  );
  const messages = new MessageService(db, db.devices, undefined, {
    representatives,
  });
  t.after(async () => {
    await inspector.query('BEGIN');
    for (const table of [
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
    await messages.close();
    await db.close();
  });
  async function user() {
    const wallet = Wallet.createRandom(),
      challenge = await accounts.challenge({
        ecosystem: 'evm',
        address: wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
    const login = await accounts.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    ids.push(login.session.accountId);
    const participant = await groupParticipant({
      accountId: login.session.accountId,
      deviceId: login.session.deviceId,
    });
    await devices.commit(login.session, {
      event: participant.directory,
      profile: null,
    });
    return { ...participant, session: login.session, wallet };
  }
  type User = Awaited<ReturnType<typeof user>>;
  async function api(
    u: User,
    op: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const proof = { deviceId: u.deviceId, directory: u.head, payload };
    return messages.operate(op, u.session, {
      ...proof,
      signature: await sign(
        u.signing,
        messageBody(u.accountId, u.deviceId, op, proof),
      ),
    });
  }
  const owner = await user(),
    other = await user();
  const issuer = {
    accountId: owner.accountId,
    ecosystem: 'evm' as const,
    address: owner.session.address,
  };
  const org = organization({
    version: 1,
    id: crypto.randomUUID(),
    origin,
    name: 'Nome privado sintético',
    issuer,
  });
  const rb = {
      organizationId: org.id,
      origin,
      issuer,
      descriptorHash: await representativeHash(org),
    },
    registration = {
      ...rb,
      signature: await owner.wallet.signMessage(registrationStatement(rb)),
    };
  await api(owner, 'organization-register', { registration });
  await api(owner, 'organization-register', { registration });
  await assert.rejects(api(other, 'organization-register', { registration }));
  const cb = {
    version: 1 as const,
    id: crypto.randomUUID(),
    organization: org,
    registration,
    subject: {
      accountId: other.accountId,
      ecosystem: 'evm' as const,
      address: other.session.address,
    },
    scope: 'Escopo privado sintético',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
  };
  const credential = {
    ...cb,
    signature: await owner.wallet.signMessage(credentialStatement(cb)),
  };
  const receipt = {
    id: credential.id,
    organizationId: org.id,
    hash: await representativeHash(credential),
    issuedAt: cb.issuedAt,
    expiresAt: cb.expiresAt,
  };
  await assert.rejects(api(other, 'representative-register', receipt));
  const concurrent = await Promise.allSettled([
    api(owner, 'representative-register', receipt),
    api(owner, 'representative-register', receipt),
  ]);
  assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 2);
  await assert.rejects(
    api(owner, 'representative-register', {
      ...receipt,
      expiresAt: receipt.expiresAt + 1,
    }),
  );
  const row = await inspector.query<{ registration: string }>(
    'SELECT registration::text FROM hash_talk.organizations WHERE id=$1',
    [org.id],
  );
  const storedRegistration = row.rows[0];
  assert.ok(storedRegistration);
  assert.ok(!storedRegistration.registration.includes(org.name));
  const saved = await inspector.query(
    'SELECT * FROM hash_talk.representative_credentials WHERE id=$1',
    [cb.id],
  );
  assert.equal(saved.rowCount, 1);
  assert.ok(!JSON.stringify(saved.rows).includes(cb.scope));
  assert.ok(!JSON.stringify(saved.rows).includes(other.session.address));
  await assert.rejects(
    api(other, 'representative-status', {
      id: cb.id,
      organizationId: org.id,
      hash: 'a'.repeat(64),
    }),
  );
  const challenge = object(
    await api(owner, 'organization-domain-challenge', {
      organizationId: org.id,
      domain: 'example.org',
    }),
  );
  const claim = domainClaim({
    ...challenge,
    signature: await owner.wallet.signMessage(
      domainStatement(
        challenge as unknown as Omit<
          ReturnType<typeof domainClaim>,
          'signature'
        >,
      ),
    ),
  });
  await assert.rejects(api(other, 'organization-domain-bind', { claim }));
  const bound = object(await api(owner, 'organization-domain-bind', { claim }));
  records.set('example.org', String(bound['value']));
  assert.equal(
    object(
      await api(owner, 'organization-domain-verify', {
        organizationId: org.id,
      }),
    )['verified'],
    true,
  );
  let state = object(
    await api(other, 'representative-status', {
      id: cb.id,
      organizationId: org.id,
      hash: receipt.hash,
    }),
  );
  assert.ok(object(state['domain'])['verifiedAt']);
  fail = true;
  await assert.rejects(
    api(owner, 'organization-domain-verify', { organizationId: org.id }),
  );
  state = object(
    await api(other, 'representative-status', {
      id: cb.id,
      organizationId: org.id,
      hash: receipt.hash,
    }),
  );
  assert.equal(object(state['domain'])['verifiedAt'], null);
  fail = false;
  const rev = {
      organizationId: org.id,
      id: cb.id,
      credentialHash: receipt.hash,
      origin,
    },
    proof = {
      ...rev,
      signature: await owner.wallet.signMessage(revocationStatement(rev)),
    };
  await assert.rejects(
    api(other, 'representative-revoke', { revocation: proof }),
  );
  const full = new Database(config.databaseUrl, 0);
  const limited = new MessageService(full, full.devices, undefined, {
    representatives: new RepresentativeService(
      full.representatives,
      { matches: () => Promise.resolve(false) },
      origin,
    ),
  });
  const signed = async (op: string, payload: Record<string, unknown>) => {
    const request = {
      deviceId: owner.deviceId,
      directory: owner.head,
      payload,
    };
    return limited.operate(op, owner.session, {
      ...request,
      signature: await sign(
        owner.signing,
        messageBody(owner.accountId, owner.deviceId, op, request),
      ),
    });
  };
  try {
    await assert.rejects(
      signed('representative-register', {
        ...receipt,
        id: crypto.randomUUID(),
      }),
      /Capacidade global/,
    );
    await signed('representative-register', receipt);
    await signed('representative-revoke', { revocation: proof });
  } finally {
    await limited.close();
    await full.close();
  }
  await api(owner, 'representative-revoke', { revocation: proof });
  await api(owner, 'representative-revoke', { revocation: proof });
  await api(owner, 'representative-register', receipt);
  state = object(
    await api(other, 'representative-status', {
      id: cb.id,
      organizationId: org.id,
      hash: receipt.hash,
    }),
  );
  assert.deepEqual(state['revocation'], proof);
  await assert.rejects(
    api(owner, 'organization-domain-bind', {
      claim: { ...claim, expiresAt: Date.now() - 1 },
    }),
  );
});
