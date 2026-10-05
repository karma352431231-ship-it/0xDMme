import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { Representatives } from '../src/client/representatives/controller.ts';
import { signWalletStatement } from '../src/client/wallet-statements/index.ts';
import type { WalletConnection } from '../src/client/wallet/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
import { sign } from '../src/shared/devices/index.ts';
import { object } from '../src/shared/account/index.ts';
import {
  organization,
  registrationStatement,
  revocationStatement,
  credentialStatement,
  acceptanceStatement,
  representativeHash,
  verifyRepresentativeCard,
  encodeRepresentativeCard,
  decodeRepresentativeCard,
  verifyWalletStatement,
  domainName,
  domainClaim,
  domainRecord,
  domainStatement,
} from '../src/shared/representatives/index.ts';
import type {
  RepresentativeCard,
  RepresentativeIdentity,
} from '../src/shared/representatives/index.ts';
const origin = 'https://0xdmme.app';
async function fixture() {
  const issuer = Wallet.createRandom(),
    subject = Wallet.createRandom();
  const identity = (w: typeof issuer): RepresentativeIdentity => ({
    accountId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: w.address.toLowerCase(),
  });
  const org = organization({
    version: 1,
    id: crypto.randomUUID(),
    origin,
    name: 'Equipe sintética',
    issuer: identity(issuer),
  });
  const rb = {
      organizationId: org.id,
      origin,
      issuer: org.issuer,
      descriptorHash: await representativeHash(org),
    },
    registration = {
      ...rb,
      signature: await issuer.signMessage(registrationStatement(rb)),
    };
  const body = {
      version: 1 as const,
      id: crypto.randomUUID(),
      organization: org,
      registration,
      subject: identity(subject),
      scope: 'Suporte ao cliente',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    },
    credential = {
      ...body,
      signature: await issuer.signMessage(credentialStatement(body)),
    };
  const ab = {
    credentialHash: await representativeHash(credential),
    subject: credential.subject,
  };
  const card: RepresentativeCard = {
    credential,
    acceptance: {
      ...ab,
      signature: await subject.signMessage(acceptanceStatement(ab, origin)),
    },
  };
  return { issuer, subject, card };
}
await test('autorização EVM, aceite e cartão exportável preservam identidade, contexto e conteúdo exatos', async () => {
  const { card } = await fixture();
  assert.deepEqual(await verifyRepresentativeCard(card, origin), card);
  assert.deepEqual(
    decodeRepresentativeCard(encodeRepresentativeCard(card)),
    card,
  );
  assert.ok(encodeRepresentativeCard(card).length <= 4000);
  await assert.rejects(
    verifyRepresentativeCard(card, 'https://outro.example.org'),
  );
  for (const mutate of [
    (c: RepresentativeCard) => {
      c.credential.scope = 'Transferir fundos';
    },
    (c: RepresentativeCard) => {
      c.credential.expiresAt++;
    },
    (c: RepresentativeCard) => {
      c.credential.subject.accountId = crypto.randomUUID();
    },
    (c: RepresentativeCard) => {
      c.credential.organization.name = 'Marca imitada';
    },
    (c: RepresentativeCard) => {
      c.credential.id = crypto.randomUUID();
    },
    (c: RepresentativeCard) => {
      if (c.acceptance) c.acceptance.credentialHash = 'a'.repeat(64);
    },
  ]) {
    const changed = structuredClone(card);
    mutate(changed);
    await assert.rejects(verifyRepresentativeCard(changed, origin));
  }
});

await test('verificação no cliente exige estado recente e revogação assinada; falha/offline nunca viram vigente', async (t) => {
  const { card, issuer, subject } = await fixture();
  const session: AccountSession = {
    ...card.credential.subject,
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: '',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
  };
  const identity = await createIdentity(session.deviceId, 'Sintético');
  const access: VaultAccess = {
    withVault: (_offline, work) =>
      work({
        session,
        directory: 'b'.repeat(64),
        epoch: 1,
        events: [],
        offline: false,
        key: () => Promise.reject(new Error('Não usado.')),
        sign: (proof) => sign(identity.signing, proof),
      }),
    withLocalVault: () => Promise.reject(new Error('Não usado.')),
  };
  const controller = new Representatives(
    access,
    new VaultSync(access),
    (message) => subject.signMessage(message),
  );
  controller.setSession(session);
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin },
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'location');
  });
  const c = card.credential,
    hash = await representativeHash(c);
  let result: Record<string, unknown> = {
    registration: c.registration,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    revocation: null,
    checkedAt: Date.now(),
    domain: null,
  };
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => {
    assert.equal(typeof options.body, 'string');
    const body = options.body as string;
    const payload = object(object(JSON.parse(body) as unknown)['payload']);
    assert.equal(payload['hash'], hash);
    assert.ok(!body.includes(c.scope));
    return Promise.resolve(Response.json(result));
  });
  assert.match((await controller.check(card)).status, /Vigente/u);
  result = { ...result, checkedAt: Date.now() - 120000 };
  await assert.rejects(controller.check(card), /atualização/u);
  result = { ...result, checkedAt: Date.now(), expiresAt: c.expiresAt + 1 };
  await assert.rejects(controller.check(card), /divergente/u);
  const body = {
    organizationId: c.organization.id,
    id: c.id,
    credentialHash: hash,
    origin,
  };
  result = {
    ...result,
    expiresAt: c.expiresAt,
    revocation: {
      ...body,
      signature: await issuer.signMessage(revocationStatement(body)),
    },
  };
  assert.equal((await controller.check(card)).status, 'Revogada');
  result = {
    ...result,
    revocation: {
      ...body,
      credentialHash: 'c'.repeat(64),
      signature: await issuer.signMessage(revocationStatement(body)),
    },
  };
  await assert.rejects(controller.check(card), /Revogação divergente/u);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.reject(new Error('Offline')),
  );
  await assert.rejects(controller.check(card), /Offline/u);
  const accepting = controller.accept(card);
  controller.setSession({ ...session, csrf: 'c'.repeat(64) });
  await assert.rejects(accepting, /Sessão alterada/u);
  const creating = controller.create('Pedido da sessão anterior');
  controller.setSession({ ...session, csrf: 'd'.repeat(64) });
  await assert.rejects(creating, /Sessão alterada/u);
});

