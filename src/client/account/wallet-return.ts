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
type Api = (
  path: string,
  options?: { input?: unknown; csrf?: string },
) => Promise<unknown>;
interface Pending {
  ecosystem: Ecosystem;
  address: string | null;
  expiresAt: string;
}
export function incomingWalletRequest(): {
  ticket: string;
  ecosystem: Ecosystem;
  wallet: WalletName;
} | null {
  const hash = location.hash ?? '';
  if (!hash.startsWith('#configuracoes?')) return null;
  // The ticket is a short-lived capability, never a session token. Remove it before other routing or network calls.
  history.replaceState(null, '', '#configuracoes');
  const params = new URLSearchParams(hash.slice('#configuracoes?'.length));
  const ticket = params.get('ticket');
  const wallet = params.get('wallet');
  if (
    !ticket ||
    !/^[a-f0-9]{64}$/u.test(ticket) ||
    !['MetaMask', 'Phantom', 'Solflare', 'Backpack'].includes(wallet ?? '')
  )
    throw new Error('Pedido de wallet inválido.');
  return {
    ticket,
    ecosystem: ecosystem(params.get('ecosystem')),
    wallet: wallet as WalletName,
  };
}
function pendingState(value: unknown): Pending | null {
  if (value === null) return null;
  const data = object(value);
  const network = ecosystem(data['ecosystem']);
  const expiresAt = boundedText(data['expiresAt'], 32);
  if (!Number.isFinite(Date.parse(expiresAt)))
    throw new Error('Prazo inválido.');
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
  const remaining = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
    throw new Error('Prazo do pedido inválido.');
  return expiresAt;
}
export function createWalletReturn(options: {
  api: Api;
  deviceId: () => string;
  changed: () => void;
  message: (text: string) => void;
  authenticated: (session: AccountSession) => Promise<void>;
  openWallet?: (link: string) => boolean;
}) {
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
  async function start(wallet: WalletName, network: Ecosystem): Promise<void> {
    if (closed) return;
    const current = ++generation;
    link = null;
    pending = null;
    const data = object(
      await options.api('handoff-start', {
        input: { ecosystem: network, deviceId: options.deviceId() },
      }),
    );
    if (closed || current !== generation) return;
    const ticket = boundedText(data['ticket'], 64);
    const expiresAt = handoffExpiry(data);
    link = walletBrowserUrl({
      origin: location.origin,
      wallet,
      ticket,
      ecosystem: network,
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
  async function confirm(): Promise<void> {
    const state = pending;
    if (!state?.address) throw new Error('A wallet ainda não assinou.');
    const current = ++generation;
    const authenticated = accountSession(
      await options.api('handoff-confirm', {
        input: { address: state.address, ecosystem: state.ecosystem },
      }),
    );
    if (closed || current !== generation) {
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

export function launchMobileWallet(link: string): boolean {
  if (!/Android|iPhone|iPad|iPod/iu.test(navigator.userAgent)) return false;
  if (!navigator.userActivation?.isActive) return false;
  // This is an attempt, not evidence that the operating system opened the app.
  location.assign(link);
  return true;
}
