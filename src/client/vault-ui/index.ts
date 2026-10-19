import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { VaultSync } from '../vault-sync/index.ts';
import { rememberLocator } from '../vault-storage/index.ts';

export function startVault(access: VaultAccess) {
  const sync = new VaultSync(access);
  let mounted: HTMLElement | null = null;
  // Compact meter at the top of Perfil; filled by the same usage query as the card.
  let meter: HTMLElement | null = null;
  let busy = false;
  let known = false;
  let message = t('Sign in to your account to check storage.');
  function render(): void {
    const status = mounted?.querySelector('[data-vault-status]');
    if (status) status.textContent = message;
    const usage =
      mounted?.querySelector<HTMLProgressElement>('[data-vault-usage]');
    renderUsage(usage ?? null);
    const quota = mounted?.querySelector('[data-vault-quota]');
    if (quota)
      quota.textContent = known
        ? t('{0} MB used · {1} MB available out of {2} MB', [
            (sync.state.used / 1_000_000).toFixed(2),
            (Math.max(0, vaultQuota - sync.state.used) / 1_000_000).toFixed(2),
            vaultQuota / 1_000_000,
          ])
        : t('Checking account usage…');
    const retry =
      mounted?.querySelector<HTMLButtonElement>('[data-vault-retry]');
    if (retry) retry.disabled = busy;
    renderMeter();
  }
  function renderMeter(): void {
    if (!meter) return;
    meter.hidden = sync.session === null;
    const label = meter.querySelector('[data-vault-meter-label]');
    if (label)
      label.textContent = known
        ? t('{0} of {1}', [
            storageSize(sync.state.used),
            storageSize(vaultQuota),
          ])
        : t('Checking…');
    renderUsage(meter.querySelector<HTMLProgressElement>('progress'));
  }
  function renderUsage(usage: HTMLProgressElement | null): void {
    if (!usage) return;
    if (known) usage.value = sync.state.used;
    else usage.removeAttribute('value');
  }
  function canRefresh(): boolean {
    return (
      !busy && mounted !== null && sync.session !== null && navigator.onLine
    );
  }
  function retryVisible(show: boolean): void {
    const retry = mounted?.querySelector<HTMLElement>('[data-vault-retry]');
    if (retry) retry.hidden = !show;
  }
  async function refresh(): Promise<void> {
    if (!canRefresh()) return;
    busy = true;
    message = t('Checking storage…');
    render();
    try {
      await sync.refresh();
      known = true;
      if (sync.pending) await sync.retry();
      message =
        sync.state.used >= vaultQuota * 0.9
          ? t('Your storage is close to its limit.')
          : t(
              'Conversations and files stay encrypted. Saving a backup does not automatically free space.',
            );
      retryVisible(false);
    } catch (error: unknown) {
      message =
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not check storage.');
      retryVisible(true);
    } finally {
      busy = false;
      render();
    }
  }
  window.addEventListener('online', () => {
    void refresh();
  });
  window.addEventListener('0xdmme-personal-cleanup', () => {
    sync.clear();
    void refresh();
  });
  return {
    sync,
    setSession(session: AccountSession | null): void {
      if (sync.session?.accountId !== session?.accountId) known = false;
      sync.setSession(session);
      if (session) {
        void rememberLocator({
          accountId: session.accountId,
          deviceId: session.deviceId,
        }).catch(() => {
          message = t('Could not save local access on this device.');
          render();
        });
        void refresh();
      } else {
        message = t('Sign in to your account to check storage.');
        render();
      }
    },
    ready: refresh,
    canActivate: () => !busy,
    leave(): void {
      mounted = null;
      meter = null;
    },
    mountMeter(container: HTMLElement): void {
      meter = container;
      container.innerHTML = t('html.a00be4e55c2e', [vaultQuota]);
      renderMeter();
    },
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = t('html.659a7a617631', [vaultQuota]);
      container
        .querySelector('[data-vault-retry]')
        ?.addEventListener('click', () => {
          void refresh();
        });
      render();
      void refresh();
    },
  };
}

/** 312 MB, 1,2 GB: short labels for the meter; the card keeps the exact figures. */
export function storageSize(bytes: number): string {
  if (bytes >= 1_000_000_000)
    return t('{0} GB', [
      (bytes / 1_000_000_000).toLocaleString(currentLanguage(), {
        maximumFractionDigits: 1,
      }),
    ]);
  const megabytes = bytes / 1_000_000;
  return t('{0} MB', [
    megabytes.toLocaleString(currentLanguage(), {
      maximumFractionDigits: megabytes < 10 ? 1 : 0,
    }),
  ]);
}
