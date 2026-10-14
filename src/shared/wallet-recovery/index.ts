import {
  AccountError,
  base64,
  boundedText,
  encode,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonicalAddress, ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';
import { bilingualRecoveryStatement } from './statement.ts';
import { localizedRecoveryStatement } from './localized-statement.ts';
import type { RecoveryLanguage, WalletRecovery } from './configuration.ts';
export type { RecoveryLanguage, WalletRecovery } from './configuration.ts';

export const walletRecoveryVersion = 3;

export function recoveryLanguage(value: unknown): RecoveryLanguage {
  if (value !== 'en' && value !== 'zh-CN')
    throw new AccountError(400, 'Configuração de recuperação inválida.');
  return value;
}
function recoveryOrigin(value: unknown): string {
  const text = boundedText(value, 256);
  const url = new URL(text);
  const local =
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.origin !== text)
    throw new AccountError(400, 'Origem de recuperação inválida.');
  return text;
}
export function walletRecovery(value: unknown): WalletRecovery {
  const input = object(value);
  keys(input, [
    'version',
    'accountId',
    'origin',
    'ecosystem',
    'address',
    'id',
    'salt',
    ...(input['version'] === 3 ? ['language'] : []),
  ]);
  const network = ecosystem(input['ecosystem']);
  const address = canonicalAddress(network, input['address']);
  const salt = base64(input['salt'], 32);
  if (
    (input['version'] !== 2 && input['version'] !== walletRecoveryVersion) ||
    address !== input['address'] ||
    salt.length !== 32 ||
    encode(salt) !== input['salt']
  )
    throw new AccountError(400, 'Configuração de recuperação inválida.');
  const config = {
    accountId: uuid(input['accountId']),
    origin: recoveryOrigin(input['origin']),
    ecosystem: network,
    address,
    id: uuid(input['id']),
    salt: input['salt'],
  };
  return input['version'] === 2
    ? { ...config, version: 2 }
    : { ...config, version: 3, language: recoveryLanguage(input['language']) };
}
export function recoveryMessage(value: WalletRecovery): string {
  const config = walletRecovery(value);
  return config.version === 2
    ? bilingualRecoveryStatement(config)
    : localizedRecoveryStatement(config);
}
export function recoveryIdentity(
  config: WalletRecovery,
  identity: { accountId: string; ecosystem: Ecosystem; address: string },
  origin: string,
): void {
  if (
    config.origin !== origin ||
    config.accountId !== identity.accountId ||
    config.ecosystem !== identity.ecosystem ||
    config.address !== canonicalAddress(identity.ecosystem, identity.address)
  )
    throw new AccountError(
      403,
      'A recuperação pertence a outra conta ou origem.',
    );
}
export interface RecoveryTransfer {
  version: 1;
  ticket: string;
  wallet: 'MetaMask' | 'Phantom' | 'Backpack';
  config: WalletRecovery;
  receiver: string;
  count: 1 | 2;
}
export function recoveryTransfer(value: unknown): RecoveryTransfer {
  const input = object(value);
  keys(input, ['version', 'ticket', 'wallet', 'config', 'receiver', 'count']);
  const ticket = boundedText(input['ticket'], 64);
  const wallet = input['wallet'];
  if (
    input['version'] !== 1 ||
    !/^[a-f0-9]{64}$/u.test(ticket) ||
    !['MetaMask', 'Phantom', 'Backpack'].includes(String(wallet)) ||
    ![1, 2].includes(Number(input['count'])) ||
    typeof input['count'] !== 'number'
  )
    throw new AccountError(400, 'Retorno de recuperação inválido.');
  if (base64(input['receiver'], 422).length !== 422)
    throw new AccountError(400, 'Destino de recuperação inválido.');
  return {
    version: 1,
    ticket,
    wallet: wallet as RecoveryTransfer['wallet'],
    config: walletRecovery(input['config']),
    receiver: input['receiver'] as string,
    count: input['count'] as 1 | 2,
  };
}
export function recoveryEntry(
  path = '',
): { ticket: string; commitment: string } | null {
  const match = /^\/recovery-entry\/([a-f0-9]{64})\/([a-f0-9]{64})$/u.exec(
    path,
  );
  return match
    ? { ticket: match[1] as string, commitment: match[2] as string }
    : null;
}
export function transferContext(transfer: RecoveryTransfer): unknown[] {
  return ['0xdmme-private-recovery-return', 1, recoveryTransfer(transfer)];
}
