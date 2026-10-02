import { object, keys } from '../account/index.ts';
import { ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';

export type WalletName = 'MetaMask' | 'Phantom' | 'Backpack';
export type ReturnBrowser = 'chrome' | 'default';
export function returnBrowser(value: unknown): ReturnBrowser {
  if (value === undefined || value === 'default') return 'default';
  if (value === 'chrome') return 'chrome';
  throw new Error('Navegador de retorno inválido.');
}
export interface WalletApprovalRequest {
  ticket: string;
  ecosystem: Ecosystem;
  wallet: WalletName;
  returnBrowser?: ReturnBrowser;
}
export function walletApprovalRequest(value: unknown): WalletApprovalRequest {
  const data = object(value);
  keys(data, [
    'ticket',
    'wallet',
    'ecosystem',
    ...(Object.hasOwn(data, 'returnBrowser') ? ['returnBrowser'] : []),
  ]);
  const ticket = data['ticket'];
  const wallet = data['wallet'];
  if (
    typeof ticket !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(ticket) ||
    typeof wallet !== 'string' ||
    !['MetaMask', 'Phantom', 'Backpack'].includes(wallet)
  )
    throw new Error('Pedido de wallet inválido.');
  return {
    ticket,
    wallet: wallet as WalletName,
    ecosystem: ecosystem(data['ecosystem']),
    ...(data['returnBrowser'] === undefined
      ? {}
      : { returnBrowser: returnBrowser(data['returnBrowser']) }),
  };
}
