import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58 } from '@scure/base';
import {
  addressBookEntry,
  contactBody,
  contactProof,
  invitationLink,
  readInvitation,
  walletContact,
  walletContactFromAddress,
} from '../src/shared/contacts/index.ts';
import { readQrPayload, qrMatrix } from '../src/client/device-qr/index.ts';
import { walletEntity } from '../src/client/contacts/agenda.ts';
import { contactDraft } from '../src/client/contacts/contact-draft.ts';
import { checkPinnedIdentity } from '../src/client/contacts/controller.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import { sign, verify, eventHash } from '../src/shared/devices/index.ts';
import {
  sealBlock,
  openBlock,
  sealCommit,
  openManifest,
} from '../src/client/vault-crypto/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
const accountId = crypto.randomUUID(),
  deviceId = crypto.randomUUID();
const wallet = { ecosystem: 'evm' as const, address: '0x' + 'a'.repeat(40) };
const entry = {
  version: 1 as const,
  ...wallet,
  alias: 'Apelido só meu',
  accountId: null,
  identity: null,
  directory: null,
  identityRevision: 0,
  removed: false,
};
await test('wallet drafts record their source and keep matching contact identity without copying it to another wallet', () => {
  const fresh = contactDraft({
    address: wallet.address,
    alias: 'Local',
    reference: null,
  });
  assert.equal(fresh.version, 2);
  assert.equal(fresh.addedVia, 'wallet');
  const invited = addressBookEntry({
    ...entry,
    version: 2,
    addedVia: 'invite',
    accountId,
  });
  assert.deepEqual(
    contactDraft({
      address: invited.address,
      alias: 'Edited',
      reference: invited,
    }),
    { ...invited, alias: 'Edited' },
  );
  const different = contactDraft({
    address: '0x' + 'b'.repeat(40),
    alias: 'New',
    reference: invited,
  });
  assert.equal(different.addedVia, 'wallet');
  assert.equal(different.accountId, null);
  assert.deepEqual(
    contactDraft({ address: entry.address, alias: 'Legacy', reference: entry }),
    { ...entry, alias: 'Legacy' },
  );
});
await test('new encrypted contact records validate their source without retaining invitation secrets or rewriting legacy entries', () => {
  assert.deepEqual(addressBookEntry(entry), entry);
  for (const addedVia of ['wallet', 'invite']) {
    const contact = { ...entry, version: 2, addedVia };
    assert.deepEqual(addressBookEntry(contact), contact);
    assert.throws(() => addressBookEntry({ ...contact, token: 'secret' }));
    assert.throws(() => addressBookEntry({ ...contact, invite: 'secret' }));
  }
  assert.throws(() => addressBookEntry({ ...entry, version: 2 }));
  assert.throws(() =>
    addressBookEntry({ ...entry, version: 2, addedVia: 'guessed' }),
  );
  assert.throws(() => addressBookEntry({ ...entry, addedVia: 'wallet' }));
});
await test('directory normalizes EVM, separates ecosystems and rejects malformed wallets', async () => {
  assert.deepEqual(
    walletContact({
      ...wallet,
      address: wallet.address.toUpperCase().replace('0X', '0x'),
    }),
    wallet,
  );
  const solana = {
    ecosystem: 'solana' as const,
    address: base58.encode(new Uint8Array(32).fill(17)),
  };
  assert.deepEqual(walletContact(solana), solana);
  assert.throws(() => walletContact({ ...wallet, ecosystem: 'solana' }));
  assert.throws(() =>
    walletContact({ ...wallet, address: wallet.address + 'a' }),
  );
  assert.throws(() => addressBookEntry({ ...entry, alias: 'apelido\nextra' }));
  assert.equal(await walletEntity(entry), await walletEntity(wallet));
  assert.notEqual(await walletEntity(entry), await walletEntity(solana));
});
await test('full address identifies the ecosystem with the same canonical validation and preserves Solana', () => {
  const addresses = [
    wallet,
    {
      ecosystem: 'solana' as const,
      address: base58.encode(new Uint8Array(32).fill(17)),
    },
    {
      ecosystem: 'solana' as const,
      address: base58.encode(new Uint8Array(32)),
    },
  ];
  for (const contact of addresses)
    assert.deepEqual(walletContactFromAddress(` ${contact.address} `), contact);
  assert.deepEqual(walletContactFromAddress('0x' + 'aAbBcCdDeE'.repeat(4)), {
    ecosystem: 'evm',
    address: '0x' + 'aabbccddee'.repeat(4),
  });
  for (const invalid of [
    '',
    '0xabc',
    wallet.address + 'a',
    '0x' + 'g'.repeat(40),
    base58.encode(new Uint8Array(31).fill(17)),
    base58.encode(new Uint8Array(33).fill(17)),
    'O'.repeat(44),
    'So111111…11112',
  ])
    assert.throws(() => walletContactFromAddress(invalid), /Invalid wallet/u);
});
await test('invitation stays in the fragment, grants no device authority and rejects invalid origins, fields and QR codes', () => {
  const invite = { owner: accountId, token: 'a'.repeat(64) };
  const link = invitationLink('https://0xdmme.app', invite);
  assert.equal(new URL(link).search, '');
  assert.match(new URL(link).hash, /^#contacts\?invite=/u);
  assert.deepEqual(readInvitation(link, 'https://0xdmme.app'), invite);
  const legacy = link.replace('#contacts?invite=', '#contatos?convite=');
  assert.deepEqual(readInvitation(legacy, 'https://0xdmme.app'), invite);
  assert.equal(readQrPayload(legacy, 'invitation'), legacy);
  assert.throws(() =>
    readInvitation(
      link.replace('0xdmme.app', 'outro.app'),
      'https://0xdmme.app',
    ),
  );
  assert.throws(() =>
    readInvitation(link + '&aparelho=1', 'https://0xdmme.app'),
  );
  assert.equal(readQrPayload(link, 'invitation'), link);
  assert.ok(qrMatrix(link).length > 0);
  assert.throws(() => readQrPayload(link, 'link'));
  assert.throws(() => readQrPayload('javascript:alert(1)', 'invitation'));
});
await test('signed permissions bind account, device, operation, revision and target', async () => {
  const identity = await createIdentity(deviceId, 'Sintético');
  const proof = {
    directory: 'b'.repeat(64),
    payload: { revision: 1, target: crypto.randomUUID(), accept: true },
  };
  const body = contactBody(accountId, deviceId, 'respond', proof);
  const signature = await sign(identity.signing, body);
  assert.deepEqual(contactProof({ ...proof, signature }), {
    ...proof,
    signature,
  });
  await verify(identity.public.signing, signature, body);
  for (const changed of [
    contactBody(crypto.randomUUID(), deviceId, 'respond', proof),
    contactBody(accountId, crypto.randomUUID(), 'respond', proof),
    contactBody(accountId, deviceId, 'block', proof),
    contactBody(accountId, deviceId, 'respond', {
      ...proof,
      payload: { ...proof.payload, revision: 0 },
    }),
  ])
    await assert.rejects(verify(identity.public.signing, signature, changed));
});
await test('wallet, alias and identity enter the vault only as encrypted content and manifest', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const identity = { accountId, id: crypto.randomUUID(), epoch: 1 };
  const plaintext = JSON.stringify(entry),
    bytes = await sealBlock(key, identity, plaintext);
  const commit = await sealCommit({
    unsigned: {
      version: 1,
      ...identity,
      deviceId,
      directory: 'b'.repeat(64),
      authorityRevision: 1,
      sequence: 1,
      previous: null,
      block: { hash: await bytesHash(bytes), bytes: bytes.length },
    },
    change: {
      version: 1,
      entity: await walletEntity(entry),
      kind: 'address-book',
      parents: [],
      label: entry.alias,
    },
    key,
    sign: () =>
      Promise.resolve(btoa(String.fromCharCode(...new Uint8Array(64)))),
  });
  const serialized = JSON.stringify(commit);
  assert.equal(serialized.includes(wallet.address), false);
  assert.equal(serialized.includes(entry.alias), false);
  assert.equal(Buffer.from(bytes).includes(Buffer.from(entry.alias)), false);
  assert.deepEqual(
    addressBookEntry(
      JSON.parse(await openBlock(key, commit, bytes)) as unknown,
    ),
    entry,
  );
  assert.equal((await openManifest(key, commit)).label, entry.alias);
});

