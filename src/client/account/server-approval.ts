import { object, boundedText, keys } from '../../shared/account/index.ts';
import { walletApprovalRequest } from '../../shared/wallet-approval/index.ts';

/** Server timestamps determine remaining time; device clock never grants login. */
export function serverApproval(value: unknown) {
  if (value === null) return null;
  const data = object(value);
  keys(data, ['request', 'expiresAt', 'serverTime']);
  const remaining =
    Date.parse(boundedText(data['expiresAt'], 32)) -
    Date.parse(boundedText(data['serverTime'], 32));
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
    throw new Error('Pedido expirou ou é inválido.');
  return { request: walletApprovalRequest(data['request']), remaining };
}
