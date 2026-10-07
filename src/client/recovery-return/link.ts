import type { RecoveryTransfer } from '../../shared/wallet-recovery/index.ts';
export function mobileLink(
  transfer: RecoveryTransfer,
  commitment: string,
): string {
  const target = `${transfer.config.origin}/recovery-entry/${transfer.ticket}/${commitment}`;
  if (!target.startsWith('https://'))
    throw new Error('O retorno mobile exige HTTPS.');
  if (transfer.wallet === 'MetaMask')
    return `https://link.metamask.io/dapp/${target.slice(8)}`;
  const base =
    transfer.wallet === 'Phantom'
      ? 'https://phantom.com/ul/browse/'
      : 'https://backpack.app/ul/v1/browse/';
  const ref =
    transfer.wallet === 'Backpack' && /Android/iu.test(navigator.userAgent)
      ? ''
      : `?ref=${encodeURIComponent(transfer.config.origin)}`;
  return `${base}${encodeURIComponent(target)}${ref}`;
}
