import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  emptyProfile,
  openProfile,
  sealProfile,
  validatePhoto,
} from '../src/client/account-profile/index.ts';
import {
  accountSession,
  displayName,
  profileEnvelope,
  base64,
  encode,
} from '../src/shared/account/index.ts';
import {
  matrixBase64,
  matrixCiphertext,
} from '../src/shared/messages/index.ts';
import {
  walletBrowserUrl,
  signEvm,
  evmIdentity,
} from '../src/client/wallet/index.ts';
import type { EvmProvider } from '../src/client/wallet/index.ts';

await test('perfil cifrado autentica conta e revisão, rejeita chave errada e alteração', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const wrong = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const accountId = randomUUID();
  const profile = emptyProfile();
  profile.preferences.readReceipts = true;
  const envelope = await sealProfile({ profile, key, accountId, revision: 1 });
  assert.equal(key.extractable, false);
  assert.deepEqual(await openProfile({ envelope, key, accountId }), profile);
  await assert.rejects(openProfile({ envelope, key: wrong, accountId }));
  await assert.rejects(openProfile({ envelope, key, accountId: randomUUID() }));
  await assert.rejects(
    openProfile({ envelope: { ...envelope, revision: 2 }, key, accountId }),
  );
  const changed = {
    ...envelope,
    ciphertext: `${envelope.ciphertext.startsWith('A') ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
  };
  await assert.rejects(openProfile({ envelope: changed, key, accountId }));
  assert.throws(() =>
    profileEnvelope({ ...envelope, secret: 'never-accepted' }),
  );
});

await test('foto de 3 MB é cifrada como bytes sem reduzir teto por expansão base64', async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const accountId = randomUUID();
  const bytes = new Uint8Array(3_000_000);
  bytes.set([255, 216, 255]);
  const profile = { ...emptyProfile(), photo: { type: 'image/jpeg', bytes } };
  const envelope = await sealProfile({ profile, key, accountId, revision: 1 });
  const restored = await openProfile({ envelope, key, accountId });
  assert.equal(restored.photo?.bytes.length, 3_000_000);
  assert.deepEqual(restored.photo?.bytes, bytes);
  assert.throws(() => validatePhoto('image/jpeg', new Uint8Array(3_000_001)));
  assert.throws(() =>
    validatePhoto('image/svg+xml', new TextEncoder().encode('<svg/>')),
  );
});

await test('conversão Base64 conserva limites e codificação canônica, inclusive padding Matrix', () => {
  for (const values of [[0], [255], [255, 255], [0, 1, 255], [1, 2, 3, 4]]) {
    const bytes = new Uint8Array(values),
      encoded = Buffer.from(bytes).toString('base64');
    assert.equal(encode(bytes), encoded);
    assert.deepEqual(base64(encoded, bytes.length), bytes);
    assert.equal(
      matrixBase64(encoded.replaceAll('=', ''), bytes.length),
      encoded.replaceAll('=', ''),
    );
    assert.equal(
      matrixCiphertext(encoded.replaceAll('=', ''), bytes.length),
      encoded.replaceAll('=', ''),
    );
    assert.throws(() => base64(encoded, bytes.length - 1));
  }
  for (const invalid of [
    '',
    'AA',
    'AA=',
    'AB==',
    'AAB=',
    'A===',
    '=AAA',
    'AA==\n',
    'AA-_',
    'AA===',
  ])
    assert.throws(() => base64(invalid, 32));
  for (const invalid of ['', 'A', 'AB', 'AAB', 'AA=', 'AA==', 'AA-_']) {
    assert.throws(() => matrixCiphertext(invalid, 32));
    assert.throws(() => matrixBase64(invalid, 1));
  }
});

await test('fronteiras rejeitam sessão com autorização inventada e nomes de controle', () => {
  assert.equal(displayName('  Jose\u0301  '), 'José');
  assert.throws(() => displayName('nome\nindevido'));
  assert.throws(() => displayName('a'.repeat(81)));
  assert.throws(() => accountSession({ historyAuthorized: true }));
});

await test('conector usa somente contas, rede e personal_sign; nunca solicita transação', async () => {
  const calls: string[] = [];
  const address = `0x${'1'.repeat(40)}`;
  const instance: EvmProvider = {
    request: (input) => {
      calls.push(input.method);
      if (
        input.method === 'eth_requestAccounts' ||
        input.method === 'eth_accounts'
      )
        return Promise.resolve([address]);
      if (input.method === 'eth_chainId') return Promise.resolve('0x1');
      assert.deepEqual(input.params, ['0x6c6f67696e', address]);
      return Promise.resolve(`0x${'a'.repeat(130)}`);
    },
  };
  assert.deepEqual(await evmIdentity(instance, true), {
    address,
    chainId: 1,
    ecosystem: 'evm',
  });
  await signEvm(instance, 'login', address);
  assert.deepEqual(calls, [
    'eth_requestAccounts',
    'eth_chainId',
    'personal_sign',
  ]);
  assert.equal(
    walletBrowserUrl({
      origin: 'http://127.0.0.1:45100',
      wallet: 'Phantom',
      ticket: 'a'.repeat(64),
      ecosystem: 'solana',
    }),
    null,
  );
  assert.match(
    walletBrowserUrl({
      origin: 'https://example.org',
      wallet: 'Phantom',
      ticket: 'a'.repeat(64),
      ecosystem: 'solana',
    }) ?? '',
    /^https:\/\/phantom\.com\/ul\/browse\//u,
  );
});
