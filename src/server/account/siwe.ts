import { ParsedMessage } from '@spruceid/siwe-parser';
import { verifyMessage } from 'ethers';
import type { LoginChallenge } from '../database/index.ts';

/** EIP-4361 serialization, checked by Spruce's official ABNF parser.
 * No custom signature/cryptography implementation and no optional RPC fallback.
 */
export function loginMessage(input: {
  origin: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  id: string;
  deviceId: string;
  handoff?: boolean;
}): string {
  const url = new URL(input.origin);
  const message = [
    `${url.protocol}//${url.host} wants you to sign in with your Ethereum account:`,
    input.address,
    '',
    input.handoff
      ? 'Sign in to 0xDMme in the browser that opened this wallet. Reject links from other people. No funds or encrypted history access.'
      : 'Sign in to 0xDMme. No funds, transactions or access to encrypted history.',
    '',
    `URI: ${input.origin}`,
    'Version: 1',
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
    `Request ID: ${input.id}`,
    'Resources:',
    `- urn:uuid:${input.deviceId}`,
  ].join('\n');
  new ParsedMessage(message);
  return message;
}

function authority(parsed: ParsedMessage, origin: string): void {
  const url = new URL(origin);
  if (
    parsed.domain !== url.host ||
    parsed.scheme !== url.protocol.slice(0, -1) ||
    parsed.uri !== origin ||
    parsed.version !== '1'
  )
    throw new Error('Contexto SIWE inválido.');
}

export function verifyLoginSignature(
  challenge: LoginChallenge,
  signature: string,
  origin: string,
): void {
  const parsed = new ParsedMessage(challenge.message);
  authority(parsed, origin);
  if (
    parsed.expirationTime !== challenge.expiresAt.toISOString() ||
    challenge.expiresAt.getTime() <= Date.now()
  )
    throw new Error('Desafio expirado.');
  if (
    parsed.requestId !== challenge.id ||
    parsed.resources?.[0] !== `urn:uuid:${challenge.deviceId}` ||
    parsed.address.toLowerCase() !== challenge.address
  )
    throw new Error('Vínculo SIWE inválido.');
  if (
    verifyMessage(challenge.message, signature).toLowerCase() !==
    challenge.address
  )
    throw new Error('Assinatura inválida.');
}
