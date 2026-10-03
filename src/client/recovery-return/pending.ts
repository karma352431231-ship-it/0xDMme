import { boundedText, keys, object, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, fingerprint } from '../../shared/devices/index.ts';
import {
  recoveryIdentity,
  recoveryTransfer,
  walletRecovery,
} from '../../shared/wallet-recovery/index.ts';
import type {
  WalletRecovery,
  RecoveryTransfer,
} from '../../shared/wallet-recovery/index.ts';
import { mobileLink } from './link.ts';

export interface PendingRecovery {
  transfer: RecoveryTransfer;
  commitment: string;
  deadline: number;
  link: string;
}

export interface RecoveryPlan {
  mode: 'initialize' | 'recover' | 'migrate';
  config: WalletRecovery;
  name: string;
  revoked: string[];
  revision: number;
  head: string | null;
}
export interface RecoveryFlow extends RecoveryPlan {
  pending: PendingRecovery;
}
function storageKey(session: AccountSession): string {
  return `0xdmme:private-recovery-return:${session.accountId}:${session.deviceId}`;
}
/** Only public request metadata survives navigation; never a signature, key or
 * legacy recovery secret. Destination private key remains non-exportable IDB. */
export function rememberRecovery(
  session: AccountSession,
  flow: RecoveryFlow,
): void {
  const text = JSON.stringify(flow);
  if (text.length > 4096) throw new Error('Pedido de recuperação excedido.');
  sessionStorage.setItem(storageKey(session), text);
}
export function forgetRecovery(session: AccountSession): void {
  if (typeof sessionStorage !== 'undefined')
    sessionStorage.removeItem(storageKey(session));
}
export async function readRecovery(
  session: AccountSession,
  receiver: string,
): Promise<RecoveryFlow | null> {
  const text = sessionStorage.getItem(storageKey(session));
  if (!text) return null;
  try {
    return await parseFlow(text, session, receiver);
  } catch {
    forgetRecovery(session);
    return null;
  }
}
function validatePlan(
  mode: unknown,
  revoked: unknown,
  revision: unknown,
): void {
  if (
    !['initialize', 'recover', 'migrate'].includes(String(mode)) ||
    !Array.isArray(revoked) ||
    revoked.length > 32 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision > 128
  )
    throw new Error('Pedido inválido.');
}
async function parseFlow(
  text: string,
  session: AccountSession,
  receiver: string,
): Promise<RecoveryFlow> {
  if (text.length > 4096) throw new Error('Pedido excedido.');
  const data = object(JSON.parse(text) as unknown);
  keys(data, [
    'mode',
    'config',
    'name',
    'revoked',
    'revision',
    'head',
    'pending',
  ]);
  const mode = data['mode'];
  const revoked = data['revoked'];
  const revision = data['revision'];
  validatePlan(mode, revoked, revision);
  const config = walletRecovery(data['config']);
  recoveryIdentity(config, session, location.origin);
  const pending = await parsePending(data['pending'], receiver);
  if (
    canonical(config) !== canonical(pending.transfer.config) ||
    pending.transfer.count !== (mode === 'recover' ? 1 : 2)
  )
    throw new Error('Pedido divergente.');
  return {
    mode: mode as RecoveryPlan['mode'],
    config,
    name: boundedText(data['name'], 60),
    revoked: (revoked as unknown[]).map(uuid),
    revision: revision as number,
    head: data['head'] === null ? null : fingerprint(data['head']),
    pending,
  };
}
async function parsePending(
  value: unknown,
  receiver: string,
): Promise<PendingRecovery> {
  const data = object(value);
  keys(data, ['transfer', 'commitment', 'deadline', 'link']);
  const transfer = recoveryTransfer(data['transfer']);
  const commitment = fingerprint(data['commitment']);
  const deadline = data['deadline'];
  const link = boundedText(data['link'], 2048);
  if (
    transfer.receiver !== receiver ||
    (await digest(canonical(transfer))) !== commitment ||
    typeof deadline !== 'number' ||
    !Number.isFinite(deadline) ||
    deadline <= Date.now() ||
    deadline > Date.now() + 300_000
  )
    throw new Error('Retorno inválido ou expirado.');
  if (link !== mobileLink(transfer, commitment))
    throw new Error('Destino da wallet alterado.');
  return { transfer, commitment, deadline, link };
}
