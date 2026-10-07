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
} from '../../shared/wallet-opening/index.ts';
import {
  recoveryIdentity,
  transferContext,
} from '../../shared/wallet-recovery/index.ts';
import {
  openingReceiverIdentity,
  storedOpeningReceiverIdentity,
} from '../device-storage/index.ts';
import { openFrom, sealTo } from '../device-keys/index.ts';
import { signRecovery } from '../wallet-recovery/index.ts';
import type { WalletConnection } from '../wallet/index.ts';

const storageKey = '0xdmme:wallet-opening';
interface Pending {
  ticket: string;
  nonce: string;
  receiver: string;
  wallet: OpeningReceiver['wallet'];
  expires: number;
}
function pending(): Pending | null {
  const text = sessionStorage.getItem(storageKey);
  if (!text) return null;
  if (text.length > 2048) throw new Error('Entrada pendente inválida.');
  const data = object(JSON.parse(text) as unknown);
  keys(data, ['ticket', 'nonce', 'receiver', 'wallet', 'expires']);
  if (
    typeof data['expires'] !== 'number' ||
    data['expires'] <= Date.now() ||
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
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ ...receiver, ticket, expires: Date.now() + 300_000 }),
  );
}
export function forgetLoginOpening(): void {
  sessionStorage.removeItem(storageKey);
}
export function loginOpeningTicket(): string | undefined {
  return pending()?.ticket;
}
async function api(session: AccountSession, operation: 'read' | 'ack') {
  const current = pending();
  if (!current) return null;
  const response = await fetch(`/api/account/opening-${operation}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Hash-Talk-CSRF': session.csrf,
    },
    body: JSON.stringify({ ticket: current.ticket }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new AccountError(
      response.status,
      'Não foi possível concluir a entrada. Conecte a wallet novamente.',
    );
  return response.json() as Promise<unknown>;
}
export async function readLoginOpening(session: AccountSession) {
  const current = pending();
  if (!current) return null;
  const data = object(await api(session, 'read'));
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
  try {
    await api(session, 'ack');
  } catch (error: unknown) {
    // A verified, durable device grant survives expiry/restart of this temporary transport.
    if (!(error instanceof AccountError && error.status === 409)) throw error;
  }
  forgetLoginOpening();
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