await test('pinned reference detects identity changes, rollback and divergent heads', () => {
  const known = {
    identity: 'a'.repeat(64),
    directory: 'b'.repeat(64),
    identityRevision: 3,
  };
  const current = {
    fingerprint: known.identity,
    head: known.directory,
    revision: 3,
  };
  assert.doesNotThrow(() => checkPinnedIdentity(known, current));
  assert.doesNotThrow(() =>
    checkPinnedIdentity(known, {
      ...current,
      revision: 4,
      head: 'c'.repeat(64),
    }),
  );
  assert.throws(() =>
    checkPinnedIdentity(known, { ...current, fingerprint: 'd'.repeat(64) }),
  );
  assert.throws(() => checkPinnedIdentity(known, { ...current, revision: 2 }));
  assert.throws(() =>
    checkPinnedIdentity(known, { ...current, head: 'd'.repeat(64) }),
  );
});

await test('blocking a contact from requests sends only ecosystem and address without extra fields', async (t) => {
  const { Contacts } = await import('../src/client/contacts/controller.ts');
  const identity = await createIdentity(deviceId, 'Sintético');
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const session = {
    accountId,
    deviceId,
    csrf: 'a'.repeat(64),
    ecosystem: 'evm' as const,
    address: wallet.address,
    name: '',
    deviceState: 'pending' as const,
    historyAuthorized: false as const,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
  };
  const access = {
    withVault: <T>(
      _offline: boolean,
      work: (
        authority: import('../src/client/vault-authority/index.ts').VaultAuthority,
      ) => Promise<T>,
    ) =>
      work({
        session,
        offline: false,
        directory: 'b'.repeat(64),
        epoch: 1,
        events: [],
        key: () => Promise.resolve(key),
        sign: (proof) => sign(identity.signing, proof),
      }),
    withLocalVault: <T>() => Promise.reject<T>(new Error('Não usado.')),
  };
  const fetchBefore = globalThis.fetch;
  const onlineBefore = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  t.after(() => {
    globalThis.fetch = fetchBefore;
    if (onlineBefore) Object.defineProperty(navigator, 'onLine', onlineBefore);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  const sent: unknown[] = [];
  globalThis.fetch = (url, options) => {
    if (typeof url !== 'string') throw new Error('URL de teste inválida.');
    if (url.endsWith('/block')) {
      if (typeof options?.body !== 'string')
        throw new Error('Corpo de teste inválido.');
      sent.push(JSON.parse(options.body) as unknown);
      return Promise.resolve(Response.json({ status: 'saved' }));
    }
    return Promise.resolve(
      Response.json({ revision: 1, mode: 'invite', inviteHash: null }),
    );
  };
  const controller = new Contacts(access);
  controller.setSession(session);
  const selected = {
    ...wallet,
    accountId: crypto.randomUUID(),
    name: 'Nome escolhido no pedido',
    requester: crypto.randomUUID(),
  };
  await controller.block(selected, true);
  assert.equal(sent.length, 1);
  const proof = contactProof(sent[0]);
  assert.deepEqual(proof.payload['wallet'], wallet);
  await verify(
    identity.public.signing,
    proof.signature,
    contactBody(accountId, deviceId, 'block', proof),
  );
});

await test('own public identity matches the contact-verified reference; tampered chain is rejected', async (t) => {
  const { Contacts } = await import('../src/client/contacts/controller.ts');
  const identity = await createIdentity(deviceId, 'Sintético'),
    recovery = await createRecovery(accountId, newSecret());
  const event = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [identity.public],
    ring: freshKeyring(accountId),
    profile: null,
  });
  const session = {
    accountId,
    deviceId,
    csrf: 'a'.repeat(64),
    ecosystem: 'evm' as const,
    address: wallet.address,
    name: '',
    deviceState: 'pending' as const,
    historyAuthorized: false as const,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
  };
  const authority = {
    session,
    offline: false,
    directory: await eventHash(event),
    epoch: 1,
    events: [event],
    key: () => Promise.reject<CryptoKey>(new Error('Não usado.')),
    sign: (proof: string) => sign(identity.signing, proof),
  };
  const controller = new Contacts({
    withVault: <T>(
      _offline: boolean,
      work: (
        a: import('../src/client/vault-authority/index.ts').VaultAuthority,
      ) => Promise<T>,
    ) => work(authority),
    withLocalVault: <T>() => Promise.reject<T>(new Error('Não usado.')),
  });
  controller.setSession(session);
  const own = await controller.ownIdentity();
  const fetchBefore = globalThis.fetch;
  const onlineBefore = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  t.after(() => {
    globalThis.fetch = fetchBefore;
    if (onlineBefore) Object.defineProperty(navigator, 'onLine', onlineBefore);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  let responseData: unknown = {
    events: [event],
    revision: 1,
    head: authority.directory,
  };
  globalThis.fetch = () => Promise.resolve(Response.json(responseData));
  const known = { identity: null, directory: null, identityRevision: 0 };
  const viewed = await controller.identity(accountId, known);
  assert.equal(own.accountId, accountId);
  assert.equal(own.fingerprint, viewed.fingerprint);
  responseData = {
    events: [
      { ...event, root: { ...event.root, signing: identity.public.signing } },
    ],
    revision: 1,
    head: authority.directory,
  };
  await assert.rejects(controller.identity(accountId, known));
  controller.setSession(null);
  await assert.rejects(controller.ownIdentity());
});
