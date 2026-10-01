import {
  AccountError,
  accountSession,
  boundedText,
  object,
  profileEnvelope,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { discoverWallets } from '../wallet/index.ts';
import type { WalletConnection, WalletName } from '../wallet/index.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';
import {
  createWalletReturn,
  incomingWalletRequest,
  launchMobileWallet,
  mobileWalletBrowser,
} from './wallet-return.ts';
import {
  emptyProfile,
  openProfile,
  profileKey,
  sealProfile,
  validatePhoto,
} from '../account-profile/index.ts';
import type {
  PrivateProfile,
  ProfilePreferences,
} from '../account-profile/index.ts';

const template = `<article class="card account-card"><span class="eyebrow">CONTA POR WALLET</span><h2>Seu perfil no 0xDMme</h2>
<p>Conecte e assine o pedido de login. Essa assinatura não movimenta fundos e não abre o histórico.</p>
<button class="primary" type="button" data-wallet-picker-toggle aria-expanded="false" aria-controls="wallet-picker">Conectar wallet</button>
<section id="wallet-picker" class="wallet-picker" data-wallet-picker hidden aria-label="Escolher wallet">
<div data-wallet-brands><h3>Escolha sua wallet</h3><p class="detail">A detecção indica disponibilidade neste navegador. No Chrome/Safari do celular, escolha o app que você instalou; ele pode não ser detectado aqui.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet-brand="MetaMask"><span>MetaMask</span><span class="wallet-detection" data-brand-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Phantom"><span>Phantom</span><span class="wallet-detection" data-brand-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Solflare"><span>Solflare</span><span class="wallet-detection" data-brand-detection="Solflare">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet-brand="Backpack"><span>Backpack</span><span class="wallet-detection" data-brand-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallets class="wallet-options"></div></div>
<div data-wallet-networks hidden><button type="button" data-wallet-picker-back>← Trocar wallet</button><h3 data-wallet-network-title></h3><p class="detail">Escolha o ecossistema da conta.</p>
<div class="wallet-options"><button type="button" class="wallet-option" data-wallet="MetaMask" data-network-brand="MetaMask"><span>EVM</span><span class="wallet-detection" data-detection="MetaMask">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom" data-network-brand="Phantom"><span>EVM</span><span class="wallet-detection" data-detection="Phantom">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Phantom:solana" data-network-brand="Phantom"><span>Solana</span><span class="wallet-detection" data-detection="Phantom:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Solflare:solana" data-network-brand="Solflare"><span>Solana</span><span class="wallet-detection" data-detection="Solflare:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack:solana" data-network-brand="Backpack"><span>Solana</span><span class="wallet-detection" data-detection="Backpack:solana">Não detectada</span></button>
<button type="button" class="wallet-option" data-wallet="Backpack" data-network-brand="Backpack"><span>EVM</span><span class="wallet-detection" data-detection="Backpack">Não detectada</span></button></div>
<div data-other-wallet-networks class="wallet-options"></div></div>
<p class="detail">No celular, selecionar o ecossistema tenta abrir a wallet para assinar. Depois volte a este navegador para confirmar o endereço. EVM e Solana são contas separadas.</p></section>
<p data-wallet-purpose hidden>Assine apenas se você abriu este pedido no seu navegador. Ele conectará esse navegador à sua conta; recuse links recebidos de outras pessoas.</p>
<div data-wallet-return hidden><a data-wallet-open referrerpolicy="no-referrer">Abrir wallet</a><p data-wallet-candidate></p><button data-wallet-confirm type="button" hidden>Confirmar este endereço neste navegador</button><button data-wallet-cancel type="button">Cancelar pedido</button></div>
<a data-wallet-back hidden rel="noreferrer">Voltar ao 0xDMme</a>
<p data-account-status role="status">Verificando sessão…</p>
<div data-profile hidden><p data-account-address class="account-address"></p><p data-account-id class="account-address"></p>
<p>Dispositivo cadastrado; autorização criptográfica e recuperação serão configuradas na próxima etapa.</p>
<form data-name-form><label>Nome mostrado nas solicitações de contato<input name="display-name" maxlength="80" autocomplete="nickname"></label><button class="primary" type="submit">Salvar nome</button></form>
<div data-private-profile hidden><h3>Foto e preferências privadas</h3><p>Guardadas de forma cifrada. A foto será compartilhada somente com contatos aprovados, quando os contatos estiverem integrados.</p>
<img data-photo-preview hidden alt="Sua foto de perfil" width="80" height="80"><label>Foto PNG, JPEG ou WebP · até 3 MB<input data-photo type="file" accept="image/png,image/jpeg,image/webp"></label><button data-remove-photo type="button">Remover foto</button>
<form data-preferences><label><input type="checkbox" name="discoverable"> Permitir solicitações pelo endereço exato da wallet</label><label><input type="checkbox" name="online"> Exibir online para contatos aprovados</label><label><input type="checkbox" name="lastSeen"> Exibir último acesso para contatos aprovados</label><label><input type="checkbox" name="readReceipts"> Enviar confirmação de leitura</label><p class="detail">Todos começam desligados. Presença, solicitações e leitura ainda não estão disponíveis nesta versão.</p><button class="primary" type="submit">Salvar foto e preferências</button></form></div>
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
    throw new Error('Sessão encerrada ou login rejeitado.');
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

export function startAccount(options: {
  changed: (session: AccountSession | null) => void;
}) {
  const wallets = discoverWallets();
  const incoming = incomingWalletRequest();
  let incomingSigned = false;
  let session: AccountSession | null = null;
  let privateProfile: PrivateProfile | null = null;
  let key: CryptoKey | null = null;
  let mounted: HTMLElement | null = null;
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
  let photoUrl: string | undefined;
  let removeProviderListeners: (() => void) | undefined;

  const walletReturn = createWalletReturn({
    api,
    deviceId,
    openWallet: launchMobileWallet,
    changed: () => render(),
    message: (text) => {
      status = text;
      render();
    },
    authenticated: async (authenticated) => {
      setSession(authenticated);
      status = 'Conta conectada. O histórico continua bloqueado.';
      await loadPrivate(authenticated);
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
    const brands = new Set(['MetaMask', 'Phantom', 'Solflare', 'Backpack']);
    const listedNetworks = new Set([
      'MetaMask:evm',
      'Phantom:evm',
      'Phantom:solana',
      'Solflare:solana',
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
  function renderPicker(): void {
    const trigger = node<HTMLButtonElement>('[data-wallet-picker-toggle]');
    const panel = node('[data-wallet-picker]');
    const visible = session === null && !incomingSigned;
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
    if (panel) panel.hidden = !pending || session !== null;
    const open = node<HTMLAnchorElement>('[data-wallet-open]');
    const link = walletReturn.link();
    if (open) {
      open.hidden = !link;
      if (link) open.href = link;
      else open.removeAttribute('href');
    }
    const candidate = node('[data-wallet-candidate]');
    if (candidate)
      candidate.textContent = pending?.address
        ? `Endereço verificado (${pending.ecosystem}): ${pending.address}. Confirme somente se é a conta que você escolheu.`
        : 'Aguardando assinatura na wallet. Volte ao navegador que abriu o pedido.';
    const confirm = node<HTMLButtonElement>('[data-wallet-confirm]');
    if (confirm) confirm.hidden = !pending?.address;
    renderWalletPurpose();
  }
  function renderWalletPurpose(): void {
    const purpose = node('[data-wallet-purpose]');
    if (purpose) purpose.hidden = !incoming;
    const back = node<HTMLAnchorElement>('[data-wallet-back]');
    if (back) {
      back.hidden = !incomingSigned;
      back.href = `${location.origin}/#configuracoes`;
    }
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
    const image = node<HTMLImageElement>('[data-photo-preview]');
    if (!image) return;
    image.hidden = !photoUrl;
    if (photoUrl) image.src = photoUrl;
    else image.removeAttribute('src');
  }
  function render(): void {
    if (disposed || !mounted) return;
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
    const panel = node('[data-profile]');
    if (panel) panel.hidden = !session;
    const privatePanel = node('[data-private-profile]');
    if (privatePanel) privatePanel.hidden = !privateProfile;
    if (!session) {
      clearForm();
      return;
    }
    renderProfileForm(session);
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
  }
  function renderProfileForm(current: AccountSession): void {
    const address = node('[data-account-address]');
    if (address)
      address.textContent = `Wallet ${current.ecosystem === 'evm' ? 'EVM' : 'Solana'}: ${current.address}`;
    const identity = node('[data-account-id]');
    if (identity) identity.textContent = `Conta: ${current.accountId}`;
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
  async function loadPrivate(current: AccountSession): Promise<void> {
    clearPrivate();
    const localKey = await profileKey(
      current.accountId,
      current.profileRevision === 0,
    );
    if (!localKey) {
      profileStatus =
        'Perfil cifrado pertence a outro dispositivo. A vinculação e recuperação chegam na próxima etapa.';
      return;
    }
    const stored = await api('profile');
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
    profileStatus =
      'Perfil privado disponível neste navegador. A sincronização de chaves entre aparelhos ainda será integrada.';
  }
  async function operation(work: () => Promise<void>): Promise<void> {
    if (busy || disposed) return;
    busy = true;
    render();
    const timer = window.setTimeout(() => {
      // Injected wallet prompts cannot be cancelled by the dapp. Invalidate
      // their result and keep one operation until the provider settles.
      epoch++;
      status =
        'A wallet não concluiu o pedido. Feche ou recuse a solicitação na wallet antes de tentar novamente.';
      render();
    }, 90_000);
    try {
      await work();
    } catch (error: unknown) {
      status =
        error instanceof AccountError
          ? error.message
          : 'Operação não concluída. Confira a wallet e a conexão; tente novamente.';
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
  async function logout(): Promise<void> {
    const current = session;
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
    if (incoming)
      throw new Error(
        'Wallet não disponível neste navegador interno. Abra novamente o pedido no navegador original.',
      );
    const [wallet, network] = name.split(':');
    if (!['MetaMask', 'Phantom', 'Solflare', 'Backpack'].includes(wallet ?? ''))
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
    const identity = await instance.identity(true);
    checkEpoch(currentEpoch);
    observeProvider(instance);
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
    status =
      'Confira domínio e endereço na wallet e assine somente o pedido de login.';
    render();
    const signature = await instance.sign(
      boundedText(challenge['message'], 2048),
      identity.address,
    );
    checkEpoch(currentEpoch);
    const stillConnected = await instance.identity(false);
    checkEpoch(currentEpoch);
    if (
      canonicalAddress(identity.ecosystem, stillConnected.address) !==
        canonicalAddress(identity.ecosystem, identity.address) ||
      stillConnected.chainId !== identity.chainId ||
      stillConnected.ecosystem !== identity.ecosystem
    )
      throw new Error('Wallet alterada.');
    return { id: uuid(challenge['id']), signature, currentEpoch };
  }
  async function login(name: string): Promise<void> {
    const instance = wallets.get(name);
    if (!instance) {
      await openMobileWallet(name);
      return;
    }
    checkIncoming(instance);
    if (!incoming && walletReturn.state()) await walletReturn.cancel();
    status = `Confirme a conexão na ${instance.name}.`;
    render();
    const proof = await createLoginProof(instance);
    if (incoming) {
      await api('handoff-sign', {
        input: {
          ticket: incoming.ticket,
          id: proof.id,
          signature: proof.signature,
        },
      });
      incomingSigned = true;
      status =
        'Assinatura confirmada. Volte ao navegador que iniciou o pedido e confirme o endereço. Se abrir uma nova aba, retorne à aba ou PWA original.';
      return;
    }
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
    status = 'Conta conectada. O histórico continua bloqueado.';
    await loadPrivate(authenticated);
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
    await operation(async () => {
      const revision = current.profileRevision + 1;
      const envelope = await sealProfile({
        profile,
        key: currentKey,
        accountId: current.accountId,
        revision,
      });
      await api('profile', { input: envelope, csrf: current.csrf });
      if (session?.accountId === current.accountId)
        setSession({ ...current, profileRevision: revision });
      status = 'Foto e preferências salvas de forma cifrada.';
      dirtyProfile = false;
    });
  }
  async function selectPhoto(): Promise<void> {
    const file = node<HTMLInputElement>('[data-photo]')?.files?.[0];
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
      currentProfile.photo?.bytes.fill(0);
      currentProfile.photo = { type: file.type, bytes };
      dirtyProfile = true;
      status = 'Foto selecionada. Salve foto e preferências para confirmar.';
    });
  }
  async function restore(): Promise<void> {
    if (incoming) {
      status =
        'Conecte a wallet escolhida para assinar o retorno ao seu navegador. Recuse pedidos recebidos de terceiros.';
      return;
    }
    try {
      // A 401 is an expected signed-out state; other failures must be visible.
      const response = await fetch('/api/account/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401) {
        if (!incoming) await walletReturn.refresh();
        return;
      }
      if (!response.ok) throw new Error('Sessão indisponível.');
      const restored = accountSession((await response.json()) as unknown);
      if (disposed) return;
      setSession(restored);
      status = 'Conta conectada. O histórico continua bloqueado.';
      await loadPrivate(restored);
    } catch {
      status =
        'Não foi possível recuperar a sessão ou abrir o perfil privado. Confira a conexão.';
    }
    render();
  }
  function dispose(event: PageTransitionEvent): void {
    if (event.persisted) return;
    disposed = true;
    epoch++;
    window.clearTimeout(expiryTimer);
    clearPrivate();
    removeProviderListeners?.();
    offWallets();
    walletReturn.close();
    wallets.close();
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose);
  void operation(restore);
  return {
    canActivate: () =>
      !busy &&
      !dirtyName &&
      !dirtyProfile &&
      !walletReturn.state() &&
      !incoming,
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = template; // Authored templates only.
      mountPicker(container);
      node('[data-wallet-confirm]')?.addEventListener('click', () => {
        void operation(walletReturn.confirm);
      });
      node('[data-wallet-cancel]')?.addEventListener('click', () => {
        void operation(walletReturn.cancel);
      });
      node('[data-logout]')?.addEventListener('click', () => {
        void operation(logout);
      });
      node('[data-name-form]')?.addEventListener('submit', (event) => {
        void saveName(event);
      });
      node('[data-preferences]')?.addEventListener('submit', (event) => {
        void savePrivate(event);
      });
      node('[data-photo]')?.addEventListener('change', () => {
        void selectPhoto();
      });
      node('[data-remove-photo]')?.addEventListener('click', () => {
        privateProfile?.photo?.bytes.fill(0);
        if (privateProfile) privateProfile.photo = null;
        dirtyProfile = true;
        render();
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
      render();
    },
  };
}
