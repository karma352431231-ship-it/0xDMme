import { keys, object } from '../../shared/account/index.ts';
import { pushRegistration } from '../../shared/daily/index.ts';
import type { PushRegistration } from '../../shared/daily/index.ts';
import { integer } from '../../shared/vault/index.ts';

export interface PushDelivery {
  expiresAt: number;
  urgency: 'normal' | 'high';
}
export interface PushDispatch extends PushDelivery {
  subscription: PushRegistration;
}
/** No arbitrary payload, account, contact or call identifier crosses this boundary. */
export function pushDispatch(input: unknown, now = Date.now()): PushDispatch {
  const d = object(input);
  keys(d, ['subscription', 'expiresAt', 'urgency']);
  const expiresAt = integer(d['expiresAt'], Number.MAX_SAFE_INTEGER);
  if (expiresAt <= now || expiresAt > now + 60_000)
    throw new Error('Aviso push expirado.');
  if (d['urgency'] !== 'normal' && d['urgency'] !== 'high')
    throw new Error('Prioridade inválida.');
  return {
    subscription: pushRegistration(d['subscription']),
    expiresAt,
    urgency: d['urgency'],
  };
}
