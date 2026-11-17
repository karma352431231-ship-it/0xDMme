import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonicalAddress, ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';

export interface WalletIdentity {
  ecosystem: Ecosystem;
  address: string;
}
/** A wallet that signs in to the account. Exactly one is primary: the address
 * other people use to find the account. */
export interface AccountWallet extends WalletIdentity {
  primary: boolean;
}
/** The main wallet plus two more. With three, two of them must sign. */
export const maximumWallets = 3;
export const walletRequestSeconds = 300;

/** How many of the account's wallets must sign to enter it. */
export function signaturesRequired(wallets: number): 1 | 2 {
  if (!Number.isInteger(wallets) || wallets < 1)
    throw new Error('An account has at least one wallet.');
  return wallets >= 3 ? 2 : 1;
}
export function walletIdentity(value: unknown): WalletIdentity {
  const data = object(value);
  keys(data, ['ecosystem', 'address']);
  try {
    const network = ecosystem(data['ecosystem']);
    return {
      ecosystem: network,
      address: canonicalAddress(network, data['address']),
    };
  } catch {
    throw new AccountError(400, 'Invalid wallet.');
  }
}
export function sameWallet(a: WalletIdentity, b: WalletIdentity): boolean {
  return a.ecosystem === b.ecosystem && a.address === b.address;
}
export function accountWallets(value: unknown): AccountWallet[] {
  const data = object(value);
  keys(data, ['wallets']);
  const wallets = data['wallets'];
  if (
    !Array.isArray(wallets) ||
    !wallets.length ||
    wallets.length > maximumWallets
  )
    throw new AccountError(400, 'Invalid wallet list.');
  const result = wallets.map((entry): AccountWallet => {
    const row = object(entry);
    keys(row, ['ecosystem', 'address', 'primary']);
    if (typeof row['primary'] !== 'boolean')
      throw new AccountError(400, 'Invalid wallet list.');
    return {
      ...walletIdentity({
        ecosystem: row['ecosystem'],
        address: row['address'],
      }),
      primary: row['primary'],
    };
  });
  if (
    result.filter((wallet) => wallet.primary).length !== 1 ||
    new Set(result.map((wallet) => `${wallet.ecosystem}:${wallet.address}`))
      .size !== result.length
  )
    throw new AccountError(400, 'Invalid wallet list.');
  return result;
}

/** The server's answer to the first of two sign-in signatures. */
export interface SecondWalletRequest {
  ticket: string;
  expiresAt: string;
}
/** Null when the value is not that answer, such as a session. */
export function secondWalletRequest(
  value: unknown,
): SecondWalletRequest | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as Record<string, unknown>)['status'] !== 'second-wallet'
  )
    return null;
  const data = object(value);
  keys(data, ['status', 'ticket', 'expiresAt']);
  const ticket = boundedText(data['ticket'], 64);
  const expiresAt = boundedText(data['expiresAt'], 32);
  if (
    !/^[a-f0-9]{64}$/u.test(ticket) ||
    !Number.isFinite(Date.parse(expiresAt))
  )
    throw new AccountError(400, 'Invalid sign-in request.');
  return { ticket, expiresAt };
}
/** What the new wallet is asked to sign. */
export interface WalletAddition {
  origin: string;
  /** The account's primary wallet, so the signer sees which account it joins. */
  account: WalletIdentity;
  wallet: WalletIdentity;
  id: string;
  expiresAt: string;
}
/** The exact text the new wallet signs. Its purpose differs from sign-in and
 * recovery statements, so a signature for one is never valid for another. */
export function walletAdditionStatement(input: WalletAddition): string {
  return [
    '0xDMme - Add this wallet as a sign-in wallet',
    '',
    'Signing adds this wallet to the 0xDMme account below.',
    'After that, this wallet alone can sign in to that account.',
    'It does not move funds, send transactions or approve token spending.',
    '',
    'Sign only if you started this in your own 0xDMme settings.',
    '',
    `Origin: ${input.origin}`,
    `Account: ${input.account.ecosystem} ${input.account.address}`,
    `Wallet to add: ${input.wallet.ecosystem} ${input.wallet.address}`,
    `Request: ${input.id}`,
    `Expires: ${input.expiresAt}`,
  ].join('\n');
}
export interface WalletAdditionRequest {
  id: string;
  expiresAt: string;
  message: string;
}
export function walletAdditionRequest(value: unknown): WalletAdditionRequest {
  const data = object(value);
  keys(data, ['id', 'expiresAt', 'message']);
  const expiresAt = boundedText(data['expiresAt'], 32);
  if (
    !Number.isFinite(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString() !== expiresAt
  )
    throw new AccountError(400, 'Invalid wallet request.');
  return {
    id: uuid(data['id']),
    expiresAt,
    message: boundedText(data['message'], 2048),
  };
}
