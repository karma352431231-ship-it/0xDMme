import { fetchApi, readApiJson } from '../api-response/index.ts';
import { AccountError, accountSession } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { discoverWallets, SolanaConnectionError } from '../wallet/index.ts';
import type { ProfilePreferences } from '../account-profile/index.ts';
import {
  prepareLoginOpening,
  loginOpeningTicket,
  rememberLoginOpening,
  forgetLoginOpening,
} from '../wallet-opening/index.ts';
import { ApprovalFlow } from './approval-flow.ts';
import { api, createCore, deviceId, node } from './core.ts';
import { WalletLogin } from './login.ts';
import { AccountPrivateProfile } from './private-profile.ts';
import type { ProfileOptions } from './private-profile.ts';
import { accountTemplate } from './template.ts';
import { AccountView } from './view.ts';
import { WalletPicker } from './wallet-picker.ts';
import { createWalletReturn, launchMobileWallet } from './wallet-return.ts';

function mobileOpeningOptions(enabled?: true) {
  if (!enabled) return {};
  return {
    prepareOpening: prepareLoginOpening,
    openingTicket: loginOpeningTicket,
    rememberOpening: rememberLoginOpening,
    forgetOpening: forgetLoginOpening,
  };
}

/**
 * The account screen: session lifecycle and the one-operation-at-a-time rule.
 * Choosing a wallet, the approval request, the wallet login, the private
 * profile and the rendering live in their own modules of this folder.
 */
