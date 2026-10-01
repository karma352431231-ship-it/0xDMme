import { getAddress } from 'ethers';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import {
  createSignInMessageText,
  parseSignInMessageText,
} from '@solana/wallet-standard-util';
import {
  canonicalAddress,
  ecosystem,
  solanaPublicKey,
} from '../../shared/wallet-identity/index.ts';
import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { Ecosystem } from '../../shared/wallet-identity/index.ts';
import type { LoginChallenge } from '../database/index.ts';
import { loginMessage, verifyLoginSignature } from './siwe.ts';

function solanaSigningKey(address: string) {
  const key = solanaPublicKey(address);
  const point = ed25519.Point.fromBytes(key, false);
  if (point.isSmallOrder() || !point.isTorsionFree())
    throw new Error('Chave inválida.');
  return key;
}
function connectedChain(network: Ecosystem, value: unknown): string | number {
  if (network === 'solana') {
    if (value !== 'solana:mainnet') throw new Error('Rede inválida.');
    return value;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  )
    throw new Error('Rede inválida.');
  return value;
}
export function loginIdentity(input: unknown): {
  address: string;
  ecosystem: Ecosystem;
  chainId: number | string;
  deviceId: string;
} {
  const data = object(input);
  // Compatibility for previously issued EVM clients; new clients always name the ecosystem.
  keys(
    data,
    Object.hasOwn(data, 'ecosystem')
      ? ['address', 'chainId', 'deviceId', 'ecosystem']
      : ['address', 'chainId', 'deviceId'],
  );
  try {
    const network = ecosystem(data['ecosystem'] ?? 'evm');
    const address =
      network === 'evm'
        ? getAddress(String(data['address']))
        : canonicalAddress(network, data['address']);
    if (network === 'solana') solanaSigningKey(address);
    return {
      address,
      ecosystem: network,
      chainId: connectedChain(network, data['chainId']),
      deviceId: uuid(data['deviceId']),
    };
  } catch {
    throw new AccountError(400, 'Identidade ou rede da wallet inválida.');
  }
}
export function challengeMessage(input: {
  origin: string;
  address: string;
  ecosystem: Ecosystem;
  chainId: number | string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  id: string;
  deviceId: string;
  handoff?: boolean;
}): string {
  if (input.ecosystem === 'evm')
    return loginMessage({
      ...input,
      chainId: Number(input.chainId),
      handoff: input.handoff === true,
    });
  return createSignInMessageText({
    domain: new URL(input.origin).host,
    address: input.address,
    statement: input.handoff
      ? 'Sign in to 0xDMme in the browser that opened this wallet. Reject links from other people. No funds or encrypted history access.'
      : 'Sign in to 0xDMme. No funds, transactions or access to encrypted history.',
    uri: input.origin,
    version: '1',
    chainId: String(input.chainId),
    nonce: input.nonce,
    issuedAt: input.issuedAt.toISOString(),
    expirationTime: input.expiresAt.toISOString(),
    requestId: input.id,
    resources: [`urn:uuid:${input.deviceId}`],
  });
}
function solanaContext(challenge: LoginChallenge, origin: string): void {
  const parsed = parseSignInMessageText(challenge.message);
  if (
    !parsed ||
    parsed.domain !== new URL(origin).host ||
    parsed.uri !== origin ||
    parsed.version !== '1' ||
    parsed.chainId !== 'solana:mainnet'
  )
    throw new Error('Contexto inválido.');
  solanaBinding(parsed, challenge);
}
function solanaBinding(
  parsed: NonNullable<ReturnType<typeof parseSignInMessageText>>,
  challenge: LoginChallenge,
): void {
  if (
    parsed.address !== challenge.address ||
    parsed.requestId !== challenge.id ||
    parsed.expirationTime !== challenge.expiresAt.toISOString() ||
    challenge.expiresAt.getTime() <= Date.now()
  )
    throw new Error('Vínculo inválido.');
  if (
    parsed.resources?.length !== 1 ||
    parsed.resources[0] !== `urn:uuid:${challenge.deviceId}`
  )
    throw new Error('Dispositivo inválido.');
}

function verifySolana(
  challenge: LoginChallenge,
  signature: string,
  origin: string,
): void {
  solanaContext(challenge, origin);
  const key = solanaSigningKey(challenge.address);
  const bytes = base58.decode(signature);
  if (
    bytes.length !== 64 ||
    base58.encode(bytes) !== signature ||
    !ed25519.verify(bytes, new TextEncoder().encode(challenge.message), key, {
      zip215: false,
    })
  )
    throw new Error('Assinatura inválida.');
}
export function verifyChallenge(
  challenge: LoginChallenge,
  signature: unknown,
  origin: string,
): void {
  try {
    if (typeof signature !== 'string' || signature.length > 132)
      throw new Error('Assinatura inválida.');
    if (challenge.ecosystem === 'evm') {
      if (!/^0x[0-9a-fA-F]{130}$/u.test(signature))
        throw new Error('Assinatura inválida.');
      verifyLoginSignature(challenge, signature, origin);
    } else {
      verifySolana(challenge, signature, origin);
    }
  } catch {
    throw new AccountError(401, 'Assinatura de login inválida ou expirada.');
  }
}
