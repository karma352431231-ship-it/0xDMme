import { networkAvailable } from '../connectivity/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
export { BackgroundVaultAccess } from './background.ts';
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
import { keepDeviceStorage } from '../device-storage/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { DeviceController } from './controller.ts';
import { confirmingWallet } from '../../shared/account/index.ts';
import { recoveryWallets } from '../../shared/devices/index.ts';
import { discoverWallets } from '../wallet/index.ts';
import {
  detectedWalletSigner,
  presentedWallet,
} from '../wallet-signer/index.ts';
import {
  createDeviceActivity,
  lastUsedLabel,
} from '../device-activity/index.ts';
import type { SignedInDevice } from '../device-activity/index.ts';
import type { DeviceKind, DeviceLabels } from '../device-labels/index.ts';
import {
  settingTip,
  settingsGlyph,
  settingsGlyphElement,
} from '../settings-ui/index.ts';
import type { SettingsGlyph } from '../settings-ui/index.ts';
import type {
  SigningAuthority,
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

function readyMessage(): string {
  return t('Your account is ready on this device.');
}

const kindGlyphs: Record<DeviceKind, SettingsGlyph> = {
  mac: 'laptop',
  windows: 'desktop',
  linux: 'desktop',
  chromeos: 'laptop',
  iphone: 'phone',
  ipad: 'tablet',
  'android-phone': 'phone',
  'android-tablet': 'tablet',
  unknown: 'desktop',
};
function kindGlyph(kind: DeviceKind): SettingsGlyph {
  return kindGlyphs[kind];
}

/** Static authored markup with the group tip and the link button glyph. */
function settingsTemplate(): string {
  return t('html.63049f816b60', [
    settingTip(
      t('Your devices'),
      t(
        'Device type and model are detected on each device and saved encrypted. Only your own devices can read them.',
      ),
    ),
    settingsGlyph('plus'),
  ]);
}

export function startDevices(options: {
  changed: () => Promise<void>;
  linked?: (session: AccountSession) => Promise<void>;
  confirmWallet?: () => void;
}) {
  const controller = new DeviceController();
  const activity = createDeviceActivity(() => render());
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
  /** Names detected per device, kept in the encrypted vault. */
  let labels: DeviceLabels | null = null;
  /** Set while the user is asked to select another wallet in their wallet. */
  let walletSelected: (() => void) | null = null;
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
    if (status)
      // The list itself shows a ready account; only other states need words.
      status.textContent =
        controller.authorized && message === readyMessage() ? '' : message;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    renderWalletStep();
    renderPanels();
    renderInvitation();
    renderList();
    window.dispatchEvent(new Event('0xdmme-device-status'));
  }
  function renderWalletStep(): void {
    const status = node('[data-device-status]');
    mounted?.querySelector('[data-wallet-continue]')?.remove();
    if (!status || !walletSelected) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['walletContinue'] = '';
    button.textContent = t('Continue');
    button.addEventListener('click', () => walletSelected?.());
    status.after(button);
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
          !controller.keysLost &&
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
      renderQr(qr, enrollmentUrl(invitation, applicationOrigin()));
    else qr?.replaceChildren();
  }
  /** Tells the user about devices that signed in since they last looked. */
  function signInNotice(names: Map<string, string>): HTMLElement | null {
    const unseen = activity.unseen();
    if (!unseen.length) return null;
    const item = document.createElement('li'),
      text = document.createElement('span'),
      button = document.createElement('button');
    item.className = 'set-row device-sign-in-notice';
    text.textContent = t(
      'New sign-in to your account: {0}. If this was not you, revoke that device.',
      [
        unseen
          .map(
            (device) =>
              names.get(device.deviceId) ??
              t('a browser that has not opened your history'),
          )
          .join(', '),
      ],
    );
    button.type = 'button';
    button.className = 'set-btn';
    button.textContent = t('Got it');
    button.addEventListener('click', () => activity.acknowledge());
    item.append(text, button);
    return item;
  }
  function rowButton(input: {
    label: string;
    icon: SettingsGlyph;
    className: string;
    iconOnly?: boolean;
    click: () => void;
  }): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `set-btn ${input.className}`;
    button.disabled = busy;
    button.append(settingsGlyphElement(input.icon));
    if (input.iconOnly) button.setAttribute('aria-label', input.label);
    else button.append(input.label);
    button.addEventListener('click', input.click);
    return button;
  }
  function revokeButton(deviceId: string): HTMLButtonElement {
    return rowButton({
      label: t('Revoke'),
      icon: 'revoke',
      className: 'set-quiet set-danger',
      click: () => {
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
          await controller.revoke(deviceId);
          message = t('Device revoked.');
          await changed();
        });
      },
    });
  }
  function renameButton(deviceId: string, title: string): HTMLButtonElement {
    return rowButton({
      label: t('Rename {0}', [title]),
      icon: 'pencil',
      className: 'set-quiet set-icon',
      iconOnly: true,
      click: () => {
        const current = labels?.customName(deviceId) ?? title;
        const name = window.prompt(t('Device name'), current);
        if (name === null || !labels) return;
        const naming = labels;
        void run(() =>
          naming.rename({ deviceId, name, known: authorizedIds() }),
        );
      },
    });
  }
  /** One list row: the device's icon, name, app and last use. */
  function deviceRow(input: {
    title: string;
    kind: DeviceKind;
    detail: string;
    own: boolean;
    used: SignedInDevice | undefined;
  }): HTMLLIElement {
    const item = document.createElement('li'),
      tile = document.createElement('span'),
      text = document.createElement('span'),
      line = document.createElement('span'),
      label = document.createElement('span'),
      meta = document.createElement('span');
    item.className = 'set-row device-row';
    tile.className = input.own ? 'device-tile device-tile-own' : 'device-tile';
    tile.append(settingsGlyphElement(kindGlyph(input.kind)));
    text.className = 'set-text';
    line.className = 'device-line';
    label.className = 'set-label';
    label.textContent = input.title;
    line.append(label);
    if (input.own) {
      const chip = document.createElement('span');
      chip.className = 'set-chip set-ok';
      chip.textContent = t('This device');
      line.append(chip);
    }
    meta.className = 'set-meta';
    meta.textContent = [
      input.detail,
      input.used ? lastUsedLabel(input.used) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    text.append(line, meta);
    const fill = document.createElement('span');
    fill.className = 'set-fill';
    item.append(tile, text, fill);
    return item;
  }
  function authorizedIds(): Set<string> {
    return new Set(
      (controller.current?.devices ?? []).map((device) => device.id),
    );
  }
  /** Starts loading the vault names once this device opened the account. */
  function ensureLabels(): void {
    const session = controller.session;
    if (!labels || !session || !controller.authorized) return;
    labels.ensure({
      accountId: session.accountId,
      deviceId: session.deviceId,
      known: authorizedIds(),
    });
  }
  /** The vault name of a device, or the directory's generic one. */
  function titleOf(device: { id: string; name: string }): string {
    return labels?.of(device.id)?.title ?? device.name;
  }
  function authorizedRow(
    device: { id: string; name: string },
    own: string | undefined,
  ): HTMLLIElement {
    const shown = labels?.of(device.id);
    const title = titleOf(device);
    const item = deviceRow({
      title,
      kind: shown?.kind ?? 'unknown',
      detail: shown?.client ?? '',
      own: device.id === own,
      used: activity.of(device.id),
    });
    if (labels) item.append(renameButton(device.id, title));
    if (device.id !== own) item.append(revokeButton(device.id));
    return item;
  }
  function renderList(): void {
    const list = node('[data-device-list]');
    if (!list) return;
    ensureLabels();
    const authorized = controller.current?.devices ?? [];
    const own = controller.session?.deviceId;
    const notice = signInNotice(
      new Map(authorized.map((device) => [device.id, titleOf(device)])),
    );
    list.replaceChildren(
      ...(notice ? [notice] : []),
      ...authorized.map((device) => authorizedRow(device, own)),
      // Sessions whose device was never authorized to open history.
      ...activity
        .others(new Set(authorized.map((known) => known.id)))
        .filter((other) => !other.current)
        .map((device) =>
          deviceRow({
            title: t('Signed in, history not opened'),
            kind: 'unknown',
            detail: '',
            own: false,
            used: device,
          }),
        ),
    );
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
      activity.refresh(
        controller.authorized ? (controller.session?.accountId ?? null) : null,
      );
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
    if (busy || document.visibilityState === 'hidden' || !networkAvailable()) {
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
      !controller.keysLost &&
      session.walletConfirmed === true &&
      attempted !== session.csrf &&
      !controller.walletPending
    );
  }
  /** Shows which wallet to select and waits for the user to say it is done. */
  function selectWallet(wallet: {
    ecosystem: string;
    address: string;
  }): Promise<void> {
    return new Promise((resolve) => {
      message = t(
        'Select wallet {0} in your wallet app, then press Continue.',
        [`${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`],
      );
      walletSelected = () => {
        walletSelected = null;
        resolve();
      };
      render();
    });
  }
  /** An account with three wallets opens with the session's wallet and one
   * more: whichever of the other two this browser already presents. */
  async function authorizeWalletPair(
    session: AccountSession,
  ): Promise<boolean> {
    const own = confirmingWallet(session);
    const others = recoveryWallets(controller.current!)
      .filter(
        (wallet, index, all) =>
          all.findIndex((other) => other.address === wallet.address) === index,
      )
      .filter(
        (wallet) =>
          wallet.ecosystem !== own.ecosystem || wallet.address !== own.address,
      );
    const discovery = discoverWallets();
    try {
      const second =
        (await presentedWallet(discovery.list(), others)) ?? others[0];
      if (!second) throw new Error('Recovery wallets missing.');
      await controller.backupRecovery.recoverWithPair({
        sign: detectedWalletSigner({
          connections: () => discovery.list(),
          select: selectWallet,
        }),
        second,
      });
      return true;
    } finally {
      walletSelected = null;
      discovery.close();
    }
  }
  async function authorizeWallet(session: AccountSession): Promise<boolean> {
    if (controller.current?.pairs) return authorizeWalletPair(session);
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
    if (controller.authorized) {
      message = readyMessage();
      // Best effort: the browser decides, and wallet recovery remains available.
      void keepDeviceStorage().catch(() => undefined);
    } else if (controller.keysLost)
      message = t(
        'This browser lost its device key. Select Complete sign-in and confirm with your wallet.',
      );
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
      !networkAvailable()
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
    withSigner: <T>(work: (a: SigningAuthority) => Promise<T>) =>
      controller.withSigner(work),
    withDraftVault: <T>(
      locator: VaultLocator,
      work: (a: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => controller.withDraftVault(locator, work, options),
    withLocalVault: <T>(
      locator: VaultLocator,
      work: (a: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => controller.withLocalVault(locator, work, options),
    withVault: <T>(
      offline: boolean,
      work: (a: VaultAuthority) => Promise<T>,
      options?: VaultWorkOptions,
    ) => controller.withVault(offline, work, options),
    privateKey: openKeys,
    /** Which backup wallets open recovery, and the workflow that changes it. */
    backupRecovery: {
      wallets: () =>
        controller.current ? recoveryWallets(controller.current).slice(1) : [],
      add: (input: Parameters<typeof controller.backupRecovery.add>[0]) =>
        controller.backupRecovery.add(input),
      remove: (input: Parameters<typeof controller.backupRecovery.remove>[0]) =>
        controller.backupRecovery.remove(input),
      /** True while the account's three wallets open recovery in pairs. */
      paired: () => controller.current?.pairs !== undefined,
      enterPairs: (
        input: Parameters<typeof controller.backupRecovery.enterPairs>[0],
      ) => controller.backupRecovery.enterPairs(input),
      leavePairs: (
        input: Parameters<typeof controller.backupRecovery.leavePairs>[0],
      ) => controller.backupRecovery.leavePairs(input),
    },
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
    keysLost: () => controller.keysLost,
    stopCamera: () => camera?.stop(),
    /** Device names from the vault; the list redraws when they change. */
    useLabels(value: DeviceLabels): void {
      labels = value;
      value.observe(() => {
        renderList();
      });
    },
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
      container.innerHTML = settingsTemplate();
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
