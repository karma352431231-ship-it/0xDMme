import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Wallet } from 'ethers';
import { ParsedMessage } from '@spruceid/siwe-parser';
import {
  loginMessage,
  verifyLoginSignature,
} from '../src/server/account/siwe.ts';
import { signEvm } from '../src/client/wallet/index.ts';
import type { LoginChallenge } from '../src/server/database/index.ts';

function challenge(origin: string) {
  const signer = Wallet.createRandom();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 300_000);
  const input = {
    origin,
    address: signer.address,
    chainId: 1,
    nonce: 'a'.repeat(64),
    issuedAt,
    expiresAt,
    id: randomUUID(),
    deviceId: randomUUID(),
    handoff: true,
  };
  const stored = {
    id: input.id,
    browserHash: 'b'.repeat(64),
    address: signer.address.toLowerCase(),
    ecosystem: 'evm' as const,
    deviceId: input.deviceId,
    message: loginMessage(input),
    expiresAt,
  } satisfies LoginChallenge;
  return { signer, stored };
}

await test('desafio HTTPS omite scheme do cabeçalho, preserva origem/porta e assina a mensagem exata por personal_sign', async () => {
  for (const origin of ['https://0xdmme.app', 'https://example.test:8443']) {
    const { signer, stored } = challenge(origin);
    const parsed = new ParsedMessage(stored.message);
    assert.equal(parsed.domain, new URL(origin).host);
    assert.equal(parsed.scheme, undefined);
    assert.equal(parsed.uri, origin);
    assert.equal(parsed.address, signer.address);
    const signature = await signEvm(
      {
        async request(request) {
          assert.equal(request.method, 'personal_sign');
          assert.equal(request.params?.[1], signer.address);
          const hex = request.params?.[0];
          assert.ok(hex);
          const bytes = Buffer.from(hex.slice(2), 'hex');
          assert.equal(bytes.toString('utf8'), stored.message);
          return signer.signMessage(bytes);
        },
      },
      stored.message,
      signer.address,
    );
    verifyLoginSignature(stored, signature, origin);
    assert.throws(() =>
      verifyLoginSignature(stored, signature, 'https://other.test'),
    );
    assert.throws(() =>
      verifyLoginSignature(
        stored,
        signature,
        origin.replace('https:', 'http:'),
      ),
    );
    assert.throws(() =>
      verifyLoginSignature(
        {
          ...stored,
          message: stored.message.replace('Chain ID: 1', 'Chain ID: 2'),
        },
        signature,
        origin,
      ),
    );
  }
});

await test('desafio HTTPS anterior com scheme explícito continua verificável até seu prazo original', async () => {
  const origin = 'https://0xdmme.app';
  const { signer, stored } = challenge(origin);
  stored.message = `https://${stored.message}`;
  const signature = await signer.signMessage(stored.message);
  verifyLoginSignature(stored, signature, origin);
  assert.throws(() =>
    verifyLoginSignature(
      { ...stored, expiresAt: new Date(0) },
      signature,
      origin,
    ),
  );
});

await test('HTTP local conserva scheme explícito e rejeita mensagem que omite scheme mesmo com assinatura válida', async () => {
  const origin = 'http://127.0.0.1:45110';
  const { signer, stored } = challenge(origin);
  assert.equal(new ParsedMessage(stored.message).scheme, 'http');
  verifyLoginSignature(
    stored,
    await signer.signMessage(stored.message),
    origin,
  );
  const implicit = {
    ...stored,
    message: stored.message.slice('http://'.length),
  };
  assert.throws(
    () => verifyLoginSignature(implicit, '0x' + 'a'.repeat(130), origin),
    /Contexto SIWE inválido/u,
  );
  const signature = await signer.signMessage(implicit.message);
  assert.throws(
    () => verifyLoginSignature(implicit, signature, origin),
    /Contexto SIWE inválido/u,
  );
});
