import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { QrCamera, qrLink, qrReceipt, renderQr } from '../device-qr/index.ts';
import { discoverWallets } from '../wallet/index.ts';
import { DeviceController } from './controller.ts';
import type { RecoveryPlan } from '../recovery-return/index.ts';
import type { VaultAuthority, VaultLocator } from '../vault-authority/index.ts';

const template = `<article class="card device-card"><span class="eyebrow">APARELHOS E RECUPERAÇÃO</span><h2>Suas chaves ficam com você.</h2>
<p>O login conecta a conta. Autorize este navegador para abrir dados cifrados. Agenda e configurações já podem ser preservadas no cofre. Conversas serão integradas depois.</p>
<p data-device-status role="status">Conecte a wallet original primeiro.</p>
<div data-device-connected hidden><label>Nome do aparelho<input data-device-name maxlength="60" autocomplete="off" value="Meu aparelho"></label>
<button data-device-action="refresh" type="button">Atualizar aparelhos</button>
<label data-recovery-wallet-label>Wallet para recuperação<select data-recovery-wallet><option>MetaMask</option><option>Phantom</option><option>Backpack</option></select></label>
<div data-device-setup hidden><p>Configure a recuperação assinando duas vezes uma mensagem exclusiva na wallet original. Nenhum código precisa ser anotado. As assinaturas precisam ser iguais; se não forem, a configuração é recusada.</p><button data-device-action="initialize" class="primary" type="button">Configurar recuperação pela wallet</button></div>
<div data-wallet-return hidden><p>Pedido privado pendente. Assine na wallet e volte a este navegador para concluir. O resultado volta cifrado e expira em cinco minutos.</p><button data-device-action="wallet-open" type="button">Abrir wallet para assinar</button><button data-device-action="wallet-finish" class="primary" type="button">Concluir recuperação</button><button data-device-action="wallet-cancel" type="button">Cancelar recuperação</button></div>
<div data-recovery-migration hidden><p>Esta conta ainda usa o código antigo. Use-o uma última vez e assine duas vezes na wallet para migrar, preservando o histórico e os aparelhos autorizados. Depois da migração, o código antigo deixa de recuperar a conta.</p><label>Código antigo para migrar<input data-migration-secret type="password" autocomplete="off" spellcheck="false"></label><button data-device-action="migrate" type="button">Migrar recuperação para wallet</button></div>
<div data-device-pending hidden><p>Em outro aparelho, entre com a mesma wallet. Para vincular este navegador, mostre o QR Code ao aparelho autorizado ou leve o código e confira seu nome e impressão. O código vale por cinco minutos e só pode ser usado uma vez. Nunca autorize códigos recebidos de desconhecidos.</p><button data-device-action="start" class="primary" type="button">Criar código de vinculação</button>
<div data-device-code-panel hidden><div data-link-qr class="device-qr"></div><label>Código para levar ao aparelho autorizado<textarea data-device-code readonly spellcheck="false"></textarea></label><p data-device-fingerprint></p><p data-device-expiry></p><button data-device-action="cancel" type="button">Cancelar código</button><button data-scan="receipt" type="button">Ler QR de confirmação</button><label>Código de confirmação mostrado pelo aparelho autorizado<input data-link-receipt autocomplete="off" spellcheck="false" maxlength="32"></label><button data-device-action="finish" class="primary" type="button">Conferir e concluir vinculação</button></div>
<details><summary>Recuperar sem aparelho anterior</summary><p data-recovery-method></p><p>A recuperação autoriza este novo aparelho e troca as chaves para novos dados. Escolha abaixo quais aparelhos revogar; os demais continuarão autorizados, com acesso aos novos dados. Cópias antigas não são apagadas dos aparelhos perdidos.</p><label data-legacy-recovery hidden>Código antigo de recuperação<input data-recovery-secret autocomplete="off" spellcheck="false" type="password"></label><fieldset data-recovery-devices><legend>Aparelhos que quero revogar</legend><button data-recovery-select="all" type="button">Selecionar todos</button><button data-recovery-select="none" type="button">Manter todos</button><div data-recovery-list></div></fieldset><p data-recovery-notice role="status"></p><p>Nenhum selecionado mantém todos. Marque os aparelhos perdidos ou que não reconhece.</p><button data-device-action="recover" class="primary" type="button">Recuperar com esta escolha</button></details></div>
<div data-device-authorized hidden><p>Este aparelho está autorizado. Confira a lista antes de compartilhar novos segredos.</p><ul data-device-list></ul><button data-scan="link" type="button">Ler QR do novo aparelho</button><label>Código gerado pelo novo aparelho<textarea data-approve-code spellcheck="false"></textarea></label><button data-device-action="inspect" type="button">Conferir aparelho</button><p data-device-candidate></p><button data-device-action="approve" class="primary" type="button" hidden>Confirmar autorização deste aparelho</button><p data-device-receipt></p><div data-receipt-qr class="device-qr" hidden></div></div>
<div data-qr-camera hidden><video muted playsinline aria-label="Câmera para leitura de QR"></video><button data-stop-camera type="button">Encerrar câmera</button></div><p class="detail">Sem a wallet original, não há acesso à conta. Se a wallet mudar a assinatura e não houver aparelho autorizado por QR, os dados não poderão ser recuperados. A assinatura privada abre o cofre: nunca compartilhe. Esta etapa não troca nem recupera a wallet.</p></div></article>`;

