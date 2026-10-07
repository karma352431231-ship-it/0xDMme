import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import { enrollmentPayload } from '../../shared/device-enrollment/index.ts';
import type { EnrollmentCode } from '../../shared/device-enrollment/index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { DeviceController } from './controller.ts';
import type { VaultAuthority, VaultLocator } from '../vault-authority/index.ts';
import {
  acknowledgeLoginOpening,
  readLoginOpening,
} from '../wallet-opening/index.ts';

export function startDevices(options: {
  changed: () => Promise<void>;
  linked?: (session: AccountSession) => Promise<void>;
  confirmWallet?: () => void;
}) {
  const controller = new DeviceController();
  const leases = new WeakMap<CryptoKey, { accountId: string; epoch: number }>();
  let mounted: HTMLElement | null = null,
    busy = false,
    failed = false;
  let message = 'Entre com a wallet ou use um código de vinculação.';
  let invitation: EnrollmentCode | null = null,
    waiting = false,
    deadline = 0;
  let attempted: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let camera: QrCamera | null = null;
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('0xdmme-device-changes')
      : null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function show(selector: string, visible: boolean): void {
    const element = node(selector);
    if (element) element.hidden = !visible;
  }
  function render(): void {
    const status = node('[data-device-status]');
    if (status) status.textContent = message;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    renderPanels();
    renderInvitation();
    renderList();
  }
  function renderPanels(): void {
    show('[data-devices-connected]', controller.authorized);
    show('[data-device-join]', !controller.authorized && !waiting);
    show(
      '[data-device-wallet]',
      controller.session !== null &&
        controller.session.walletConfirmed !== true,
    );
    show(
      '[data-device-retry]',
      failed ||
        (!!controller.session &&
          !controller.authorized &&
          !controller.walletPending),
    );
    show('[data-wallet-pending]', controller.walletPending !== null);
    show('[data-enrollment-code]', invitation !== null);
  }
  function renderInvitation(): void {
    const code = node<HTMLTextAreaElement>('[data-device-code]');
    if (code) code.value = invitation ? enrollmentPayload(invitation) : '';
    const qr = node('[data-link-qr]');
    if (qr && invitation) renderQr(qr, enrollmentPayload(invitation));
    else qr?.replaceChildren();
  }
  function renderList(): void {
    const list = node('[data-device-list]');
    if (!list) return;
    list.replaceChildren();
    for (const device of controller.current?.devices ?? []) {
      const item = document.createElement('li'),
        label = document.createElement('span');
      label.textContent =
        device.name +
        (device.id === controller.session?.deviceId ? ' · este aparelho' : '');
      item.append(label);
      if (device.id !== controller.session?.deviceId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Revogar';
        button.disabled = busy;
        button.addEventListener('click', () => {
          if (controller.session?.walletConfirmed !== true) {
            options.confirmWallet?.();
            return;
          }
          if (
            !window.confirm(
              'Revogar este aparelho? Ele perderá acesso aos novos dados.',
            )
          )
            return;
          void run(async () => {
            await controller.revoke(device.id);
            message = 'Aparelho revogado.';
            await changed();
          });
        });
        item.append(button);
      }
      list.append(item);
    }
  }
  async function changed(): Promise<void> {
    notifyMessageControls();
    channel?.postMessage('changed');
    await options.changed();
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    failed = false;
    render();
    try {
      await work();
    } catch (error: unknown) {
      failed = true;
      invitation = null;
      waiting = false;
      message =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.';
    } finally {
      busy = false;
      render();
      schedule();
    }
  }
  function schedule(): void {
    clearTimeout(timer);
    expireWalletRequest();
    if (invitation || waiting || controller.walletPending)
      timer = setTimeout(() => {
        void poll();
      }, 5000);
  }
  function expireWalletRequest(): void {
    if (!controller.expireWalletRecovery()) return;
    clearTimeout(timer);
    failed = true;
    message =
      'O pedido na wallet expirou. Toque em Abrir conta para tentar novamente.';
    render();
  }
  async function poll(): Promise<void> {
    if (busy || document.visibilityState === 'hidden' || !navigator.onLine) {
      schedule();
      return;
    }
    await run(async () => {
      if (controller.walletPending) {
        if (await controller.finishWalletRecovery()) {
          message = 'Conta pronta.';
          await changed();
        }
        return;
      }
      if (Date.now() >= deadline)
        throw new Error('Código expirado. Gere um novo código para vincular.');
      if (invitation) {
        if (await controller.approveEnrollment(invitation)) {
          invitation = null;
          message = 'Novo aparelho vinculado.';
          await changed();
        }
        return;
      }
      if (waiting) {
        await controller.refresh();
        if (controller.authorized) {
          waiting = false;
          message = 'Aparelho vinculado. Sua conta está pronta.';
          await changed();
        }
      }
    });
  }
  function needsWalletOpening(session: AccountSession): boolean {
    return (
      !controller.authorized &&
      session.walletConfirmed === true &&
      attempted !== session.csrf &&
      !controller.walletPending
    );
  }
  async function authorizeWallet(session: AccountSession): Promise<boolean> {
    const wallet =
      localStorage.getItem('0xdmme:login-wallet') ||
      (session.ecosystem === 'solana' ? 'Phantom' : 'MetaMask');
    message = 'Confirme a abertura da conta na sua wallet.';
    render();
    return controller.beginWalletRecovery({
      mode: controller.current ? 'recover' : 'initialize',
      wallet,
      name: 'Meu aparelho',
      revoked: [],
      revision: controller.current?.revision ?? 0,
    });
  }
  function rememberLease(
    lease: { key: CryptoKey; epoch: number } | null,
    session: AccountSession,
  ): void {
    if (lease && controller.authorized)
      leases.set(lease.key, {
        accountId: session.accountId,
        epoch: lease.epoch,
      });
  }
  function listen(
    selector: string,
    event: string,
    listener: (event: Event) => void,
  ): void {
    node(selector)?.addEventListener(event, listener);
  }
  async function openKeys(
    session: AccountSession,
    walletOpening: 'login' | 'restore' = 'restore',
  ): Promise<CryptoKey | null> {
    let lease = await controller.privateKey(session);
    if (controller.authorized) await acknowledgeLoginOpening(session);
    else {
      const proof = await readLoginOpening(session);
      if (proof) {
        await controller.completeLoginOpening(proof);
        await acknowledgeLoginOpening(session);
        lease = await controller.privateKey(session);
      }
    }
    if (walletOpening === 'login' && needsWalletOpening(session)) {
      attempted = session.csrf;
      message = 'Confirme a abertura da conta na sua wallet.';
      render();
      const completed = await authorizeWallet(session);
      if (!completed) {
        controller.openWalletRecovery();
        message =
          'Assine na wallet e volte a este navegador. A conclusão será automática.';
        schedule();
        render();
        return null;
      }
      lease = await controller.privateKey(session);
    }
    rememberLease(lease, session);
    renderOpeningStatus();
    return controller.authorized ? (lease?.key ?? null) : null;
  }
  function renderOpeningStatus(): void {
    if (controller.authorized)
      message = 'Sua conta está pronta neste aparelho.';
    else if (!controller.walletPending)
      message =
        'A sessão está conectada. Abra sua conta para autorizar as chaves neste navegador.';
    schedule();
    render();
  }
  async function join(code: string): Promise<void> {
    const session = await controller.joinEnrollment(code);
    waiting = true;
    deadline = Date.now() + 300_000;
    message =
      'Aguardando autorização automática. Mantenha aberto o aparelho que gerou o código.';
    await options.linked?.(session);
  }
  channel?.addEventListener('message', () => {
    if (!controller.session || busy) return;
    void run(async () => {
      await controller.refresh();
      await options.changed();
    });
  });
  function resume(): void {
    if (
      !controller.session ||
      busy ||
      document.visibilityState === 'hidden' ||
      !navigator.onLine
    )
      return;
    void run(async () => {
      await controller.refresh();
      if (controller.walletPending) await controller.finishWalletRecovery();
      await options.changed();
    });
  }
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    camera?.stop();
    invitation = null;
    waiting = false;
    controller.clearTransient();
  });
  window.addEventListener('pageshow', resume);
  return {
    withLocalVault: <T>(
      locator: VaultLocator,
      work: (a: VaultAuthority) => Promise<T>,
    ) => controller.withLocalVault(locator, work),
    withVault: <T>(offline: boolean, work: (a: VaultAuthority) => Promise<T>) =>
      controller.withVault(offline, work),
    privateKey: openKeys,
    setSession(session: AccountSession | null): void {
      if (session?.csrf !== controller.session?.csrf) {
        invitation = null;
        waiting = false;
        attempted = null;
        clearTimeout(timer);
        camera?.stop();
      }
      controller.setSession(session);
      render();
    },
    async saveProfile(
      session: AccountSession,
      profile: EncryptedProfile,
      key: CryptoKey,
    ): Promise<void> {
      const lease = leases.get(key);
      if (!lease || lease.accountId !== session.accountId)
        throw new Error('Reabra a conta antes de salvar o perfil.');
      await controller.saveProfile(session, profile, lease.epoch);
    },
    authorized: () => controller.authorized,
    updateBlockReason(): string | null {
      expireWalletRequest();
      if (controller.walletPending)
        return 'Há uma abertura de conta pendente na wallet. Em Perfil → Aparelhos, conclua ou cancele o pedido antes de atualizar.';
      if (invitation || waiting || camera?.active)
        return 'Conclua a vinculação ou feche a câmera em Perfil → Aparelhos antes de atualizar.';
      return null;
    },
    canActivate(): boolean {
      expireWalletRequest();
      return (
        !busy &&
        !invitation &&
        !waiting &&
        !controller.walletPending &&
        !camera?.active
      );
    },
    mount(container: HTMLElement): void {
      camera?.stop();
      mounted = container;
      container.innerHTML = `<article class="card"><h2>Aparelhos</h2><p data-device-status role="status"></p><button data-device-wallet type="button" hidden>Confirmar wallet para ações sensíveis</button><button data-device-retry type="button" hidden>Tentar novamente</button><div data-wallet-pending hidden><button data-wallet-open type="button">Abrir wallet</button><button data-wallet-cancel type="button">Cancelar</button></div><div data-devices-connected hidden><ul data-device-list></ul><button data-device-create type="button">Vincular outro aparelho</button><div data-enrollment-code hidden><div data-link-qr class="device-qr"></div><textarea data-device-code readonly aria-label="Código de vinculação"></textarea><button data-device-copy type="button">Copiar código</button><p>Mantenha este app aberto durante a vinculação. Código válido por cinco minutos.</p></div></div><form data-device-join><label>Código de vinculação<textarea data-device-received required spellcheck="false"></textarea></label><button type="submit">Vincular este aparelho</button><button data-device-scan type="button">Ler QR Code</button></form><div data-camera hidden><video muted playsinline aria-label="Ler código de vinculação"></video><button data-stop-camera type="button">Fechar câmera</button></div></article>`;
      const video = node<HTMLVideoElement>('[data-camera] video');
      if (video)
        camera = new QrCamera({
          video,
          state: (active) => {
            const panel = node('[data-camera]');
            if (panel) panel.hidden = !active;
          },
          failed: (failure) => {
            message = failure;
            failed = true;
            render();
          },
          decoded: (code) => {
            void run(() => join(code));
          },
        });
      listen('[data-device-create]', 'click', () => {
        if (controller.session?.walletConfirmed !== true) {
          options.confirmWallet?.();
          return;
        }
        void run(async () => {
          invitation = await controller.createEnrollment();
          deadline = Date.parse(invitation.expiresAt);
          message = 'Use este QR ou código somente no seu outro aparelho.';
        });
      });
      listen('[data-device-copy]', 'click', () => {
        void run(async () => {
          if (invitation)
            await navigator.clipboard.writeText(enrollmentPayload(invitation));
        });
      });
      listen('[data-device-join]', 'submit', (event) => {
        event.preventDefault();
        const code =
          node<HTMLTextAreaElement>('[data-device-received]')?.value ?? '';
        void run(() => join(code));
      });
      listen('[data-device-scan]', 'click', () => {
        camera?.start('enrollment');
      });
      listen('[data-stop-camera]', 'click', () => {
        camera?.stop();
      });
      listen('[data-device-wallet]', 'click', () => {
        options.confirmWallet?.();
      });
      listen('[data-wallet-open]', 'click', () => {
        controller.openWalletRecovery();
      });
      listen('[data-wallet-cancel]', 'click', () => {
        void run(() => controller.cancelWalletRecovery());
      });
      listen('[data-device-retry]', 'click', () => {
        attempted = null;
        void run(async () => {
          if (controller.session) await openKeys(controller.session, 'login');
          await options.changed();
        });
      });
      const retry = node('[data-device-retry]');
      if (retry) retry.textContent = 'Abrir conta';
      render();
    },
  };
}
