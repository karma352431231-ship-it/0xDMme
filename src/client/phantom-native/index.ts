import sodium from 'libsodium-wrappers';
import { base58 } from '@scure/base';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import { object, keys, boundedText } from '../../shared/account/index.ts';

/** Isolated interoperability proof. Never creates an application login. */
export interface NativeProbe {
  version: 1;
  id: string;
  createdAt: number;
  secret: string;
  publicKey: string;
  phase: 'connect' | 'sign';
  peer?: string;
  address?: string;
  session?: string;
  message?: string;
}
export const probeLifetime = 300_000;
export async function ready(): Promise<void> {
  await Promise.race([
    sodium.ready,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Canal indisponível.')),
        10_000,
      );
      void sodium.ready.then(
        () => clearTimeout(timer),
        () => clearTimeout(timer),
      );
    }),
  ]);
}
function bytes(value: unknown, size: number): Uint8Array {
  const decoded = base58.decode(boundedText(value, size * 2));
  if (decoded.length !== size) throw new Error('Comprimento inválido.');
  return decoded;
}
function ownOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && url.hostname === '127.0.0.1'))
  )
    throw new Error('Origem inválida.');
  return url.origin;
}
function callback(origin: string, state: NativeProbe): string {
  const url = new URL('/phantom-probe.html', ownOrigin(origin));
  url.search = new URLSearchParams({
    state: state.id,
    phase: state.phase,
  }).toString();
  return url.href;
}
export function readProbe(input: unknown, now = Date.now()): NativeProbe {
  const data = object(input);
  const phase = data['phase'];
  const required = [
    'version',
    'id',
    'createdAt',
    'secret',
    'publicKey',
    'phase',
  ];
  keys(
    data,
    phase === 'sign'
      ? [...required, 'peer', 'address', 'session', 'message']
      : required,
  );
  if (data['version'] !== 1 || (phase !== 'connect' && phase !== 'sign'))
    throw new Error('Prova inválida.');
  const createdAt = probeCreatedAt(data['createdAt'], now);
  const id = boundedText(data['id'], 64);
  bytes(id, 32);
  const secret = boundedText(data['secret'], 64);
  const publicKey = boundedText(data['publicKey'], 64);
  const privateBytes = bytes(secret, 32);
  try {
    if (
      !sodium.memcmp(
        sodium.crypto_scalarmult_base(privateBytes),
        bytes(publicKey, 32),
      )
    )
      throw new Error('Canal inválido.');
  } finally {
    sodium.memzero(privateBytes);
  }
  const state: NativeProbe = {
    version: 1,
    id,
    createdAt,
    secret,
    publicKey,
    phase,
  };
  if (phase === 'sign') {
    state.peer = boundedText(data['peer'], 64);
    bytes(state.peer, 32);
    state.address = canonicalAddress('solana', data['address']);
    state.session = boundedText(data['session'], 2048);
    state.message = boundedText(data['message'], 512);
  }
  return state;
}
function probeCreatedAt(value: unknown, now: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    now < value ||
    now - value >= probeLifetime
  )
    throw new Error('Prova ausente ou expirada.');
  return value;
}
export function beginProbe(origin: string, now = Date.now()) {
  const pair = sodium.crypto_box_keypair();
  const state: NativeProbe = {
    version: 1,
    id: base58.encode(sodium.randombytes_buf(32)),
    createdAt: now,
    secret: base58.encode(pair.privateKey),
    publicKey: base58.encode(pair.publicKey),
    phase: 'connect',
  };
  sodium.memzero(pair.privateKey);
  const url = new URL('https://phantom.app/ul/v1/connect');
  url.search = new URLSearchParams({
    app_url: ownOrigin(origin),
    dapp_encryption_public_key: state.publicKey,
    redirect_link: callback(origin, state),
    cluster: 'mainnet-beta',
  }).toString();
  return { state, link: url.href };
}
function packet(params: URLSearchParams, state: NativeProbe) {
  const names = [...params.keys()];
  const expected =
    state.phase === 'connect'
      ? ['state', 'phase', 'phantom_encryption_public_key', 'nonce', 'data']
      : ['state', 'phase', 'nonce', 'data'];
  if (
    params.toString().length > 6000 ||
    names.length !== expected.length ||
    new Set(names).size !== names.length ||
    expected.some((name) => !params.has(name)) ||
    params.get('state') !== state.id ||
    params.get('phase') !== state.phase
  )
    throw new Error('Retorno inválido ou de outra prova.');
  return {
    nonce: bytes(params.get('nonce'), 24),
    ciphertext: base58.decode(boundedText(params.get('data'), 4096)),
    peer: bytes(
      state.phase === 'connect'
        ? params.get('phantom_encryption_public_key')
        : state.peer,
      32,
    ),
  };
}
function channel(state: NativeProbe, peer: Uint8Array): Uint8Array {
  const secret = bytes(state.secret, 32);
  try {
    return sodium.crypto_box_beforenm(peer, secret);
  } finally {
    sodium.memzero(secret);
  }
}
function connected(
  input: unknown,
  origin: string,
): { address: string; session: string } {
  const data = object(input);
  keys(data, ['public_key', 'session']);
  const address = canonicalAddress('solana', data['public_key']);
  const session = boundedText(data['session'], 2048);
  const signed = base58.decode(session);
  if (
    signed.length < 65 ||
    !sodium.crypto_sign_verify_detached(
      signed.slice(0, 64),
      signed.slice(64),
      bytes(address, 32),
    )
  )
    throw new Error('Sessão da wallet inválida.');
  const metadata = object(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(signed.slice(64)),
    ),
  );
  if (
    metadata['app_url'] !== ownOrigin(origin) ||
    metadata['chain'] !== 'solana' ||
    (metadata['cluster'] !== undefined &&
      metadata['cluster'] !== 'mainnet-beta')
  )
    throw new Error('Sessão de outra aplicação ou rede.');
  return { address, session };
}
export function receiveProbe(
  input: unknown,
  params: URLSearchParams,
  origin: string,
  now = Date.now(),
) {
  const previous = readProbe(input, now);
  const response = packet(params, previous);
  const shared = channel(previous, response.peer);
  try {
    const opened = sodium.crypto_box_open_easy_afternm(
      response.ciphertext,
      response.nonce,
      shared,
    );
    let plaintext: unknown;
    try {
      plaintext = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(opened),
      );
    } finally {
      sodium.memzero(opened);
    }
    if (previous.phase === 'sign') {
      const data = object(plaintext);
      keys(data, ['signature']);
      if (
        !sodium.crypto_sign_verify_detached(
          bytes(data['signature'], 64),
          new TextEncoder().encode(previous.message),
          bytes(previous.address, 32),
        )
      )
        throw new Error('Assinatura inválida.');
      return { complete: true as const };
    }
    const identity = connected(plaintext, origin);
    const state: NativeProbe = {
      ...previous,
      ...identity,
      phase: 'sign',
      peer: base58.encode(response.peer),
      message: `0xDMme — prova de retorno da Phantom.\nOrigem: ${ownOrigin(origin)}\nPedido: ${previous.id}\nEsta assinatura testa o retorno ao navegador. Não conecta uma conta, não autoriza transações nem acesso ao histórico.`,
    };
    const nonce = sodium.randombytes_buf(24);
    const payload = sodium.crypto_box_easy_afternm(
      JSON.stringify({
        message: base58.encode(new TextEncoder().encode(state.message)),
        session: state.session,
        display: 'utf8',
      }),
      nonce,
      shared,
    );
    const url = new URL('https://phantom.app/ul/v1/signMessage');
    url.search = new URLSearchParams({
      dapp_encryption_public_key: state.publicKey,
      nonce: base58.encode(nonce),
      redirect_link: callback(origin, state),
      payload: base58.encode(payload),
    }).toString();
    return { complete: false as const, state, link: url.href };
  } finally {
    sodium.memzero(shared);
  }
}
