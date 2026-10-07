import {
  AccountError,
  accountSession,
  boundedText,
  object,
  profileEnvelope,
  uuid,
} from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import { discoverWallets, SolanaConnectionError } from '../wallet/index.ts';
import type { WalletConnection, WalletName } from '../wallet/index.ts';
import { signWalletStatement } from '../wallet-statements/index.ts';
import { createApprovalDiagnostics } from './approval-diagnostics.ts';
import type { ApprovalStage } from './approval-diagnostics.ts';
import { createPendingApproval } from './pending-approval.ts';
import { serverApproval } from './server-approval.ts';
import { takeApprovalDocument } from './approval-document.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import {
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';
import {
  createWalletReturn,
  incomingWalletRequest,
  launchMobileWallet,
  mobileWalletBrowser,
} from './wallet-return.ts';
import {
  emptyProfile,
  encodePrivateProfile,
  openProfile,
  profileKey,
  sealProfile,
  validatePhoto,
} from '../account-profile/index.ts';
import type {
  PrivateProfile,
  ProfilePreferences,
} from '../account-profile/index.ts';
import {
  prepareLoginOpening,
  loginOpeningTicket,
  rememberLoginOpening,
  forgetLoginOpening,
  signLoginOpening,
} from '../wallet-opening/index.ts';
import { openingRequest } from '../../shared/wallet-opening/index.ts';
import type { OpeningRequest } from '../../shared/wallet-opening/index.ts';

const template = `<article class="card account-card"><span class="eyebrow">CONTA POR WALLET</span><h2 data-account-title>Seu perfil no 0xDMme</h2>
<p data-account-intro>Entre com sua wallet ou vincule este aparelho em Perfil → Aparelhos. Assinaturas de acesso não movimentam fundos.</p>
<button class="primary" type="button" data-wallet-approve hidden>Confirmar assinatura</button>
<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">Conectar wallet</button>
<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="Escolher wallet">
<div data-wallet-brands><h3>Escolha sua wallet</h3><p class="detail">A detecção indica disponibilidade neste navegador. No Chrome/Safari do celular, escolha o app que você instalou; ele pode não ser detectado aqui.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallets class="wallet-options"></div></div>
<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← Trocar wallet</button><h3 data-wallet-network-title></h3><p class="detail">Escolha o ecossistema da conta.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="MetaMask:solana" data-network-brand="MetaMask"><span>Solana</span><span class="wallet-detection" data-detection="MetaMask:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallet-networks class="wallet-options"></div></div>
<p class="detail">No celular, selecionar o ecossistema tenta abrir a wallet para assinar. Depois volte a este navegador para confirmar o endereço. EVM e Solana são contas separadas.</p></section>
<p data-wallet-purpose hidden>Assine apenas se você abriu este pedido no seu navegador. Ele conectará esse navegador à sua conta; recuse links recebidos de outras pessoas.</p>
<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">Abrir wallet</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>Confirmar este endereço neste navegador</button><button data-wallet-cancel type="button">Cancelar pedido</button></div>
<p class="detail" data-wallet-manual hidden>Para voltar ao navegador original, use a tela de apps recentes do celular. O pedido só terá assinatura confirmada quando esta página informar isso.</p>
<p data-account-status role="status">Verificando sessão…</p><button data-account-finish type="button" hidden>Concluir entrada na conta</button>
<details data-wallet-diagnostics hidden open><summary>Diagnóstico do login</summary><p class="detail" data-wallet-diagnostic></p><p class="detail">Se falhar, envie esta linha. Ela não contém ticket, endereço ou assinatura.</p></details>
<div data-profile hidden><div class="profile-identity"><button class="profile-avatar" data-profile-avatar type="button" aria-label="Alterar foto de perfil">#</button><div><strong data-profile-name></strong><p data-account-address class="account-address"></p><button data-profile-copy type="button">Copiar wallet</button></div></div>
<form data-name-form><label>Nome mostrado nas solicitações de contato<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">Salvar nome</button></form>
<div data-private-profile hidden><h3>Privacidade</h3>
<form data-preferences><label><input type="checkbox" name="online"> Exibir online para contatos aprovados</label><label><input type="checkbox" name="lastSeen"> Exibir último acesso para contatos aprovados</label><label><input type="checkbox" name="readReceipts"> Enviar confirmação de leitura</label><label><input type="checkbox" name="backupReminder"> Lembrar de salvar um backup a cada sete dias</label><button class="primary" type="submit">Salvar preferências</button></form></div>
<p data-profile-status role="status"></p><button data-logout type="button">Encerrar sessão</button></div></article>`;

