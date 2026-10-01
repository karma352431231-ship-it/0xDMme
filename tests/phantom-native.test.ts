import assert from 'node:assert/strict';
import { test } from 'node:test';
import sodium from 'libsodium-wrappers';
import { base58 } from '@scure/base';
import {
  beginProbe,
  readProbe,
  ready,
  receiveProbe,
} from '../src/client/phantom-native/index.ts';
import type { NativeProbe } from '../src/client/phantom-native/index.ts';

await ready();
const origin = 'https://0xdmme.app';
function phantom() {
  const box = sodium.crypto_box_keypair();
  const wallet = sodium.crypto_sign_keypair();
  function session(appUrl = origin) {
    const body = new TextEncoder().encode(
      JSON.stringify({
        app_url: appUrl,
        chain: 'solana',
        cluster: 'mainnet-beta',
        timestamp: Date.now(),
      }),
    );
    const proof = sodium.crypto_sign_detached(body, wallet.privateKey);
    return base58.encode(Uint8Array.from([...proof, ...body]));
  }
  function response(state: NativeProbe, value: unknown) {
    const nonce = sodium.randombytes_buf(24);
    // Full NaCl box API, independent of the adapter's precomputed channel API.
    const ciphertext = sodium.crypto_box_easy(
      JSON.stringify(value),
      nonce,
      base58.decode(state.publicKey),
      box.privateKey,
    );
    const params = new URLSearchParams({
      state: state.id,
      phase: state.phase,
      nonce: base58.encode(nonce),
      data: base58.encode(ciphertext),
    });
    if (state.phase === 'connect')
      params.set('phantom_encryption_public_key', base58.encode(box.publicKey));
    return params;
  }
  return { box, wallet, session, response };
}
function connection() {
  const pending = beginProbe(origin);
  const wallet = phantom();
  const params = wallet.response(pending.state, {
    public_key: base58.encode(wallet.wallet.publicKey),
    session: wallet.session(),
  });
  return { pending, wallet, params };
}
await test('prova nativa conecta e assina pelo contrato NaCl sem transação ou sessão de conta', () => {
  const { pending, wallet, params } = connection();
  const connect = new URL(pending.link);
  assert.equal(
    connect.origin + connect.pathname,
    'https://phantom.app/ul/v1/connect',
  );
  assert.equal(
    new URL(connect.searchParams.get('redirect_link') ?? '').origin,
    origin,
  );
  assert.equal(connect.searchParams.has('secret'), false);
  const next = receiveProbe(pending.state, params, origin);
  assert.equal(next.complete, false);
  if (next.complete) throw new Error('Etapa incorreta.');
  const sign = new URL(next.link);
  assert.equal(sign.pathname, '/ul/v1/signMessage');
  const payload: unknown = JSON.parse(
    new TextDecoder().decode(
      sodium.crypto_box_open_easy(
        base58.decode(sign.searchParams.get('payload') ?? ''),
        base58.decode(sign.searchParams.get('nonce') ?? ''),
        base58.decode(next.state.publicKey),
        wallet.box.privateKey,
      ),
    ),
  );
  assert.ok(
    typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string',
  );
  const message = base58.decode(payload.message);
  assert.match(new TextDecoder().decode(message), /Não conecta uma conta/u);
  const signature = sodium.crypto_sign_detached(
    message,
    wallet.wallet.privateKey,
  );
  assert.deepEqual(
    receiveProbe(
      next.state,
      wallet.response(next.state, { signature: base58.encode(signature) }),
      origin,
    ),
    { complete: true },
  );
  assert.doesNotMatch(
    next.link,
    /signTransaction|signAndSendTransaction|secret|handoff/u,
  );
});
await test('prova nativa recusa troca de estado, prazo renovado, campos duplicados e resposta de outra etapa', () => {
  const { pending, params } = connection();
  const wrong = new URLSearchParams(params);
  wrong.set('state', base58.encode(sodium.randombytes_buf(32)));
  assert.throws(() => receiveProbe(pending.state, wrong, origin));
  const duplicate = new URLSearchParams(params);
  duplicate.append('nonce', params.get('nonce') ?? '');
  assert.throws(() => receiveProbe(pending.state, duplicate, origin));
  assert.throws(() =>
    receiveProbe(
      pending.state,
      params,
      origin,
      pending.state.createdAt + 300_000,
    ),
  );
  assert.throws(() => readProbe(pending.state, pending.state.createdAt - 1));
  assert.throws(() =>
    readProbe({ ...pending.state, expiresAt: Date.now() + 999_999 }),
  );
  const next = receiveProbe(pending.state, params, origin);
  if (next.complete) throw new Error('Etapa incorreta.');
  assert.throws(() => receiveProbe(next.state, params, origin));
});
await test('canal nativo rejeita alteração de cifra, peer inválido, sessão de outra origem e assinatura de outra chave', () => {
  const { pending, wallet, params } = connection();
  const corrupt = new URLSearchParams(params);
  const data = base58.decode(corrupt.get('data') ?? '');
  data[0] = (data[0] ?? 0) ^ 1;
  corrupt.set('data', base58.encode(data));
  assert.throws(() => receiveProbe(pending.state, corrupt, origin));
  const peer = new URLSearchParams(params);
  peer.set('phantom_encryption_public_key', base58.encode(new Uint8Array(32)));
  assert.throws(() => receiveProbe(pending.state, peer, origin));
  const otherOrigin = wallet.response(pending.state, {
    public_key: base58.encode(wallet.wallet.publicKey),
    session: wallet.session('https://evil.example'),
  });
  assert.throws(() => receiveProbe(pending.state, otherOrigin, origin));
  const next = receiveProbe(pending.state, params, origin);
  if (next.complete) throw new Error('Etapa incorreta.');
  const impostor = sodium.crypto_sign_keypair();
  const signature = sodium.crypto_sign_detached(
    next.state.message ?? '',
    impostor.privateKey,
  );
  assert.throws(() =>
    receiveProbe(
      next.state,
      wallet.response(next.state, { signature: base58.encode(signature) }),
      origin,
    ),
  );
});
await test('prova limita URLs à origem própria e só expõe chaves públicas e cifras no protocolo', () => {
  for (const candidate of [
    'javascript:alert(1)',
    'https://0xdmme.app/other',
    'ftp://127.0.0.1',
    'https://user:password@0xdmme.app',
  ])
    assert.throws(() => beginProbe(candidate));
  const { pending, params } = connection();
  assert.equal(
    new URL(new URL(pending.link).searchParams.get('redirect_link') ?? '')
      .pathname,
    '/phantom-probe.html',
  );
  assert.equal(pending.link.includes(pending.state.secret), false);
  params.set('data', 'a'.repeat(6001));
  assert.throws(() => receiveProbe(pending.state, params, origin));
});
