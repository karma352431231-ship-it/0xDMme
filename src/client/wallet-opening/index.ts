import { fetchApi, readApiJson } from '../api-response/index.ts';
import {
  AccountError,
  boundedText,
  keys,
  object,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, sealedSecret } from '../../shared/devices/index.ts';
import {
  openingRequest,
  openingTicket,
  openingReceiver,
} from '../../shared/wallet-opening/index.ts';
import type {
  OpeningRequest,
  OpeningReceiver,
  OpeningPending,
} from '../../shared/wallet-opening/index.ts';
import {
  recoveryIdentity,
  transferContext,
} from '../../shared/wallet-recovery/index.ts';
import {
  openingReceiverIdentity,
  storedOpeningReceiverIdentity,
  readOpeningPending,
  saveOpeningPending,
  clearOpeningPending,
} from '../device-storage/index.ts';
import { openFrom, sealTo } from '../device-keys/index.ts';
import { signRecovery } from '../wallet-recovery/index.ts';
import type { WalletConnection } from '../wallet/index.ts';

const storageKey = '0xdmme:wallet-opening';
function legacyPending(): unknown {
  let text: string | null;
  try {
    text = sessionStorage.getItem(storageKey);
  } catch {
    return undefined;
  }
  if (!text) return undefined;
  if (text.length > 2048) throw new Error('Entrada pendente inválida.');
  return JSON.parse(text) as unknown;
}
function pendingData(value: unknown): OpeningPending {
  const data = object(value);
  keys(data, ['ticket', 'nonce', 'receiver', 'wallet', 'expires']);
  if (
    typeof data['expires'] !== 'number' ||
    !Number.isSafeInteger(data['expires']) ||
    data['expires'] > Date.now() + 300_000
  )
    throw new AccountError(
      409,
      'A entrada expirou. Conecte a wallet novamente.',
    );
  const ticket = boundedText(data['ticket'], 64);
  if (!/^[a-f0-9]{64}$/u.test(ticket))
    throw new Error('Entrada pendente inválida.');
  return {
    ...openingReceiver({
      receiver: data['receiver'],
      nonce: data['nonce'],
      wallet: data['wallet'],
    }),
    ticket,
    expires: data['expires'],
  };
}
async function pending(): Promise<OpeningPending | null> {
  const stored = await readOpeningPending();
  const value = stored === undefined ? legacyPending() : stored;
  if (value === undefined) return null;
  const current = pendingData(value);
  if (current.expires <= Date.now()) {
    await forgetLoginOpening(current.ticket);
    return null;
  }
  if (
    (await openingTicket({
      receiver: current.receiver,
      nonce: current.nonce,
      wallet: current.wallet,
    })) !== current.ticket
  )
    throw new Error('Destino da entrada alterado.');
  await storedOpeningReceiverIdentity(current.receiver);
  return current;
}
export async function prepareLoginOpening(
  wallet: OpeningReceiver['wallet'],
): Promise<OpeningReceiver> {
  const identity = await openingReceiverIdentity();
  const receiver = {
    receiver: identity.public.wrapping,
    wallet,
    nonce: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
  };
  return receiver;
}
export async function rememberLoginOpening(
  receiver: OpeningReceiver,
  ticket: string,
): Promise<void> {
  if ((await openingTicket(receiver)) !== ticket)
    throw new Error('Destino da entrada alterado.');
  await storedOpeningReceiverIdentity(receiver.receiver);
  await saveOpeningPending({
    ...receiver,
    ticket,
    expires: Date.now() + 300_000,
  });
  // The receiver and its public handoff share browser storage. A new tab may
  // continue only with the original cookie and exact locally held receiver.
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Legacy tab metadata is optional. */
  }
}
export async function forgetLoginOpening(ticket?: string): Promise<void> {
  await clearOpeningPending(ticket);
  try {
    const text = sessionStorage.getItem(storageKey);
    if (
      ticket === undefined ||
      (text && object(JSON.parse(text) as unknown)['ticket'] === ticket)
    )
      sessionStorage.removeItem(storageKey);
  } catch {
    /* Legacy tab metadata never grants authorization. */
  }
}
export async function loginOpeningTicket(): Promise<string | undefined> {
  return (await pending())?.ticket;
}
async function api(
  session: AccountSession,
  operation: 'read' | 'ack',
  ticket: string,
) {
  const response = await fetchApi(
    `opening/${operation}`,
    `/api/account/opening-${operation}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Hash-Talk-CSRF': session.csrf,
      },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(8000),
    },
  );
  return readApiJson(response, `opening/${operation}`);
}
export async function readLoginOpening(session: AccountSession) {
  const current = await pending();
  if (!current) return null;
  const data = object(await api(session, 'read', current.ticket));
  keys(data, ['request', 'envelope']);
  const request = await openingRequest(data['request']);
  const transfer = request.transfer;
  recoveryIdentity(transfer.config, session, location.origin);
  const identity = await storedOpeningReceiverIdentity(current.receiver);
  if (
    transfer.ticket !== current.ticket ||
    request.nonce !== current.nonce ||
    transfer.receiver !== current.receiver ||
    transfer.receiver !== identity.public.wrapping ||
    transfer.wallet !== current.wallet
  )
    throw new Error('O destino da entrada mudou. Inicie novamente.');
  const packet = object(
    await openFrom(
      identity.wrapping,
      sealedSecret(data['envelope']),
      transferContext(transfer),
    ),
  );
  keys(packet, ['signatures']);
  const signatures = packet['signatures'];
  if (
    !Array.isArray(signatures) ||
    signatures.length !== transfer.count ||
    signatures.some((value) => typeof value !== 'string' || value.length > 132)
  )
    throw new Error('Prova privada de entrada inválida.');
  return {
    config: transfer.config,
    count: transfer.count,
    signatures: signatures as string[],
  };
}
export async function acknowledgeLoginOpening(
  session: AccountSession,
): Promise<void> {
  const current = await pending();
  if (!current) return;
  try {
    await api(session, 'ack', current.ticket);
  } catch (error: unknown) {
    // Restoring an older authorized session must not consume a new handoff.
    // Its grant remains usable, while this pending entry belongs to the new login.
    if (error instanceof AccountError && error.status === 409) return;
    throw error;
  }
  await forgetLoginOpening(current.ticket);
}
export async function signLoginOpening(input: {
  request: OpeningRequest;
  wallet: WalletConnection;
  ticket: string;
  current: () => void;
}): Promise<{ ticket: string; commitment: string; envelope: unknown }> {
  const request = await openingRequest(input.request);
  const { transfer } = request;
  if (
    transfer.ticket !== input.ticket ||
    transfer.wallet !== input.wallet.name ||
    transfer.config.origin !== location.origin
  )
    throw new Error('Pedido de abertura divergente.');
  input.current();
  const signatures = await signRecovery({
    wallet: input.wallet,
    config: transfer.config,
    count: transfer.count,
    current: input.current,
  });
  try {
    const envelope = await sealTo(
      transfer.receiver,
      { signatures },
      transferContext(transfer),
    );
    input.current();
    return {
      ticket: transfer.ticket,
      commitment: await digest(canonical(transfer)),
      envelope,
    };
  } finally {
    signatures.fill('');
  }
}