async function api(
  path: string,
  options: { input?: unknown; csrf?: string } = {},
): Promise<unknown> {
  const response = await fetch(`/api/account/${path}`, {
    method: options.input === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers:
      options.input === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            ...(options.csrf ? { 'X-Hash-Talk-CSRF': options.csrf } : {}),
          },
    ...(options.input === undefined
      ? {}
      : { body: JSON.stringify(options.input) }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401)
    throw new AccountError(401, 'Sessão encerrada ou login rejeitado.');
  const data: unknown = await response.json();
  if (!response.ok)
    throw new AccountError(
      response.status,
      boundedText(object(data)['error'], 200),
    );
  return data;
}

function deviceId(): string {
  const stored = localStorage.getItem('hash-talk:login-device');
  if (stored) return uuid(stored);
  const id = crypto.randomUUID();
  localStorage.setItem('hash-talk:login-device', id);
  return id;
}

function mobileOpeningOptions(enabled?: true) {
  if (!enabled) return {};
  return {
    prepareOpening: prepareLoginOpening,
    openingTicket: loginOpeningTicket,
    rememberOpening: rememberLoginOpening,
    forgetOpening: forgetLoginOpening,
  };
}
export function startAccount(options: {
  mobileOpening?: true;
  changed: (session: AccountSession | null) => void;
  privacyChanged?: (preferences: ProfilePreferences) => Promise<void>;
  privateKey?: (
    session: AccountSession,
    walletOpening: 'login' | 'restore',
  ) => Promise<CryptoKey | null>;
  saveProfile?: (
    session: AccountSession,
    profile: EncryptedProfile,
    key: CryptoKey,
  ) => Promise<void>;
}) {
  const documentApproval =
    approvalEntryUrl(location.pathname) ||
    approvalDocumentUrl(location.pathname);
  let documentApprovalPending = documentApproval;
  const approvalPage = documentApproval || location.pathname === '/wallet.html';
  let cookieApprovalEligible =
    approvalPage &&
    !documentApproval &&
    (!location.hash || location.hash === '#configuracoes');
  let approvalOnly =
    approvalPage || (location.hash ?? '').startsWith('#configuracoes?');
  const diagnostics = createApprovalDiagnostics();
  const pendingApproval = createPendingApproval(expireApproval);
  let documentRemaining: number | undefined;
  let incoming = readIncoming();
  const wallets = discoverWallets();
  let incomingSigned = false;
  let approvalOpening: OpeningRequest | null = null;
  let session: AccountSession | null = null;
  let privateProfile: PrivateProfile | null = null;
  let key: CryptoKey | null = null;
  let mounted: HTMLElement | null = null;
  let mountMode: 'settings' | 'login' = 'settings';
  let forcePicker = false;
  let status = 'Conecte sua wallet para entrar.';
  let profileStatus = '';
  let busy = false;
  let pickerOpen = false;
  let selectedWallet: string | null = null;
  let dirtyName = false;
  let dirtyProfile = false;
  let draftName: string | null = null;
  let providerChanged = false;
  let disposed = false;
  let epoch = 0;
  let expiryTimer: number | undefined;
  let approvalExpiryTimer =
    documentRemaining === undefined
      ? undefined
      : window.setTimeout(expireApproval, documentRemaining);
  let approvalDeadline =
    documentRemaining === undefined
      ? undefined
      : Date.now() + documentRemaining;
  let photoUrl: string | undefined;
  let removeProviderListeners: (() => void) | undefined;

  const walletReturn = createWalletReturn({
    expectedAccount: () => (forcePicker ? session : null),
    api,
    deviceId,
    openWallet: launchMobileWallet,
    ...mobileOpeningOptions(options.mobileOpening),
    changed: () => render(),
    message: (text) => {
      status = text;
      render();
    },
    authenticated: async (authenticated) => {
      setSession(authenticated);
      status = 'Abrindo sua conta…';
      await loadPrivate(authenticated, 'login');
    },
  });
  const offWallets = wallets.onChange(() => {
    renderWallets();
    render();
  });
  function bindWalletButton(button: HTMLButtonElement): void {
    button.addEventListener('click', () => {
      const id = button.dataset['wallet'];
      if (!id || busy) return;
      pickerOpen = false;
      node<HTMLButtonElement>('[data-wallet-picker-toggle]')?.focus();
      void operation(() => login(id));
    });
  }
  function renderWallets(): void {
    updateDetection();
    renderWalletBrands();
    const other = node('[data-other-wallets]');
    const networks = node('[data-other-wallet-networks]');
    if (!other || !networks) return;
    other.replaceChildren();
    networks.replaceChildren();
    const brands = new Set(['MetaMask', 'Phantom', 'Backpack']);
    const listedNetworks = new Set([
      'MetaMask:evm',
      'MetaMask:solana',
      'Phantom:evm',
      'Phantom:solana',
      'Backpack:evm',
      'Backpack:solana',
    ]);
    for (const wallet of wallets.list()) {
      if (!brands.has(wallet.name)) {
        brands.add(wallet.name);
        const brand = walletOption(wallet.name);
        brand.dataset['walletBrand'] = wallet.name;
        bindWalletBrand(brand);
        other.append(brand);
      }
      const network = `${wallet.name}:${wallet.ecosystem}`;
      if (wallet.name !== selectedWallet || listedNetworks.has(network))
        continue;
      listedNetworks.add(network);
      const button = walletOption(
        wallet.ecosystem === 'evm' ? 'EVM' : 'Solana',
      );
      button.dataset['wallet'] = wallet.id;
      networks.append(button);
      bindWalletButton(button);
    }
  }
  function walletOption(labelText: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wallet-option';
    const label = document.createElement('span');
    label.textContent = labelText;
    const indicator = document.createElement('span');
    indicator.className = 'wallet-detection is-detected';
    indicator.textContent = 'Detectada';
    button.append(label, indicator);
    return button;
  }
  function bindWalletBrand(button: HTMLButtonElement): void {
    button.addEventListener('click', () => {
      if (busy) return;
      selectedWallet = button.dataset['walletBrand'] ?? null;
      renderWallets();
      render();
      node<HTMLButtonElement>('[data-wallet]:not([hidden])')?.focus();
    });
  }
  function renderWalletBrands(): void {
    mounted
      ?.querySelectorAll<HTMLElement>('[data-brand-detection]')
      .forEach((indicator) => {
        const brand = indicator.dataset['brandDetection'];
        const detected =
          brand !== undefined &&
          (wallets.get(brand) !== undefined ||
            wallets.get(`${brand}:solana`) !== undefined);
        indicator.textContent = detectionLabel(detected);
        indicator.classList.toggle('is-detected', detected);
      });
    mounted
      ?.querySelectorAll<HTMLButtonElement>('[data-network-brand]')
      .forEach((button) => {
        button.hidden = button.dataset['networkBrand'] !== selectedWallet;
      });
  }
  function mountPicker(container: HTMLElement): void {
    container
      .querySelectorAll<HTMLButtonElement>('[data-wallet]')
      .forEach(bindWalletButton);
    container
      .querySelectorAll<HTMLButtonElement>('[data-wallet-brand]')
      .forEach(bindWalletBrand);
    renderWallets();
    node('[data-wallet-picker-toggle]')?.addEventListener(
      'click',
      togglePicker,
    );
    node('[data-wallet-picker-back]')?.addEventListener('click', backToWallets);
    container.addEventListener('keydown', closePicker);
  }
  function backToWallets(): void {
    selectedWallet = null;
    renderWallets();
    render();
    node<HTMLButtonElement>('[data-wallet-brand]')?.focus();
  }
  function updateDetection(): void {
    mounted
      ?.querySelectorAll<HTMLElement>('[data-detection]')
      .forEach((indicator) => {
        const id = indicator.dataset['detection'];
        const detected = id !== undefined && wallets.get(id) !== undefined;
        indicator.textContent = detectionLabel(detected);
        indicator.classList.toggle('is-detected', detected);
      });
  }
  function detectionLabel(detected: boolean): string {
    if (detected) return 'Disponível neste navegador';
    return mobileWalletBrowser() ? 'Abrir no app' : 'Não detectada aqui';
  }
  function pickerVisible(): boolean {
    return (session === null || forcePicker) && !approvalOnly;
  }
  function renderPicker(): void {
    const trigger = node<HTMLButtonElement>('[data-wallet-picker-toggle]');
    const panel = node('[data-wallet-picker]');
    const visible = pickerVisible();
    if (trigger) {
      trigger.hidden = !visible;
      trigger.setAttribute('aria-expanded', String(pickerOpen && visible));
    }
    if (panel) panel.hidden = !pickerOpen || !visible;
    const brands = node('[data-wallet-brands]');
    const networks = node('[data-wallet-networks]');
    const title = node('[data-wallet-network-title]');
    if (brands) brands.hidden = selectedWallet !== null;
    if (networks) networks.hidden = selectedWallet === null;
    if (title) title.textContent = selectedWallet ?? '';
  }
  function togglePicker(): void {
    if (busy) return;
    pickerOpen = !pickerOpen;
    selectedWallet = null;
    renderWallets();
    render();
    if (pickerOpen) node<HTMLButtonElement>('[data-wallet-brand]')?.focus();
  }
  function closePicker(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !pickerOpen) return;
    event.preventDefault();
    if (selectedWallet !== null) {
      backToWallets();
      return;
    }
    pickerOpen = false;
    render();
    node<HTMLButtonElement>('[data-wallet-picker-toggle]')?.focus();
  }
  function renderReturn(): void {
    const pending = walletReturn.state();
    const panel = node('[data-wallet-return]');
    if (panel) panel.hidden = !pending || session !== null || approvalOnly;
    const open = node<HTMLAnchorElement>('[data-wallet-open]');
    const link = walletReturn.link();
    if (open) {
      open.hidden = !link;
      if (link) open.href = link;
      else open.removeAttribute('href');
    }
    renderReturnCandidate(pending);
  }
  function renderReturnCandidate(
    pending: ReturnType<typeof walletReturn.state>,
  ): void {
    const candidate = node('[data-wallet-candidate]');
    if (candidate)
      candidate.textContent = pending?.address
        ? `Endereço verificado (${pending.ecosystem}): ${pending.address}. Confirme somente se é a conta que você escolheu.`
        : 'Aguardando assinatura na wallet. Volte ao navegador que abriu o pedido.';
    const confirm = node<HTMLButtonElement>('[data-wallet-confirm]');
    if (confirm) confirm.hidden = !pending?.address;
  }
  function renderApprovalContext(): void {
    renderWalletPurpose();
    renderApproval();
    renderDiagnostics();
  }
  function renderWalletPurpose(): void {
    const purpose = node('[data-wallet-purpose]');
    if (purpose) purpose.hidden = !incoming || incomingSigned;
    const manual = node('[data-wallet-manual]');
    if (manual) manual.hidden = !approvalOnly || incomingSigned;
  }

  function renderDiagnostics(): void {
    const opening = approvalOnly ? null : walletReturn.openingDiagnostic();
    const panel = node('[data-wallet-diagnostics]');
    if (panel) panel.hidden = (!approvalOnly && !opening) || incomingSigned;
    const detail = node('[data-wallet-diagnostic]');
    if (detail)
      detail.textContent =
        opening ??
        diagnostics.text(
          incoming ? Boolean(wallets.get(approvalWalletId())) : null,
          pendingApproval.availability(),
        );
  }
  function approvalStep(stage: ApprovalStage): void {
    if (approvalOnly) diagnostics.step(stage);
  }
  function readIncoming(): ReturnType<typeof incomingWalletRequest> {
    if (documentApprovalPending) {
      documentApprovalPending = false;
      return readDocumentIncoming();
    }
    try {
      const result = incomingWalletRequest((request) => {
        if (approvalPage) pendingApproval.remember(request);
      });
      if (!result) return restoreApproval();
      approvalStep('pedido-lido');
      return result;
    } catch {
      pendingApproval.clear();
      approvalStep(
        location.hash.startsWith('#configuracoes?')
          ? 'limpeza-url-falhou'
          : 'pedido-invalido',
      );
      // A malformed new request must never recover another stored request.
      return null;
    }
  }
  function readDocumentIncoming(): ReturnType<typeof incomingWalletRequest> {
    try {
      const state = takeApprovalDocument((received) => {
        documentRemaining = received.remaining;
        pendingApproval.remember(received.request);
      });
      approvalStep('pedido-lido');
      return state.request;
    } catch {
      pendingApproval.clear();
      approvalStep('pedido-invalido');
      return null;
    }
  }
  function restoreApproval(): ReturnType<typeof incomingWalletRequest> {
    const eligible =
      approvalPage && (!location.hash || location.hash === '#configuracoes');
    const result = eligible ? pendingApproval.restore() : null;
    approvalStep(result ? 'pedido-restaurado' : 'pedido-ausente');
    return result;
  }
  function expireApproval(): void {
    if (!incoming || incomingSigned) return;
    epoch++;
    window.clearTimeout(approvalExpiryTimer);
    approvalDeadline = undefined;
    incoming = null;
    approvalStep('pedido-expirado');
    status =
      'Pedido expirou. Volte ao navegador original e inicie um novo pedido.';
    render();
  }

  function renderApproval(): void {
    if (!approvalOnly) return;
    const title = node('[data-account-title]');
    if (title) title.textContent = 'Confirme o login no seu navegador';
    const intro = node('[data-account-intro]');
    if (intro) {
      intro.hidden = incomingSigned;
      intro.textContent = approvalDescription();
    }
    const approve = node<HTMLButtonElement>('[data-wallet-approve]');
    if (!approve) return;
    approve.hidden = !incoming || incomingSigned;
    approve.textContent = `Confirmar assinatura na ${incoming?.wallet ?? 'wallet'}`;
    approve.disabled = busy || !wallets.get(approvalWalletId());
  }
  function approvalDescription(): string {
    return incoming
      ? `${incoming.wallet} · ${incoming.ecosystem === 'solana' ? 'Solana' : 'EVM'}. Confirme somente o pedido que você iniciou. A wallet pedirá assinaturas para entrar e abrir seus dados cifrados no navegador original. Não há transação ou autorização de tokens.`
      : (diagnostics.rejectionMessage() ??
          'Pedido ausente ou perdido. Volte à aba que iniciou o login e crie um novo pedido.');
  }
  function confirmApproval(): void {
    if (incoming && !busy) void operation(() => login(approvalWalletId()));
  }

  function approvalWalletId(): string {
    if (!incoming) return '';
    return incoming.ecosystem === 'solana'
      ? `${incoming.wallet}:solana`
      : incoming.wallet;
  }

  function receiveWalletRequest(): void {
    if (!location.hash.startsWith('#configuracoes?')) return;
    approvalOnly = true;
    cookieApprovalEligible = false;
    window.clearTimeout(approvalExpiryTimer);
    approvalDeadline = undefined;
    epoch++;
    incomingSigned = false;
    approvalOpening = null;
    clearPrivate();
    removeProviderListeners?.();
    removeProviderListeners = undefined;
    setSession(null);
    diagnostics.beginFragment();
    incoming = readIncoming();
    status = incoming
      ? 'Confirme a assinatura do pedido iniciado no seu navegador.'
      : 'Pedido inválido. Volte ao navegador e crie um novo pedido.';
    render();
  }

  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function clearPrivate(): void {
    key = null;
    privateProfile?.photo?.bytes.fill(0);
    privateProfile = null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
    dirtyName = false;
    dirtyProfile = false;
    draftName = null;
  }
  function setSession(value: AccountSession | null): void {
    session = value;
    forcePicker = false;
    if (value) localStorage.setItem('hash-talk:login-device', value.deviceId);
    pickerOpen = false;
    window.clearTimeout(expiryTimer);
    if (value)
      expiryTimer = window.setTimeout(
        () => {
          epoch++;
          clearPrivate();
          setSession(null);
          status = 'Sessão expirada. Entre novamente.';
          render();
        },
        Math.max(0, Date.parse(value.expiresAt) - Date.now()),
      );
    options.changed(value);
  }
  function renderPhoto(): void {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = privateProfile?.photo
      ? URL.createObjectURL(
          new Blob([privateProfile.photo.bytes], {
            type: privateProfile.photo.type,
          }),
        )
      : undefined;
    for (const avatar of [
      document.getElementById('account-avatar'),
      node('[data-profile-avatar]'),
    ]) {
      if (!avatar) continue;
      avatar.replaceChildren();
      if (photoUrl) {
        const image = document.createElement('img');
        image.src = photoUrl;
        image.alt = 'Sua foto de perfil';
        avatar.append(image);
      } else avatar.textContent = session?.name.slice(0, 1) || '#';
    }
  }

  function render(): void {
    renderSidebar();
    if (disposed || !mounted) return;
    mounted.hidden = mountMode === 'login' && session !== null;
    const message = node('[data-account-status]');
    if (message) message.textContent = status;
    const profileMessage = node('[data-profile-status]');
    if (profileMessage) profileMessage.textContent = profileStatus;
    mounted.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    mounted.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = busy;
    });
    renderPicker();
    renderReturn();
    renderApprovalContext();
    renderAccountPanels();
    if (!session) {
      clearForm();
      return;
    }
    renderProfileForm(session);
  }
  function renderAccountPanels(): void {
    const panel = node('[data-profile]');
    if (panel) panel.hidden = !session;
    const privatePanel = node('[data-private-profile]');
    if (privatePanel) privatePanel.hidden = !privateProfile;
    const finish = node('[data-account-finish]');
    if (finish)
      finish.hidden = !session || privateProfile !== null || approvalOnly;
  }
  function clearForm(): void {
    mounted?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.value = '';
      input.checked = false;
    });
    node<HTMLImageElement>('[data-photo-preview]')?.removeAttribute('src');
    const address = node('[data-account-address]');
    if (address) address.textContent = '';
    const identity = node('[data-account-id]');
    if (identity) identity.textContent = '';
    const name = node('[data-profile-name]');
    if (name) name.textContent = '';
  }
  function renderProfileForm(current: AccountSession): void {
    renderProfileIdentity(current);
    const name = node<HTMLInputElement>('input[name="display-name"]');
    if (name && document.activeElement !== name)
      name.value = draftName ?? current.name;
    if (privateProfile)
      for (const name of Object.keys(
        privateProfile.preferences,
      ) as (keyof ProfilePreferences)[]) {
        const checkbox = node<HTMLInputElement>(`input[name="${name}"]`);
        if (checkbox) checkbox.checked = privateProfile.preferences[name];
      }
    renderPhoto();
  }
  function renderProfileIdentity(current: AccountSession): void {
    const label = node('[data-profile-name]');
    if (label) label.textContent = current.name || 'Minha conta';
    const address = node('[data-account-address]');
    if (address)
      address.textContent = `Wallet ${current.ecosystem === 'evm' ? 'EVM' : 'Solana'}: ${current.address}`;
    const identity = node('[data-account-id]');
    if (identity) identity.textContent = `Conta: ${current.accountId}`;
  }
  function updateProfileRevision(
    stored: unknown,
    current: AccountSession,
  ): void {
    if (stored !== null && session?.accountId === current.accountId) {
      const revision = profileEnvelope(stored).revision;
      if (session.profileRevision !== revision)
        setSession({ ...session, profileRevision: revision });
    }
  }
  async function loadPrivate(
    current: AccountSession,
    walletOpening: 'login' | 'restore' = 'restore',
  ): Promise<void> {
    clearPrivate();
    const localKey = options.privateKey
      ? await options.privateKey(current, walletOpening)
      : await profileKey(current.accountId, current.profileRevision === 0);
    if (!localKey) {
      status = 'Sessão conectada. Abra sua conta em Perfil → Aparelhos.';
      profileStatus =
        'Perfil bloqueado. Autorize este aparelho por vinculação ou recuperação.';
      return;
    }
    const stored = await api('profile');
    updateProfileRevision(stored, current);
    const opened =
      stored === null
        ? emptyProfile()
        : await openProfile({
            envelope: profileEnvelope(stored),
            key: localKey,
            accountId: current.accountId,
          });
    if (session?.accountId !== current.accountId || disposed) {
      opened.photo?.bytes.fill(0);
      return;
    }
    key = localKey;
    privateProfile = opened;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    status = 'Conta pronta.';
    profileStatus = 'Perfil disponível.';
  }
  async function operation(work: () => Promise<void>): Promise<void> {
    if (busy || disposed) return;
    const approvalRequest = incoming;
    busy = true;
    render();
    const timer = window.setTimeout(
      () => {
        // Injected wallet prompts cannot be cancelled by the dapp. Invalidate
        // their result and keep one operation until the provider settles.
        epoch++;
        status =
          'A wallet não concluiu o pedido. Feche ou recuse a solicitação na wallet antes de tentar novamente.';
        render();
      },
      incoming
        ? Math.max(
            0,
            Math.min(
              300_000,
              (approvalDeadline ?? Date.now() + 300_000) - Date.now(),
            ),
          )
        : 90_000,
    );
    try {
      await work();
    } catch (error: unknown) {
      reportOperationError(error, approvalRequest);
    } finally {
      window.clearTimeout(timer);
      busy = false;
      render();
      if (providerChanged && session) {
        providerChanged = false;
        void operation(logout);
      }
    }
  }
  function reportOperationError(
    error: unknown,
    request: ReturnType<typeof incomingWalletRequest>,
  ): void {
    if (approvalOnly && incoming === request)
      diagnostics.fail(
        error instanceof AccountError
          ? error.status
          : error instanceof SolanaConnectionError
            ? error
            : undefined,
      );
    status =
      error instanceof AccountError || error instanceof SolanaConnectionError
        ? error.message
        : 'Operação não concluída. Confira a wallet e a conexão; tente novamente.';
  }
  async function logout(): Promise<void> {
    const current = session;
    if (options.mobileOpening) forgetLoginOpening();
    epoch++;
    removeProviderListeners?.();
    removeProviderListeners = undefined;
    clearPrivate();
    setSession(null);
    status = 'Encerrando sessão…';
    render();
    if (current) await api('logout', { input: {}, csrf: current.csrf });
    status = 'Sessão encerrada.';
  }
  function observeProvider(instance: WalletConnection): void {
    removeProviderListeners?.();
    const changed = () => {
      epoch++;
      if (session) {
        if (busy) providerChanged = true;
        else void operation(logout);
      }
    };
    removeProviderListeners = instance.observe(changed);
  }

  async function openMobileWallet(name: string): Promise<void> {
    rememberLoginWallet(name);
    if (incoming)
      throw new Error(
        'Wallet não disponível neste navegador interno. Abra novamente o pedido no navegador original.',
      );
    const [wallet, network] = name.split(':');
    if (!['MetaMask', 'Phantom', 'Backpack'].includes(wallet ?? ''))
      throw new Error('Wallet não disponível.');
    await walletReturn.start(
      wallet as WalletName,
      network === 'solana' ? 'solana' : 'evm',
    );
  }
  function checkIncoming(instance: WalletConnection): void {
    if (!incoming) return;
    if (
      incoming.ecosystem !== instance.ecosystem ||
      incoming.wallet !== instance.name ||
      incomingSigned
    )
      throw new Error('Selecione a wallet e o ecossistema do pedido original.');
  }
  function checkEpoch(current: number): void {
    if (current !== epoch || disposed)
      throw new Error('Pedido encerrado ou wallet alterada.');
  }
  async function createLoginProof(instance: WalletConnection) {
    const currentEpoch = ++epoch;
    approvalStep('conexao-solicitada');
    renderDiagnostics();
    const identity = await instance.identity(true);
    checkEpoch(currentEpoch);
    checkConfirmationWallet(identity);
    approvalStep('conexao-recebida');
    observeProvider(instance);
    approvalStep('desafio-solicitado');
    renderDiagnostics();
    const challenge = object(
      await api(incoming ? 'handoff-challenge' : 'challenge', {
        input: incoming
          ? {
              ticket: incoming.ticket,
              address: identity.address,
              chainId: identity.chainId,
            }
          : { ...identity, deviceId: deviceId() },
      }),
    );
    checkEpoch(currentEpoch);
    approvalStep('desafio-recebido');
    status =
      'Confira domínio e endereço na wallet e assine somente o pedido de login.';
    render();
    approvalStep('assinatura-solicitada');
    renderDiagnostics();
    const signature = await instance.sign(
      boundedText(challenge['message'], 2048),
      identity.address,
    );
    checkEpoch(currentEpoch);
    approvalStep('assinatura-recebida');
    const stillConnected = await instance.identity(false);
    checkEpoch(currentEpoch);
    if (
      canonicalAddress(identity.ecosystem, stillConnected.address) !==
        canonicalAddress(identity.ecosystem, identity.address) ||
      stillConnected.chainId !== identity.chainId ||
      stillConnected.ecosystem !== identity.ecosystem
    )
      throw new Error('Wallet alterada.');
    approvalStep('wallet-reconferida');
    return { id: uuid(challenge['id']), signature, currentEpoch };
  }
  function checkConfirmationWallet(identity: {
    ecosystem: AccountSession['ecosystem'];
    address: string;
  }): void {
    if (
      forcePicker &&
      session &&
      (session.ecosystem !== identity.ecosystem ||
        canonicalAddress(identity.ecosystem, identity.address) !==
          session.address)
    )
      throw new Error(
        'Selecione a wallet da conta aberta para confirmar as ações sensíveis.',
      );
  }
  function rememberLoginWallet(name: string): void {
    if (!approvalOnly)
      localStorage.setItem('0xdmme:login-wallet', name.split(':')[0] ?? name);
  }
  async function login(name: string): Promise<void> {
    rememberLoginWallet(name);
    if (approvalOnly && !incoming)
      throw new AccountError(
        400,
        'Pedido ausente. Reinicie pelo navegador original.',
      );
    const request = incoming;
    const instance = wallets.get(name);
    if (!instance) {
      await openMobileWallet(name);
      return;
    }
    checkIncoming(instance);
    if (request && approvalOpening) {
      await finishIncomingOpening(instance, request, epoch);
      return;
    }
    if (!incoming && walletReturn.state()) await walletReturn.cancel();
    status = `Confirme a conexão na ${instance.name}.`;
    render();
    const proof = await createLoginProof(instance);
    if (request) {
      approvalStep('assinatura-enviada');
      renderDiagnostics();
      const signed = object(
        await api('handoff-sign', {
          input: {
            ticket: request.ticket,
            id: proof.id,
            signature: proof.signature,
          },
        }),
      );
      checkEpoch(proof.currentEpoch);
      approvalOpening =
        signed['opening'] === undefined
          ? null
          : await openingRequest(signed['opening']);
      await finishIncomingOpening(instance, request, proof.currentEpoch);
      return;
    }
    await acceptLoginProof(proof);
  }
  async function acceptLoginProof(
    proof: Awaited<ReturnType<typeof createLoginProof>>,
  ): Promise<void> {
    const authenticated = accountSession(
      await api('login', {
        input: { id: proof.id, signature: proof.signature },
      }),
    );
    if (proof.currentEpoch !== epoch || disposed) {
      await api('logout', { input: {}, csrf: authenticated.csrf });
      return;
    }
    setSession(authenticated);
    status = 'Abrindo sua conta…';
    await loadPrivate(authenticated, 'login');
  }
  async function finishIncomingOpening(
    instance: WalletConnection,
    request: NonNullable<ReturnType<typeof incomingWalletRequest>>,
    currentEpoch: number,
  ): Promise<void> {
    if (approvalOpening) {
      status = 'Continue nesta wallet para abrir as chaves da sua conta.';
      render();
      const encrypted = await signLoginOpening({
        request: approvalOpening,
        wallet: instance,
        ticket: request.ticket,
        current: () => checkEpoch(currentEpoch),
      });
      await api('handoff-opening-submit', { input: encrypted });
    }
    checkEpoch(currentEpoch);
    pendingApproval.clear(request.ticket);
    incomingSigned = true;
    approvalStep('assinatura-confirmada');
    status = `Assinatura confirmada. Feche a ${instance.name} e volte ao navegador onde iniciou o login para confirmar o endereço.`;
    approvalStep('retorno-manual');
    render();
  }
  async function saveName(event: Event): Promise<void> {
    event.preventDefault();
    const current = session;
    const name = node<HTMLInputElement>('input[name="display-name"]')?.value;
    if (!current || name === undefined) return;
    await operation(async () => {
      const renamed = accountSession(
        await api('name', { input: { name }, csrf: current.csrf }),
      );
      if (session?.accountId === current.accountId) setSession(renamed);
      status = 'Nome salvo.';
      dirtyName = false;
      draftName = null;
    });
  }
  async function savePrivate(event: Event): Promise<void> {
    event.preventDefault();
    const current = session;
    const currentKey = key;
    const profile = privateProfile;
    if (!current || !currentKey || !profile) return;
    await operation(() => persistPrivate(current, currentKey, profile));
  }
  async function persistPrivate(
    current: AccountSession,
    currentKey: CryptoKey,
    profile: PrivateProfile,
  ): Promise<void> {
    const revision = current.profileRevision + 1;
    const envelope = await sealProfile({
      profile,
      key: currentKey,
      accountId: current.accountId,
      revision,
    });
    if (options.saveProfile)
      await options.saveProfile(current, envelope, currentKey);
    else await api('profile', { input: envelope, csrf: current.csrf });
    if (session?.accountId === current.accountId)
      setSession({ ...current, profileRevision: revision });
    await options.privacyChanged?.(profile.preferences);
    status = 'Perfil salvo.';
    dirtyProfile = false;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    renderSidebar();
  }
  async function selectPhoto(): Promise<void> {
    const file =
      document.querySelector<HTMLInputElement>('#account-photo')?.files?.[0];
    const currentProfile = privateProfile;
    if (!file || !currentProfile || file.size > 3_000_000) {
      status = 'Selecione uma foto de até 3 MB.';
      render();
      return;
    }
    await operation(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      validatePhoto(file.type, bytes);
      if (privateProfile !== currentProfile) {
        bytes.fill(0);
        return;
      }
      const previous = currentProfile.photo;
      currentProfile.photo = { type: file.type, bytes };
      if (!session || !key)
        throw new Error('Abra sua conta para alterar a foto.');
      try {
        await persistPrivate(session, key, currentProfile);
        previous?.bytes.fill(0);
      } catch (error: unknown) {
        currentProfile.photo = previous;
        bytes.fill(0);
        throw error;
      }
      renderPhoto();
    });
  }
  async function restore(): Promise<void> {
    if (approvalOnly) {
      await restoreApprovalState();
      return;
    }
    const current = epoch;
    try {
      // A 401 is an expected signed-out state; other failures must be visible.
      const response = await fetch('/api/account/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!restoreContextIsCurrent(current)) return;
      if (response.status === 401) {
        if (!incoming) await walletReturn.refresh();
        return;
      }
      if (!response.ok) throw new Error('Sessão indisponível.');
      const restored = accountSession((await response.json()) as unknown);
      if (!restoreContextIsCurrent(current)) return;
      setSession(restored);
      status = 'Abrindo sua conta…';
      await loadPrivate(restored);
    } catch {
      status =
        'Não foi possível recuperar a sessão ou abrir o perfil privado. Confira a conexão.';
    }
    render();
  }
  function restoreContextIsCurrent(current: number): boolean {
    return current === epoch && !approvalOnly && !disposed;
  }
  async function restoreApprovalState(): Promise<void> {
    if (cookieApprovalEligible && !(await restoreCookieApproval())) return;
    status = incoming
      ? 'Confirme a assinatura para concluir o login no navegador que iniciou o pedido. Recuse pedidos recebidos de terceiros.'
      : 'Pedido ausente ou perdido. Volte ao navegador original e crie um novo pedido.';
  }
  async function restoreCookieApproval(): Promise<boolean> {
    const current = epoch;
    const legacy = incoming;
    incoming = null;
    approvalStep('pedido-cookie-solicitado');
    status = 'Recuperando o pedido iniciado no seu navegador…';
    render();
    let state;
    try {
      state = serverApproval(await api('approval-request'));
    } catch (error: unknown) {
      if (disposed || current !== epoch) return false;
      pendingApproval.clear();
      throw error;
    }
    if (disposed || current !== epoch) return false;
    if (!state) {
      incoming = legacy;
      approvalStep(incoming ? 'pedido-restaurado' : 'pedido-ausente');
      return true;
    }
    pendingApproval.clear();
    incoming = state.request;
    approvalDeadline = Date.now() + state.remaining;
    approvalExpiryTimer = window.setTimeout(expireApproval, state.remaining);
    approvalStep('pedido-cookie-recebido');
    return true;
  }
  function checkApprovalDeadline(): void {
    if (approvalDeadline !== undefined && Date.now() >= approvalDeadline)
      expireApproval();
  }
  function dispose(event: PageTransitionEvent): void {
    if (event.persisted) return;
    disposed = true;
    epoch++;
    window.clearTimeout(expiryTimer);
    window.clearTimeout(approvalExpiryTimer);
    clearPrivate();
    removeProviderListeners?.();
    offWallets();
    walletReturn.close();
    pendingApproval.close();
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
  function bindProfileControls(): void {
    node('[data-name-form]')?.addEventListener('submit', (event) => {
      void saveName(event);
    });
    node('[data-preferences]')?.addEventListener('submit', (event) => {
      void savePrivate(event);
    });
    node('[data-name-form]')?.addEventListener('input', () => {
      dirtyName = true;
      draftName =
        node<HTMLInputElement>('input[name="display-name"]')?.value ?? null;
    });
    node('[data-preferences]')?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !privateProfile) return;
      const name = target.name;
      if (Object.hasOwn(privateProfile.preferences, name))
        privateProfile.preferences[name as keyof ProfilePreferences] =
          target.checked;
      dirtyProfile = true;
    });
  }
  function renderSidebar(): void {
    const label = document.getElementById('account-label');
    if (label)
      label.textContent =
        session?.name || (session ? 'Minha conta' : 'Entrar na conta');
    const wallet = document.getElementById('account-wallet');
    if (wallet)
      wallet.textContent = session
        ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}`
        : 'Login por wallet ou vinculação';
    const copy = document.getElementById('copy-wallet');
    if (copy) copy.hidden = !session;
    const feedback = document.getElementById('account-profile-feedback');
    if (feedback) feedback.textContent = busy ? 'Aguarde…' : status;
    renderPhoto();
  }
  function bindSidebar(): void {
    document.getElementById('account-avatar')?.addEventListener('click', () => {
      if (!session || !privateProfile) {
        location.hash = '#configuracoes';
        return;
      }
      document.getElementById('account-photo')?.click();
    });
    document.getElementById('account-photo')?.addEventListener('change', () => {
      void selectPhoto();
    });
    document
      .getElementById('copy-wallet')
      ?.addEventListener('click', copyWallet);
  }
  function copyWallet(): void {
    if (!session) return;
    void navigator.clipboard
      .writeText(session.address)
      .then(() => {
        status = profileStatus = 'Wallet copiada.';
        render();
      })
      .catch(() => {
        status = profileStatus = 'Não foi possível copiar a wallet.';
        render();
      });
  }
  bindSidebar();
  async function signStatement(message: string): Promise<string> {
    const active = session;
    if (!active || busy)
      throw new Error('Entre na conta e aguarde a operação atual.');
    const current = () => {
      if (session?.csrf !== active.csrf)
        throw new Error('Sessão alterada durante a assinatura.');
    };
    busy = true;
    try {
      const preferred = localStorage.getItem('0xdmme:login-wallet') ?? '';
      const wallet =
        wallets.get(
          active.ecosystem === 'solana' ? `${preferred}:solana` : preferred,
        ) ?? wallets.list().find((w) => w.ecosystem === active.ecosystem);
      if (!wallet)
        throw new Error(
          'Para assinar organizações e autorizações, abra o 0xDMme no navegador da wallet ou use uma extensão. O retorno dessas assinaturas ao Chrome/Safari ainda está pendente.',
        );
      return await signWalletStatement({
        wallet,
        identity: {
          accountId: active.accountId,
          ecosystem: active.ecosystem,
          address: active.address,
        },
        message,
        current,
      });
    } finally {
      busy = false;
    }
  }
  return {
    signStatement,
    backupProfile: () =>
      privateProfile ? encodePrivateProfile(privateProfile) : null,
    backupReminder: () => privateProfile?.preferences.backupReminder ?? false,
    async acceptLinkedSession(linked: AccountSession): Promise<void> {
      setSession(linked);
      await loadPrivate(linked);
      render();
    },
    confirmWallet(): void {
      forcePicker = true;
      pickerOpen = true;
      selectedWallet = null;
      location.hash = '#configuracoes';
      status =
        'Confirme a wallet da sua conta para liberar as ações sensíveis nesta sessão.';
      render();
    },
    privacyPreferences: () =>
      privateProfile && !dirtyProfile
        ? {
            online: privateProfile.preferences.online,
            lastSeen: privateProfile.preferences.lastSeen,
            readReceipts: privateProfile.preferences.readReceipts,
          }
        : null,
    sharedProfile: () =>
      session && privateProfile
        ? {
            name: session.name,
            revision: session.profileRevision,
            photo: privateProfile.photo,
          }
        : null,
    approvalPage,
    async refreshPrivate(): Promise<void> {
      if (!session || busy || dirtyProfile || dirtyName) return;
      const current = accountSession(await api('session'));
      setSession(current);
      await loadPrivate(current);
      render();
    },
    canActivate: () =>
      !busy &&
      !dirtyName &&
      !dirtyProfile &&
      !walletReturn.state() &&
      !incoming,
    mount(
      container: HTMLElement,
      mode: 'settings' | 'login' = 'settings',
    ): void {
      mountMode = mode;
      mounted = container;
      container.innerHTML = template; // Authored templates only.
      mountPicker(container);
      node('[data-wallet-approve]')?.addEventListener('click', confirmApproval);
      node('[data-wallet-confirm]')?.addEventListener('click', () => {
        void operation(walletReturn.confirm);
      });
      node('[data-wallet-cancel]')?.addEventListener('click', () => {
        void operation(walletReturn.cancel);
      });
      node('[data-logout]')?.addEventListener('click', () => {
        void operation(logout);
      });
      bindProfileControls();
      node('[data-account-finish]')?.addEventListener('click', () => {
        forcePicker = true;
        pickerOpen = true;
        selectedWallet = null;
        status =
          'Escolha a wallet desta conta para concluir a entrada e abrir suas chaves.';
        render();
      });
      node('[data-profile-avatar]')?.addEventListener('click', () => {
        document.getElementById('account-avatar')?.click();
      });
      node('[data-profile-copy]')?.addEventListener('click', copyWallet);
      render();
    },
  };
}
