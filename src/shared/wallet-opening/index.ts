import { boundedText, keys, object } from '../account/index.ts';
import { canonical, digest } from '../devices/index.ts';
import {
  recoveryLanguage,
  recoveryTransfer,
} from '../wallet-recovery/index.ts';
import type {
  RecoveryLanguage,
  RecoveryTransfer,
} from '../wallet-recovery/index.ts';

export interface OpeningReceiver {
  receiver: string;
  nonce: string;
  wallet: RecoveryTransfer['wallet'];
  language?: RecoveryLanguage;
}
export interface OpeningPending extends OpeningReceiver {
  ticket: string;
  expires: number;
}
export interface OpeningRequest {
  transfer: RecoveryTransfer;
  nonce: string;
  language?: RecoveryLanguage;
}
export function openingReceiver(value: unknown): OpeningReceiver {
  const data = object(value);
  keys(data, [
    'receiver',
    'nonce',
    'wallet',
    ...(Object.hasOwn(data, 'language') ? ['language'] : []),
  ]);
  const receiver = boundedText(data['receiver'], 800);
  const nonce = boundedText(data['nonce'], 64);
  const wallet = data['wallet'];
  if (
    !/^[a-f0-9]{64}$/u.test(nonce) ||
    !['MetaMask', 'Phantom', 'Backpack'].includes(String(wallet))
  )
    throw new Error('Invalid opening destination.');
  return {
    receiver,
    nonce,
    wallet: wallet as OpeningReceiver['wallet'],
    ...(Object.hasOwn(data, 'language')
      ? { language: recoveryLanguage(data['language']) }
      : {}),
  };
}
export function openingTicket(receiver: OpeningReceiver): Promise<string> {
  return digest(
    canonical(['0xdmme-wallet-opening', 1, openingReceiver(receiver)]),
  );
}
export async function openingRequest(value: unknown): Promise<OpeningRequest> {
  const data = object(value);
  keys(data, [
    'transfer',
    'nonce',
    ...(Object.hasOwn(data, 'language') ? ['language'] : []),
  ]);
  const transfer = recoveryTransfer(data['transfer']);
  const receiver = openingReceiver({
    receiver: transfer.receiver,
    wallet: transfer.wallet,
    nonce: data['nonce'],
    ...(Object.hasOwn(data, 'language') ? { language: data['language'] } : {}),
  });
  if ((await openingTicket(receiver)) !== transfer.ticket)
    throw new Error('The opening destination was changed.');
  return {
    transfer,
    nonce: receiver.nonce,
    ...(receiver.language ? { language: receiver.language } : {}),
  };
}