await test('pedido de assinatura recusa troca de wallet e sessão antes de usar o resultado', async () => {
  const { issuer, subject, card } = await fixture(),
    identity = card.credential.organization.issuer;
  const { signature: _old, ...body } = card.credential;
  void _old;
  const message = credentialStatement(body);
  let switched = false,
    cancelled = false;
  const wallet: WalletConnection = {
    id: 'synthetic',
    name: 'Sintética',
    ecosystem: 'evm',
    identity: () =>
      Promise.resolve({
        ecosystem: 'evm',
        address: switched ? subject.address : issuer.address,
        chainId: 1,
      }),
    sign: (text) => issuer.signMessage(text),
    observe: () => () => undefined,
  };
  const current = () => {
    if (cancelled) throw new Error('Sessão alterada.');
  };
  verifyWalletStatement(
    identity,
    message,
    await signWalletStatement({ wallet, identity, message, current }),
  );
  wallet.sign = async (text) => {
    const signature = await issuer.signMessage(text);
    switched = true;
    return signature;
  };
  await assert.rejects(
    signWalletStatement({ wallet, identity, message, current }),
    /Selecione/u,
  );
  switched = false;
  wallet.sign = async (text) => {
    const signature = await issuer.signMessage(text);
    cancelled = true;
    return signature;
  };
  await assert.rejects(
    signWalletStatement({ wallet, identity, message, current }),
    /Sessão alterada/u,
  );
});
await test('mensagens Solana verificadas sem depender de backend ou confundir finalidade', () => {
  const secret = ed25519.utils.randomSecretKey(),
    identity = {
      ecosystem: 'solana' as const,
      address: base58.encode(ed25519.getPublicKey(secret)),
    },
    message = '0xDMme — autorização específica sintética';
  const signature = base58.encode(
    ed25519.sign(new TextEncoder().encode(message), secret),
  );
  verifyWalletStatement(identity, message, signature);
  assert.throws(() =>
    verifyWalletStatement(identity, 'Sign in to 0xDMme', signature),
  );
  assert.throws(() =>
    verifyWalletStatement(
      { ...identity, address: base58.encode(new Uint8Array(32)) },
      message,
      signature,
    ),
  );
});
await test('desafio de domínio vincula organização, origem, código, prazo e wallet', async () => {
  const { issuer, card } = await fixture();
  const body = {
    organizationId: card.credential.organization.id,
    origin,
    domain: 'example.org',
    token: 'a'.repeat(64),
    expiresAt: Date.now() + 30 * 60_000,
  };
  const claim = domainClaim({
    ...body,
    signature: await issuer.signMessage(domainStatement(body)),
  });
  verifyWalletStatement(
    card.credential.organization.issuer,
    domainStatement(body),
    claim.signature,
  );
  for (const changed of [
    { ...body, domain: 'other.example.org' },
    { ...body, organizationId: crypto.randomUUID() },
    { ...body, expiresAt: body.expiresAt + 1 },
    { ...body, origin: 'https://other.example.org' },
  ])
    assert.throws(() =>
      verifyWalletStatement(
        card.credential.organization.issuer,
        domainStatement(changed),
        claim.signature,
      ),
    );
  assert.notEqual(
    await domainRecord(claim),
    await domainRecord({ ...claim, domain: 'other.example.org' }),
  );
  for (const name of [
    'http://example.org',
    '127.0.0.1',
    'foo.local',
    'foo..com',
    'foo.com/path',
    'foo@bar.com',
    '-foo.com',
  ])
    assert.throws(() => domainName(name));
  assert.equal(domainName(' EXAMPLE.ORG '), 'example.org');
});
