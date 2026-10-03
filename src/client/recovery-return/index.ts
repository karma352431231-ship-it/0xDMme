import { boundedText, keys, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, sealedSecret } from '../../shared/devices/index.ts';
import {
  recoveryTransfer,
  transferContext,
} from '../../shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import type { PendingRecovery } from './pending.ts';
import { mobileLink } from './link.ts';
import type { LocalIdentity } from '../device-keys/index.ts';
import { openFrom } from '../device-keys/index.ts';
import { walletRecoveryKey, signRecovery } from '../wallet-recovery/index.ts';
import { discoverWallets } from '../wallet/index.ts';

export async function recoveryApi(
  path: string,
  input: unknown,
  session?: AccountSession,
): Promise<unknown> {
  const response = await fetch(`/api/account/recovery-${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { 'X-Hash-Talk-CSRF': session.csrf } : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(8000),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      'Retorno de recuperação indisponível, expirado ou recusado. Inicie novamente.',
    );
  return data;
}
export async function requestRecovery(input: {
  session: AccountSession;
  identity: LocalIdentity;
  config: WalletRecovery;
  wallet: string;
  count: 1 | 2;
}): Promise<PendingRecovery> {
  const { session, identity, config, wallet, count } = input;
  const data = object(
    await recoveryApi(
      'start',
      { config, wallet, receiver: identity.public.wrapping, count },
      session,
    ),
  );
  keys(data, ['ticket', 'commitment', 'expiresAt', 'serverTime']);
  const transfer = recoveryTransfer({
    version: 1,
    ticket: data['ticket'],
    config,
    wallet,
    receiver: identity.public.wrapping,
    count,
  });
  const commitment = await digest(canonical(transfer));
  if (commitment !== data['commitment'])
    throw new Error('Chave de destino ou pedido de recuperação alterado.');
  const remaining =
    Date.parse(boundedText(data['expiresAt'], 32)) -
    Date.parse(boundedText(data['serverTime'], 32));
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
    throw new Error('Prazo de recuperação inválido.');
  return {
    transfer,
    commitment,
    deadline: Date.now() + remaining,
    link: mobileLink(transfer, commitment),
  };
}
export function openRecoveryWallet(pending: PendingRecovery): void {
  if (pending.deadline <= Date.now())
    throw new Error('O pedido de recuperação expirou.');
  location.assign(pending.link);
}
export { rememberRecovery, readRecovery, forgetRecovery } from './pending.ts';
export type { RecoveryPlan, RecoveryFlow, PendingRecovery } from './pending.ts';
export async function receiveRecovery(input: {
  session: AccountSession;
  identity: LocalIdentity;
  pending: PendingRecovery;
}): Promise<string[] | null> {
  const { session, identity, pending } = input;
  if (pending.deadline <= Date.now())
    throw new Error('O pedido de recuperação expirou. Inicie novamente.');
  const data = object(
    await recoveryApi(
      'take',
      { ticket: pending.transfer.ticket, commitment: pending.commitment },
      session,
    ),
  );
  keys(data, ['envelope', 'expiresAt', 'serverTime']);
  if (data['envelope'] === null) return null;
  const packet = object(
    await openFrom(
      identity.wrapping,
      sealedSecret(data['envelope']),
      transferContext(pending.transfer),
    ),
  );
  keys(packet, ['signatures']);
  if (
    !Array.isArray(packet['signatures']) ||
    packet['signatures'].length !== pending.transfer.count ||
    packet['signatures'].some(
      (value) => typeof value !== 'string' || value.length > 132,
    )
  )
    throw new Error('Retorno de recuperação inválido.');
  const signatures = packet['signatures'] as string[];
  try {
    await walletRecoveryKey(pending.transfer.config, signatures);
  } catch (error: unknown) {
    signatures.fill('');
    throw error;
  }
  return signatures;
}
export async function directRecovery(input: {
  config: WalletRecovery;
  wallet: string;
  count: 1 | 2;
  current: () => void;
}): Promise<string[] | null> {
  const discovery = discoverWallets();
  try {
    const wallet =
      discovery
        .list()
        .find(
          (connection) =>
            connection.name === input.wallet &&
            connection.ecosystem === input.config.ecosystem,
        ) ?? discovery.get(`${input.wallet}:${input.config.ecosystem}`);
    if (!wallet) return null;
    return await signRecovery({
      wallet,
      config: input.config,
      count: input.count,
      current: input.current,
    });
  } finally {
    discovery.close();
  }
}
