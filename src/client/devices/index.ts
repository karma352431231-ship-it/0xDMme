import { t, translatedError } from '../../shared/i18n/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import {
  enrollmentPayload,
  enrollmentUrl,
} from '../../shared/device-enrollment/index.ts';
import type { EnrollmentCode } from '../../shared/device-enrollment/index.ts';
import { notifyMessageControls } from '../message-controls/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { DeviceController } from './controller.ts';
import type {
  VaultAuthority,
  VaultLocator,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
export {
  startEnrollmentEntry,
  mountEnrollmentLogin,
} from './enrollment-entry.ts';
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
  let message = t('Sign in with your wallet or use a linking code.');
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
    window.dispatchEvent(new Event('0xdmme-device-status'));
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
    if (qr && invitation)
      renderQr(qr, enrollmentUrl(invitation, location.origin));
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
        (device.id === controller.session?.deviceId ? t(' · this device') : '');
      item.append(label);
      if (device.id !== controller.session?.deviceId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = t('Revoke');
        button.disabled = busy;
        button.addEventListener('click', () => {
          if (controller.session?.walletConfirmed !== true) {
            options.confirmWallet?.();
            return;
          }
          if (
            !window.confirm(
              t('Revoke this device? It will lose access to new data.'),
            )
          )
            return;
          void run(async () => {
            await controller.revoke(device.id);
            message = t('Device revoked.');
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
          ? translatedError(error.message)
          : t('Could not complete the operation.');
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
    message = t('The wallet request expired. Tap Open account to try again.');
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
          message = t('Account ready.');
          await changed();
        }
        return;
      }
      if (Date.now() >= deadline)
        throw new Error('Code expired. Generate a new linking code.');
      if (invitation) {
        if (await controller.approveEnrollment(invitation)) {
          invitation = null;
          message = t('New device linked.');
          await changed();
        }
        return;
      }
      if (waiting) {
        await controller.refresh();
        if (controller.authorized) {
          waiting = false;
          message = t('Device linked. Your account is ready.');
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
    message = t('Confirm account opening in your wallet.');
    render();
    return controller.beginWalletRecovery({
      mode: controller.current ? 'recover' : 'initialize',
      wallet,
      name: t('My device'),
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
      message = t('Confirm account opening in your wallet.');
      render();
      const completed = await authorizeWallet(session);
      if (!completed) {
        controller.openWalletRecovery();
        message = t(
          'Sign in your wallet and return to this browser. Completion is automatic.',
        );
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
      message = t('Your account is ready on this device.');
    else if (!controller.walletPending)
      message = t(
        'The session is connected. Open your account to authorize the keys in this browser.',
      );
    schedule();
    render();
  }
  async function join(code: string): Promise<void> {
    const session = await controller.joinEnrollment(code);
    waiting = true;
    deadline = Date.now() + 300_000;
    message = t(
      'Waiting for automatic authorization. Keep the device that generated the code open.',
    );
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
    withVault: <T>(
      offline: boolean,
      work: (a: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => controller.withVault(offline, work, options),
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
        throw new Error('Reopen the account before saving the profile.');
      await controller.saveProfile(session, profile, lease.epoch);
    },
    authorized: () => controller.authorized,
    stopCamera: () => camera?.stop(),
    enrollmentState: () => ({
      waiting,
      authorized: controller.authorized,
      message,
      failed,
    }),
    async enroll(code: string): Promise<void> {
      if (busy)
        throw new Error(
          'Wait for the current sign-in to finish, then try again.',
        );
      if (controller.session)
        throw new Error(
          'Sign out of the current account before linking another.',
        );
      await run(() => join(code));
      if (failed) throw new Error(message);
    },
    updateBlockReason(): string | null {
      expireWalletRequest();
      if (controller.walletPending)
        return t(
          'Account opening is pending in your wallet. In Profile → Devices, complete or cancel the request before updating.',
        );
      if (invitation || waiting || camera?.active)
        return t(
          'Finish linking or close the camera in Profile → Devices before updating.',
        );
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
      container.innerHTML = t('html.63049f816b60');
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
          message = t('Use this QR code or code only on your other device.');
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
      if (retry) retry.textContent = t('Open account');
      render();
    },
  };
}