export function startDevices(options: {
  changed: () => Promise<void>;
  replaceDevice: () => Promise<void>;
}) {
  const controller = new DeviceController();
  const wallets = discoverWallets();
  wallets.onChange(() => renderRecoveryWalletOptions());
  const profileLeases = new WeakMap<
    CryptoKey,
    { accountId: string; epoch: number }
  >();
  let mounted: HTMLElement | null = null;
  let busy = false;
  let camera: QrCamera | null = null;
  let recoveryRevision = 0;
  const recoverySelection = new Set<string>();
  let message = 'Conecte a wallet original primeiro.';
  let candidate = '';
  let confirmation: string | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('0xdmme-device-changes')
      : null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function value(selector: string): string {
    return node<HTMLInputElement | HTMLTextAreaElement>(selector)?.value ?? '';
  }
  function text(selector: string, value: string): void {
    const element = node(selector);
    if (element) element.textContent = value;
  }
  function visible(selector: string, show: boolean): void {
    const element = node(selector);
    if (element) element.hidden = !show;
  }
  function render(): void {
    if (!mounted) return;
    text('[data-device-status]', message);
    renderRecoveryWalletOptions();
    renderPanels();
    renderSecrets();
    text(
      '[data-device-candidate]',
      controller.approvalCode || controller.receipt ? candidate : '',
    );
    mounted
      .querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
      >('button, input, textarea, select')
      .forEach((element) => {
        element.disabled = busy;
      });
    const name = node<HTMLInputElement>('[data-device-name]');
    if (name && controller.authorized && controller.identity) {
      name.value = controller.identity.public.name;
      name.disabled = true;
    }
    renderList();
    renderRecoveryList();
    renderCodes();
  }
  function renderPanels(): void {
    visible('[data-device-connected]', controller.session !== null);
    renderRecoveryPanels();
    visible(
      '[data-device-pending]',
      controller.current !== null && !controller.authorized,
    );
    visible('[data-device-authorized]', controller.authorized);
    visible(
      '[data-device-code-panel]',
      controller.pendingCode !== null ||
        controller.current?.devices.some(
          (device) => device.id === controller.session?.deviceId,
        ) === true,
    );
    visible(
      '[data-device-action="start"]',
      !controller.current?.devices.some(
        (device) => device.id === controller.session?.deviceId,
      ),
    );
    visible('[data-device-action="approve"]', controller.approvalCode !== null);
  }
  function renderRecoveryWalletOptions(): void {
    const select = node<HTMLSelectElement>('[data-recovery-wallet]');
    if (!select) return;
    const chosen = select.value;
    const names = new Set(['MetaMask', 'Phantom', 'Backpack']);
    for (const wallet of wallets.list())
      if (wallet.ecosystem === controller.session?.ecosystem)
        names.add(wallet.name);
    select.replaceChildren(
      ...[...names].map((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      }),
    );
    select.value = names.has(chosen)
      ? chosen
      : controller.session?.ecosystem === 'solana'
        ? 'Phantom'
        : 'MetaMask';
  }
  function renderRecoveryWallet(): void {
    const needed = !controller.authorized || !controller.current?.root.wallet;
    visible(
      '[data-recovery-wallet-label]',
      controller.session !== null && needed && !controller.walletPending,
    );
  }
  function renderRecoveryPanels(): void {
    visible(
      '[data-device-setup]',
      controller.session !== null &&
        controller.current === null &&
        !controller.walletPending,
    );
    visible('[data-wallet-return]', controller.walletPending !== null);
    renderRecoveryWallet();
    const legacy = !!controller.current && !controller.current.root.wallet;
    visible('[data-legacy-recovery]', legacy);
    visible(
      '[data-recovery-migration]',
      legacy &&
        (controller.authorized || controller.walletPending?.mode === 'migrate'),
    );
    visible('[data-device-action="migrate"]', !controller.walletPending);
    visible('[data-device-action="recover"]', !controller.walletPending);
    text(
      '[data-recovery-method]',
      legacy
        ? 'Esta conta ainda usa o código antigo. Recupere com ele e depois migre para a wallet.'
        : 'Assine a mensagem exclusiva com a mesma wallet usada na configuração. Nenhum código precisa ser guardado.',
    );
  }
  function renderSecrets(): void {
    const code = node<HTMLTextAreaElement>('[data-device-code]');
    if (code)
      code.value = controller.pendingCode
        ? canonical(controller.pendingCode)
        : '';
    text(
      '[data-device-fingerprint]',
      controller.pendingFingerprint
        ? `Compare esta impressão no aparelho que autoriza: ${controller.pendingFingerprint}`
        : '',
    );
    text(
      '[data-device-receipt]',
      controller.receipt
        ? `No novo aparelho, leia o QR abaixo ou digite este código de confirmação: ${controller.receipt}`
        : '',
    );
    text(
      '[data-device-expiry]',
      Date.now() < controller.expiresAt
        ? 'Código válido por até cinco minutos. Autorize apenas seu próprio aparelho.'
        : 'Código expirado. Crie um novo pedido se ainda não foi autorizado.',
    );
  }
  function renderList(): void {
    const list = node('[data-device-list]');
    if (!list) return;
    list.replaceChildren();
    for (const device of controller.current?.devices ?? []) {
      const entry = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${device.name}${device.id === controller.session?.deviceId ? ' · este aparelho' : ''} · chave ${device.signing}`;
      entry.append(label);
      if (device.id !== controller.session?.deviceId) {
        entry.append(revocationButton(device.id));
      }
      list.append(entry);
    }
  }
  function renderCodes(): void {
    const request = node('[data-link-qr]');
    const receipt = node('[data-receipt-qr]');
    const pending = controller.pendingCode;
    if (request) {
      request.hidden = !pending || Date.now() >= controller.expiresAt;
      if (!request.hidden && pending) renderQr(request, qrLink(pending));
      else {
        request.replaceChildren();
        delete request.dataset['qrPayload'];
      }
    }
    if (receipt) {
      receipt.hidden = !controller.receipt;
      if (controller.receipt) renderQr(receipt, qrReceipt(controller.receipt));
      else {
        receipt.replaceChildren();
        delete receipt.dataset['qrPayload'];
      }
    }
  }
  function renderRecoveryList(): void {
    const list = node('[data-recovery-list]');
    if (!list) return;
    const revision = controller.current?.revision ?? 0;
    if (revision !== recoveryRevision) {
      if (recoverySelection.size)
        text(
          '[data-recovery-notice]',
          'A lista de aparelhos mudou. Confira e selecione novamente antes de recuperar.',
        );
      recoverySelection.clear();
      recoveryRevision = revision;
    }
    list.replaceChildren();
    for (const device of controller.current?.devices ?? []) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = recoverySelection.has(device.id);
      input.disabled = busy;
      input.addEventListener('change', () => {
        if (input.checked) recoverySelection.add(device.id);
        else recoverySelection.delete(device.id);
      });
      label.append(
        input,
        document.createTextNode(` Revogar ${device.name} · ${device.id}`),
      );
      list.append(label);
    }
  }
  function revocationButton(id: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent =
      confirmation === id
        ? 'Confirmar revogação e trocar chaves'
        : 'Revogar aparelho';
    button.type = 'button';
    button.disabled = busy;
    button.addEventListener('click', () => {
      if (confirmation !== id) {
        confirmation = id;
        message =
          'A revogação encerra as sessões desse aparelho e troca as chaves para novos dados. As cópias antigas permanecem.';
        render();
        return;
      }
      void operate(async () => {
        await controller.revoke(id);
        confirmation = null;
        await changed();
        message =
          'Aparelho revogado. Novas chaves distribuídas somente aos aparelhos restantes.';
      });
    });
    return button;
  }
  async function changed(): Promise<void> {
    clearSecrets();
    channel?.postMessage('changed');
    await options.changed();
  }
  function clearSecrets(): void {
    for (const selector of [
      '[data-migration-secret]',
      '[data-recovery-secret]',
      '[data-link-receipt]',
    ]) {
      const input = node<HTMLInputElement>(selector);
      if (input) input.value = '';
    }
  }
  async function operate(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    camera?.stop();
    render();
    try {
      await work();
    } catch (error: unknown) {
      controller.ring = null;
      message =
        error instanceof Error
          ? error.message
          : 'Operação não concluída. Atualize para conferir o estado persistido.';
    } finally {
      busy = false;
      render();
    }
  }
  async function action(name: string): Promise<void> {
    if (
      [
        'initialize',
        'migrate',
        'wallet-open',
        'wallet-finish',
        'wallet-cancel',
      ].includes(name)
    )
      return recoveryAction(name);
    switch (name) {
      case 'refresh':
        await controller.refresh();
        await options.changed();
        message = stateMessage();
        return;
      case 'start':
        await controller.startLink(value('[data-device-name]'));
        scheduleExpiry();
        message = 'Leve o código ao aparelho autorizado.';
        return;
      case 'cancel':
        await controller.cancelLink();
        message = 'Código cancelado.';
        return;
      case 'finish':
        await controller.finishLink(value('[data-link-receipt]'));
        await changed();
        message =
          'Aparelho autorizado. Chaves abertas somente neste navegador.';
        return;
      case 'inspect':
        candidate = await controller.inspectCode(value('[data-approve-code]'));
        message =
          'Compare o nome e a impressão com o novo aparelho antes de confirmar.';
        return;
      case 'approve':
        await controller.approveLink();
        message =
          'Autorização registrada. Leve o código de confirmação ao novo aparelho.';
        await changed();
        return;
      case 'recover':
        await recover();
        return;
      default:
        throw new Error('Ação desconhecida.');
    }
  }
  async function recoveryAction(name: string): Promise<void> {
    switch (name) {
      case 'initialize':
        await walletRecovery('initialize');
        return;
      case 'migrate':
        await walletRecovery('migrate');
        return;
      case 'wallet-open':
        controller.openWalletRecovery();
        return;
      case 'wallet-finish':
        if (
          await controller.finishWalletRecovery(
            value('[data-migration-secret]'),
          )
        ) {
          await changed();
          message =
            'Recuperação pela wallet concluída. Aparelhos e histórico preservados conforme sua escolha.';
        } else
          message =
            'A assinatura ainda não chegou. Assine na wallet e volte para concluir.';
        return;
      case 'wallet-cancel':
        await controller.cancelWalletRecovery();
        message = 'Pedido de recuperação cancelado.';
        return;
      default:
        throw new Error('Ação de recuperação desconhecida.');
    }
  }
  async function recover(): Promise<void> {
    if (controller.current?.root.wallet) {
      await walletRecovery('recover');
      return;
    }
    const secret = value('[data-recovery-secret]');
    clearSecrets();
    const revoked = [...recoverySelection];
    await controller.recover({
      secret,
      name: value('[data-device-name]'),
      revoked,
      revision: recoveryRevision,
    });
    await changed();
    message = `Recuperação concluída. ${revoked.length} aparelho(s) revogado(s); os demais continuam autorizados.`;
  }
  async function walletRecovery(mode: RecoveryPlan['mode']): Promise<void> {
    const completed = await controller.beginWalletRecovery({
      mode,
      wallet: value('[data-recovery-wallet]'),
      name: value('[data-device-name]'),
      revoked: mode === 'recover' ? [...recoverySelection] : [],
      revision: recoveryRevision,
      legacy: value('[data-migration-secret]'),
    });
    clearSecrets();
    if (completed) {
      await changed();
      message =
        mode === 'migrate'
          ? 'Recuperação migrada para a wallet. O código antigo não recupera mais esta conta.'
          : 'Recuperação pela wallet verificada e aparelho autorizado.';
    } else {
      message =
        'Pedido cifrado preparado. Assine na wallet e volte para concluir.';
      controller.openWalletRecovery();
    }
  }
  function stateMessage(): string {
    if (!controller.session) return 'Conecte a wallet original primeiro.';
    if (controller.walletPending)
      return 'Recuperação privada pendente. Volte da wallet e toque em Concluir recuperação.';
    const current = controller.current;
    if (!current)
      return 'Configure a recuperação para autorizar o primeiro aparelho.';
    if (controller.authorized)
      return `Aparelho autorizado · versão ${current.revision} · chaves ${current.epoch}.`;
    if (current.revoked.includes(controller.session.deviceId))
      return 'Este cadastro foi revogado. Encerre a sessão e use um novo cadastro para recuperar.';
    return 'Login confirmado. Vincule ou recupere este aparelho para abrir os dados cifrados.';
  }
  function scheduleExpiry(): void {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(
      () => {
        if (!controller.pendingCode) return;
        message =
          'O prazo do código terminou. Se já foi autorizado, confira o código de confirmação; caso contrário, crie outro pedido.';
        render();
      },
      Math.max(0, controller.expiresAt - Date.now()),
    );
  }
  function remoteChange(): void {
    if (!controller.session || busy) return;
    void operate(async () => {
      await controller.refresh();
      await options.changed();
      message = stateMessage();
    });
  }
  channel?.addEventListener('message', remoteChange);
  window.addEventListener('focus', remoteChange);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) camera?.stop();
  });
  window.addEventListener('hashchange', () => camera?.stop());
  window.addEventListener('pagehide', () => {
    camera?.stop();
    wallets.close();
    controller.clearTransient();
    clearSecrets();
    clearTimeout(expiryTimer);
    render();
  });
  return {
    withLocalVault: <T>(
      locator: VaultLocator,
      work: (authority: VaultAuthority) => Promise<T>,
    ) => controller.withLocalVault(locator, work),
    withVault: <T>(
      offline: boolean,
      work: (authority: VaultAuthority) => Promise<T>,
    ) => controller.withVault(offline, work),
    setSession(session: AccountSession | null): void {
      camera?.stop();
      if (session?.accountId !== controller.session?.accountId) {
        recoveryRevision = 0;
        recoverySelection.clear();
      }
      controller.setSession(session);
      message = stateMessage();
      render();
    },
    async privateKey(session: AccountSession): Promise<CryptoKey | null> {
      const lease = await controller.privateKey(session);
      if (lease)
        profileLeases.set(lease.key, {
          accountId: session.accountId,
          epoch: lease.epoch,
        });
      message = stateMessage();
      render();
      return lease?.key ?? null;
    },
    async saveProfile(
      session: AccountSession,
      profile: EncryptedProfile,
      key: CryptoKey,
    ): Promise<void> {
      const lease = profileLeases.get(key);
      if (!lease || lease.accountId !== session.accountId)
        throw new Error(
          'Chave de perfil sem autorização local. Recarregue o perfil.',
        );
      await controller.saveProfile(session, profile, lease.epoch);
    },
    authorized: () => controller.authorized,
    canActivate: () =>
      !busy &&
      !camera?.active &&
      !controller.walletPending &&
      !controller.pendingCode &&
      !controller.approvalCode,
    mount(container: HTMLElement): void {
      mounted = container;
      camera?.stop();
      container.innerHTML = template;
      const wallet = node<HTMLSelectElement>('[data-recovery-wallet]');
      if (wallet && controller.session?.ecosystem === 'solana')
        wallet.value = 'Phantom';
      const video = node<HTMLVideoElement>('[data-qr-camera] video');
      if (video)
        camera = new QrCamera({
          video,
          state: (active) => visible('[data-qr-camera]', active),
          failed: (failure) => {
            message = failure;
            render();
          },
          decoded: (decoded, kind) => {
            const input = node<HTMLInputElement | HTMLTextAreaElement>(
              kind === 'link' ? '[data-approve-code]' : '[data-link-receipt]',
            );
            if (input) input.value = decoded;
            if (kind === 'link') void operate(() => action('inspect'));
            else {
              message =
                'QR de confirmação lido. Clique em conferir e concluir vinculação.';
              render();
            }
          },
        });
      mounted
        .querySelectorAll<HTMLButtonElement>('[data-scan]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            const kind = button.dataset['scan'];
            if (!busy && (kind === 'link' || kind === 'receipt'))
              camera?.start(kind);
          });
        });
      mounted
        .querySelectorAll<HTMLButtonElement>('[data-recovery-select]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            recoverySelection.clear();
            if (button.dataset['recoverySelect'] === 'all')
              controller.current?.devices.forEach((device) =>
                recoverySelection.add(device.id),
              );
            renderRecoveryList();
          });
        });
      node('[data-stop-camera]')?.addEventListener('click', () =>
        camera?.stop(),
      );
      mounted
        .querySelectorAll<HTMLButtonElement>('[data-device-action]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            void operate(() => action(button.dataset['deviceAction'] ?? ''));
          });
        });
      const replacement = document.createElement('button');
      replacement.type = 'button';
      replacement.textContent =
        'Encerrar sessão e usar novo cadastro de aparelho';
      replacement.addEventListener('click', () => {
        void operate(options.replaceDevice);
      });
      node('[data-device-pending]')?.append(replacement);
      render();
    },
  };
}
