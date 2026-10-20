import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authoritySignature } from '../src/client/devices/authority-signature.ts';
import { base64 } from '../src/shared/account/index.ts';

await test('signature preserves individual proof and rejects a changed session even during WebCrypto', async (t) => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  let current = true;
  const signature = authoritySignature(pair.privateKey, () => {
    if (!current) throw new Error('Session changed.');
  });
  const proof = 'synthetic-public-proof';
  assert.ok(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      base64(await signature(proof), 128),
      new TextEncoder().encode(proof),
    ),
  );
  const original = crypto.subtle.sign.bind(crypto.subtle);
  t.mock.method(
    crypto.subtle,
    'sign',
    async (...args: Parameters<typeof crypto.subtle.sign>) => {
      const signed = await original(...args);
      current = false;
      return signed;
    },
  );
  await assert.rejects(signature(proof), /Session changed/);
});
