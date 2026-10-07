import {
  AccountError,
  accountSession,
  boundedText,
  object,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  canonicalAddress,
  ecosystem,
} from '../../shared/wallet-identity/index.ts';
import type { Ecosystem } from '../../shared/wallet-identity/index.ts';
import { walletBrowserUrl } from '../wallet/index.ts';
import type { WalletName } from '../wallet/index.ts';
import { approvalHistoryMarker } from './approval-diagnostics.ts';
import { openingDiagnostics } from './opening-diagnostics.ts';
export { walletApprovalRequest } from '../../shared/wallet-approval/index.ts';
export type { WalletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import { walletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { WalletApprovalRequest } from '../../shared/wallet-approval/index.ts';
import type { OpeningReceiver } from '../../shared/wallet-opening/index.ts';
type Api = (
  path: string,
  options?: { input?: unknown; csrf?: string },
) => Promise<unknown>;
interface Pending {
  ecosystem: Ecosystem;
  address: string | null;
  expiresAt: string;
}
export function incomingWalletRequest(
  remember?: (request: WalletApprovalRequest) => void,
): WalletApprovalRequest | null {
  const hash = location.hash ?? '';
  if (!hash.startsWith('#configuracoes?')) return null;
  try {
    const params = new URLSearchParams(hash.slice('#configuracoes?'.length));
    const request = walletApprovalRequest({
      ticket: params.get('ticket'),
      wallet: params.get('wallet'),
      ecosystem: params.get('ecosystem'),
      ...(params.has('returnBrowser')
        ? { returnBrowser: params.get('returnBrowser') }
        : {}),
    });
    remember?.(request);
    return request;
  } finally {
    // Save the approved temporary handoff before a wallet can reopen this URL.
    // Strip valid and invalid fragments before routing or network calls.
    history.replaceState(approvalHistoryMarker(), '', '#configuracoes');
  }
}
function pendingState(value: unknown): Pending | null {
  if (value === null) return null;
  const data = object(value);
  const network = ecosystem(data['ecosystem']);
  const expiresAt = handoffExpiry(data);
  return {
    ecosystem: network,
    address:
      data['address'] === null
        ? null
        : canonicalAddress(network, data['address']),
    expiresAt,
  };
}
function handoffExpiry(data: Record<string, unknown>): string {
  const expiresAt = boundedText(data['expiresAt'], 32);
  const serverTime = boundedText(data['serverTime'], 32);
  // Both timestamps belong to the server's clock. The device's wall clock
  // must not reject a valid handoff; only the server/database grants authentication.
  const remaining = Date.parse(expiresAt) - Date.parse(serverTime);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
    throw new AccountError(
      502,
      'O prazo recebido para abrir a wallet é inválido ou já terminou. Crie um novo pedido.',
    );
  // This local deadline only bounds polling. It never extends server validity.
  return new Date(Date.now() + remaining).toISOString();
}
export function createWalletReturn(options: {
  api: Api;
  deviceId: () => string;
  changed: () => void;
  message: (text: string) => void;
  authenticated: (session: AccountSession) => Promise<void>;
  expectedAccount?: () => Pick<AccountSession, 'address' | 'ecosystem'> | null;
  openWallet?: (link: string) => boolean;
  prepareOpening?: (wallet: WalletName) => Promise<OpeningReceiver>;
  openingTicket?: () => string | undefined;
  rememberOpening?: (
    receiver: OpeningReceiver,
    ticket: string,
  ) => Promise<void>;
  forgetOpening?: () => void;
}) {
  const platform = /Android/iu.test(navigator.userAgent)
    ? 'android'
    : /iPhone|iPad|iPod/iu.test(navigator.userAgent)
      ? 'ios'
      : 'other';
  let pending: Pending | null = null;
  let link: string | null = null;
  let generation = 0;
  let closed = false;
  let checking = false;
  let timer: number | undefined;
  function schedule() {
    window.clearTimeout(timer);
    if (!closed && pending && Date.parse(pending.expiresAt) > Date.now())
      timer = window.setTimeout(() => {
        void refresh();
      }, 5000);
  }
  async function refresh(): Promise<void> {
    if (closed || checking) return;
    checking = true;
    const current = generation;
    try {
      const state = pendingState(await options.api('handoff-status'));
      if (closed || current !== generation) return;
      pending = state;
      if (!state) link = null;
      options.changed();
    } catch {
      if (!closed && current === generation)
        options.message(
          'Não foi possível consultar o retorno. Confira a conexão e volte a esta tela.',
        );
    } finally {
      checking = false;
      schedule();
    }
  }
  function isCurrent(current: number): boolean {
    return !closed && current === generation;
  }
  async function prepareHandoff(
    wallet: WalletName,
    network: Ecosystem,
    current: number,
  ) {
    try {
      const opening = await options.prepareOpening?.(wallet);
      if (!isCurrent(current)) return null;
      const response = await options.api('handoff-start', {
        input: {
          ecosystem: network,
          deviceId: options.deviceId(),
          ...(opening ? { opening } : {}),
        },
      });
      if (!isCurrent(current)) return null;
      const data = object(response);
      const ticket = boundedText(data['ticket'], 64);
      const expiresAt = handoffExpiry(data);
      if (opening) await options.rememberOpening?.(opening, ticket);
      return { ticket, expiresAt };
    } catch (error: unknown) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(
        503,
        'Não foi possível criar o pedido para abrir a wallet. Confira a conexão e tente novamente.',
      );
    }
  }
  async function start(wallet: WalletName, network: Ecosystem): Promise<void> {
    if (closed) return;
    const current = ++generation;
    link = null;
    pending = null;
    const prepared = await prepareHandoff(wallet, network, current);
    if (!prepared || !isCurrent(current)) return;
    const { ticket, expiresAt } = prepared;
    link = walletBrowserUrl({
      origin: location.origin,
      wallet,
      ticket,
      ecosystem: network,
      platform,
    });
    if (!link) {
      await options.api('handoff-cancel', { input: {} });
      throw new AccountError(
        400,
        'Para abrir a wallet, use o endereço HTTPS de teste no aparelho. O loopback deste computador não serve para conexão mobile.',
      );
    }
    pending = {
      ecosystem: network,
      address: null,
      expiresAt,
    };
    const attempted = options.openWallet?.(link) ?? false;
    options.message(
      attempted
        ? `Abrindo ${wallet}… Se o app não abrir, toque em Abrir ${wallet}. Conecte e assine; depois volte aqui para confirmar o endereço.`
        : `Toque em Abrir ${wallet}, conecte e assine. Depois volte a este navegador para confirmar o endereço.`,
    );
    options.changed();
    schedule();
  }
  function confirmationInput(state: Pending) {
    if (!state.address) throw new Error('A wallet ainda não assinou.');
    const expected = options.expectedAccount?.();
    if (
      expected &&
      (expected.ecosystem !== state.ecosystem ||
        canonicalAddress(state.ecosystem, expected.address) !== state.address)
    )
      throw new Error(
        'Confirme a wallet da conta que já está aberta neste aparelho.',
      );
    const openingTicket = options.openingTicket?.();
    if (options.prepareOpening && !openingTicket)
      throw new AccountError(
        409,
        'O pedido de abertura deste navegador foi perdido. Cancele e conecte novamente.',
      );
    return {
      address: state.address,
      ecosystem: state.ecosystem,
      ...(openingTicket ? { openingTicket } : {}),
    };
  }
  async function confirm(): Promise<void> {
    if (!pending) throw new Error('A wallet ainda não assinou.');
    const input = confirmationInput(pending);
    const current = ++generation;
    const authenticated = accountSession(
      await options.api('handoff-confirm', { input }),
    );
    if (!isCurrent(current)) {
      await options.api('logout', { input: {}, csrf: authenticated.csrf });
      return;
    }
    pending = null;
    link = null;
    window.clearTimeout(timer);
    await options.authenticated(authenticated);
  }
  async function cancel(): Promise<void> {
    generation++;
    pending = null;
    link = null;
    window.clearTimeout(timer);
    options.forgetOpening?.();
    await options.api('handoff-cancel', { input: {} });
    options.changed();
  }
  const focus = () => {
    if (pending) void refresh();
  };
  window.addEventListener('focus', focus);
  return {
    state: () => pending,
    link: () => link,
    openingDiagnostic: () => (link ? openingDiagnostics(link, platform) : null),
    start,
    refresh,
    confirm,
    cancel,
    close() {
      closed = true;
      generation++;
      window.clearTimeout(timer);
      window.removeEventListener('focus', focus);
      pending = null;
      link = null;
    },
  };
}

export function mobileWalletBrowser(): boolean {
  return /Android|iPhone|iPad|iPod/iu.test(navigator.userAgent);
}

export function launchMobileWallet(link: string): boolean {
  if (!mobileWalletBrowser()) return false;
  // Called only by an explicit selection after a validated, current handoff.
  // A network round trip can expire transient activation. Do not veto the
  // official HTTPS navigation ourselves; the browser/OS decides whether to
  // launch the native app, and the explicit link remains available.
  // This is an attempt, not evidence that the operating system opened the app.
  try {
    location.assign(link);
    return true;
  } catch {
    return false;
  }
}