export function startAccount(
  options: {
    mobileOpening?: true;
    changed: (session: AccountSession | null) => void;
  } & ProfileOptions,
) {
  const core = createCore();
  // The approval request is read (and the URL cleaned) before wallets are discovered.
  const approval = new ApprovalFlow(core, {
    render,
    walletAvailable: (id) => wallets.get(id) !== undefined,
    openingDiagnostic: () => walletReturn.openingDiagnostic(),
    reset: () => {
      profile.clear();
      login.stopObserving();
      setSession(null);
    },
  });
  const wallets = discoverWallets();
  const profile = new AccountPrivateProfile(core, options, {
    setSession,
    render,
    renderSidebar: () => view.renderSidebar(),
    operation,
  });
  let expiryTimer: number | undefined;
  const walletReturn = createWalletReturn({
    expectedAccount: () => core.session,
    api,
    deviceId,
    openWallet: launchMobileWallet,
    ...mobileOpeningOptions(options.mobileOpening),
    changed: () => render(),
    message: (text) => {
      core.status = text;
      render();
    },
    authenticated: async (authenticated) => {
      setSession(authenticated);
      core.status = 'Abrindo sua conta…';
      await profile.load(authenticated, 'login');
    },
  });
  const login = new WalletLogin({
    core,
    wallets,
    approval,
    walletReturn,
    host: {
      render,
      setSession,
      openAccount: (session) => profile.load(session, 'login'),
      logout: () => void operation(logout),
    },
  });
  const picker = new WalletPicker(core, wallets, {
    visible: () =>
      (core.session === null || core.forcePicker) && !approval.only,
    choose: (id) => void operation(() => login.login(id)),
    render,
  });
  const view = new AccountView({
    core,
    picker,
    approval,
    profile,
    walletReturn,
  });
  const offWallets = wallets.onChange(() => {
    picker.renderWallets();
    render();
  });

  function render(): void {
    view.render();
  }
  function setSession(value: AccountSession | null): void {
    core.session = value;
    core.forcePicker = false;
    if (value) localStorage.setItem('hash-talk:login-device', value.deviceId);
    picker.open = false;
    window.clearTimeout(expiryTimer);
    if (value) scheduleSessionExpiry(value);
    options.changed(value);
  }
  function scheduleSessionExpiry(value: AccountSession): void {
    const remaining = Math.max(0, Date.parse(value.expiresAt) - Date.now());
    // A 160-day session exceeds the maximum delay of a single browser timer.
    expiryTimer = window.setTimeout(
      () => {
        if (Date.parse(value.expiresAt) > Date.now()) {
          scheduleSessionExpiry(value);
          return;
        }
        core.epoch++;
        profile.clear();
        setSession(null);
        core.status = 'Sessão expirada. Entre novamente.';
        render();
      },
      Math.min(remaining, 2_147_483_647),
    );
  }
  async function operation(work: () => Promise<void>): Promise<void> {
    if (core.busy || core.disposed) return;
    const approvalRequest = approval.incoming;
    core.busy = true;
    render();
    const timer = window.setTimeout(() => {
      // Injected wallet prompts cannot be cancelled by the dapp. Invalidate
      // their result and keep one operation until the provider settles.
      core.epoch++;
      core.status =
        'A wallet não concluiu o pedido. Feche ou recuse a solicitação na wallet antes de tentar novamente.';
      render();
    }, approval.operationTimeout());
    try {
      await work();
    } catch (error: unknown) {
      approval.reportFailure(error, approvalRequest);
      core.status =
        error instanceof AccountError || error instanceof SolanaConnectionError
          ? error.message
          : 'Operação não concluída. Confira a wallet e a conexão; tente novamente.';
    } finally {
      window.clearTimeout(timer);
      core.busy = false;
      render();
      // Without a session the change waits for the next operation, as before.
      if (core.session && login.takeProviderChange()) void operation(logout);
    }
  }
  async function logout(): Promise<void> {
    const current = core.session;
    core.epoch++;
    login.stopObserving();
    profile.clear();
    setSession(null);
    core.status = 'Encerrando sessão…';
    render();
    try {
      if (options.mobileOpening) await forgetLoginOpening();
    } finally {
      if (current) await api('logout', { input: {}, csrf: current.csrf });
    }
    core.status = 'Sessão encerrada.';
  }
  async function restore(): Promise<void> {
    if (approval.only) {
      await approval.restore();
      return;
    }
    const current = core.epoch;
    try {
      // A 401 is an expected signed-out state; other failures must be visible.
      const response = await fetchApi(
        'account/session',
        '/api/account/session',
        {
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!restoreContextIsCurrent(current)) return;
      if (response.status === 401) {
        if (!approval.incoming) await walletReturn.refresh();
        return;
      }
      const restored = accountSession(
        await readApiJson(response, 'account/session'),
      );
      if (!restoreContextIsCurrent(current)) return;
      setSession(restored);
      // A resumed/new tab can have the old session cookie while a newly signed
      // handoff is still awaiting the original browser's explicit confirmation.
      if (options.mobileOpening) await walletReturn.refresh();
      core.status = 'Abrindo sua conta…';
      await profile.load(restored);
    } catch (error: unknown) {
      core.status =
        error instanceof AccountError
          ? error.message
          : 'Não foi possível recuperar a sessão ou abrir o perfil privado. Confira a conexão.';
    }
    render();
  }
  function restoreContextIsCurrent(current: number): boolean {
    return current === core.epoch && !approval.only && !core.disposed;
  }
  const receiveWalletRequest = () => approval.receive();
  const checkApprovalDeadline = () => approval.checkDeadline();
  function dispose(event: PageTransitionEvent): void {
    if (event.persisted) return;
    core.disposed = true;
    core.epoch++;
    window.clearTimeout(expiryTimer);
    approval.close();
    profile.clear();
    login.stopObserving();
    offWallets();
    walletReturn.close();
    wallets.close();
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('hashchange', receiveWalletRequest);
    window.removeEventListener('pageshow', checkApprovalDeadline);
    window.removeEventListener('focus', checkApprovalDeadline);
    document.removeEventListener('visibilitychange', checkApprovalDeadline);
  }
  window.addEventListener('pagehide', dispose);
  window.addEventListener('hashchange', receiveWalletRequest);
  window.addEventListener('pageshow', checkApprovalDeadline);
  window.addEventListener('focus', checkApprovalDeadline);
  document.addEventListener('visibilitychange', checkApprovalDeadline);
  void operation(restore);
  view.bindSidebar();
  function requestPicker(message: string): void {
    picker.request();
    core.status = message;
    render();
  }
  function mount(
    container: HTMLElement,
    mode: 'settings' | 'login' = 'settings',
  ): void {
    core.mountMode = mode;
    core.mounted = container;
    container.innerHTML = accountTemplate; // Authored templates only.
    picker.mount(container);
    node(core, '[data-wallet-approve]')?.addEventListener('click', () => {
      if (approval.incoming && !core.busy)
        void operation(() => login.login(approval.walletId()));
    });
    node(core, '[data-wallet-confirm]')?.addEventListener('click', () => {
      void operation(walletReturn.confirm);
    });
    node(core, '[data-wallet-cancel]')?.addEventListener('click', () => {
      void operation(walletReturn.cancel);
    });
    node(core, '[data-logout]')?.addEventListener('click', () => {
      void operation(logout);
    });
    profile.bind();
    node(core, '[data-account-finish]')?.addEventListener('click', () => {
      requestPicker(
        'Escolha a wallet desta conta para concluir a entrada e abrir suas chaves.',
      );
    });
    node(core, '[data-profile-avatar]')?.addEventListener('click', () => {
      document.getElementById('account-avatar')?.click();
    });
    node(core, '[data-profile-copy]')?.addEventListener('click', () =>
      view.copyWallet(),
    );
    render();
  }
  return {
    signStatement: (message: string) => login.signStatement(message),
    backupProfile: () => profile.backup(),
    backupReminder: () => profile.backupReminder(),
    savePrivacy: (changes: Partial<ProfilePreferences>) =>
      profile.savePrivacy(changes),
    async acceptLinkedSession(linked: AccountSession): Promise<void> {
      setSession(linked);
      await profile.load(linked);
      render();
    },
    confirmWallet(): void {
      picker.request();
      location.hash = '#configuracoes';
      core.status =
        'Confirme a wallet da sua conta para liberar as ações sensíveis nesta sessão.';
      render();
    },
    privacyPreferences: () => profile.privacyPreferences(),
    sharedProfile: () => profile.shared(),
    approvalPage: approval.page,
    refreshPrivate: () => profile.refresh(),
    canActivate: () =>
      !core.busy &&
      profile.clean &&
      !walletReturn.state() &&
      !approval.incoming,
    mount,
  };
}
