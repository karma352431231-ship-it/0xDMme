import { base58 } from '@scure/base';
import { getWallets } from '@wallet-standard/app';
import { connectionError, SolanaConnectionError } from './connection-error.ts';
import {
  canonicalAddress,
  solanaPublicKey,
} from '../../shared/wallet-identity/index.ts';
export type StandardWallet = ReturnType<
  ReturnType<typeof getWallets>['get']
>[number];
function feature(
  wallet: StandardWallet,
  name: `${string}:${string}`,
): Record<string, unknown> {
  const value: unknown = wallet.features[name];
  if (typeof value !== 'object' || value === null)
    throw new Error('Wallet sem a capacidade necessária.');
  return value as Record<string, unknown>;
}
export function supportsSolana(wallet: StandardWallet): boolean {
  if (
    !wallet.features['standard:connect'] ||
    !wallet.features['solana:signMessage']
  )
    return false;
  return (
    wallet.chains.includes('solana:mainnet') &&
    typeof feature(wallet, 'standard:connect')['connect'] === 'function' &&
    typeof feature(wallet, 'solana:signMessage')['signMessage'] === 'function'
  );
}
function selectedAccount(wallet: StandardWallet, address?: string) {
  const account = wallet.accounts.find(
    (item) =>
      item.chains.includes('solana:mainnet') &&
      item.features.includes('solana:signMessage') &&
      (address === undefined || item.address === address),
  );
  if (!account) throw new SolanaConnectionError('conta-solana-ausente');
  try {
    if (
      base58.encode(new Uint8Array(account.publicKey)) !==
      canonicalAddress('solana', account.address)
    )
      throw new SolanaConnectionError('conta-solana-invalida');
  } catch {
    throw new SolanaConnectionError('conta-solana-invalida');
  }
  return account;
}
export async function standardIdentity(
  wallet: StandardWallet,
  requestAccess: boolean,
) {
  if (requestAccess) {
    const connect = feature(wallet, 'standard:connect') as {
      connect: () => Promise<unknown>;
    };
    try {
      await connect.connect();
    } catch (error: unknown) {
      throw connectionError(error);
    }
  }
  return {
    address: selectedAccount(wallet).address,
    chainId: 'solana:mainnet',
    ecosystem: 'solana' as const,
  };
}
export async function signStandard(
  wallet: StandardWallet,
  message: string,
  address: string,
): Promise<string> {
  const sign = feature(wallet, 'solana:signMessage') as {
    signMessage: (input: {
      account: ReturnType<typeof selectedAccount>;
      message: Uint8Array;
    }) => Promise<unknown>;
  };
  const bytes = new TextEncoder().encode(message);
  const outputs = await sign.signMessage({
    account: selectedAccount(wallet, address),
    message: bytes,
  });
  if (!Array.isArray(outputs) || outputs.length !== 1)
    throw new Error('Resposta de assinatura inválida.');
  const output: unknown = outputs[0];
  return standardSignature(output, bytes);
}
function standardSignature(output: unknown, bytes: Uint8Array): string {
  if (
    typeof output !== 'object' ||
    output === null ||
    !('signedMessage' in output) ||
    !('signature' in output)
  )
    throw new Error('Resposta de assinatura inválida.');
  const signed = output.signedMessage;
  if (
    !(signed instanceof Uint8Array) ||
    signed.length !== bytes.length ||
    !bytes.every((value, index) => value === signed[index])
  )
    throw new Error('A wallet alterou o pedido de login.');
  if ('signatureType' in output && output.signatureType !== 'ed25519')
    throw new Error('Tipo de assinatura inválido.');
  return signatureBytes(output.signature);
}

function signatureBytes(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.length !== 64)
    throw new Error('Assinatura Solana inválida.');
  return base58.encode(value);
}
export function observeStandard(
  wallet: StandardWallet,
  listener: () => void,
): () => void {
  if (!wallet.features['standard:events']) return () => {};
  const events = feature(wallet, 'standard:events') as {
    on?: (name: 'change', listener: () => void) => () => void;
  };
  return events.on?.('change', listener) ?? (() => {});
}
export interface LegacySolana {
  connect: () => Promise<unknown>;
  signMessage: (message: Uint8Array, encoding: 'utf8') => Promise<unknown>;
  publicKey?: unknown;
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
}
export function solanaProvider(value: unknown): LegacySolana | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('connect' in value) ||
    typeof value.connect !== 'function' ||
    !('signMessage' in value) ||
    typeof value.signMessage !== 'function'
  )
    return;
  return value as LegacySolana;
}
function publicAddress(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('toBase58' in value) ||
    typeof value.toBase58 !== 'function'
  )
    throw new Error('Chave Solana inválida.');
  const key = value as { toBase58: () => unknown };
  const result = key.toBase58();
  solanaPublicKey(result);
  return result as string;
}
export async function legacyIdentity(
  provider: LegacySolana,
  requestAccess: boolean,
) {
  if (requestAccess) await provider.connect();
  return {
    address: publicAddress(provider.publicKey),
    chainId: 'solana:mainnet',
    ecosystem: 'solana' as const,
  };
}
export async function signLegacy(
  provider: LegacySolana,
  message: string,
  address: string,
) {
  if (publicAddress(provider.publicKey) !== address)
    throw new Error('Wallet alterada.');
  const result = await provider.signMessage(
    new TextEncoder().encode(message),
    'utf8',
  );
  if (result instanceof Uint8Array) return signatureBytes(result);
  if (
    typeof result !== 'object' ||
    result === null ||
    !('signature' in result) ||
    ('publicKey' in result && publicAddress(result.publicKey) !== address)
  )
    throw new Error('Resposta de assinatura inválida.');
  return signatureBytes(result.signature);
}
