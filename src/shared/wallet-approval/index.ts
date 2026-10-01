import { object, keys } from '../account/index.ts';
import { ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';

export type WalletName = 'MetaMask' | 'Phantom' | 'Solflare' | 'Backpack';
export interface WalletApprovalRequest {
  ticket: string;
  ecosystem: Ecosystem;
  wallet: WalletName;
}
export function walletApprovalRequest(value: unknown): WalletApprovalRequest {
  const data = object(value);
  keys(data, ['ticket', 'wallet', 'ecosystem']);
  const ticket = data['ticket'];
  const wallet = data['wallet'];
  if (
    typeof ticket !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(ticket) ||
    typeof wallet !== 'string' ||
    !['MetaMask', 'Phantom', 'Solflare', 'Backpack'].includes(wallet)
  )
    throw new Error('Pedido de wallet inválido.');
  return {
    ticket,
    wallet: wallet as WalletName,
    ecosystem: ecosystem(data['ecosystem']),
  };
}
