import { signedInDevices } from '../../shared/account-activity/index.ts';
import type { SignedInDevice } from '../../shared/account-activity/index.ts';
import { currentLanguage, t } from '../../shared/i18n/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';

export type { SignedInDevice } from '../../shared/account-activity/index.ts';

const refreshInterval = 30_000;
const storagePrefix = '0xdmme:known-sign-ins:';

/** Devices this browser has already shown for an account. Absent storage or
 * a damaged record means nothing is known yet, never an error. */
function knownDevices(accountId: string): Set<string> | null {
  try {
    const stored = localStorage.getItem(storagePrefix + accountId);
    if (stored === null) return null;
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return null;
    return new Set(value.filter((id) => typeof id === 'string').slice(0, 64));
  } catch {
    return null;
  }
}
function rememberDevices(accountId: string, ids: Iterable<string>): void {
  try {
    localStorage.setItem(
      storagePrefix + accountId,
      JSON.stringify([...new Set(ids)].slice(-64)),
    );
  } catch {
    // Without storage the notice simply shows again on the next visit.
  }
}
export function lastUsedLabel(device: SignedInDevice): string {
  return t('Last used {0}', [
    new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium' }).format(
      new Date(device.lastSeen),
    ),
  ]);
}

export interface DeviceActivity {
  /** Re-reads the account's signed-in devices, at most every 30 seconds. */
  refresh: (accountId: string | null) => void;
  /** Activity of one device, when it has a live session. */
  of: (deviceId: string) => SignedInDevice | undefined;
  /** Signed-in devices outside the given set, newest first. */
  others: (deviceIds: ReadonlySet<string>) => SignedInDevice[];
  /** Devices that signed in since this browser last acknowledged the list. */
  unseen: () => SignedInDevice[];
  acknowledge: () => void;
}

/**
 * Owns what this page knows about the account's signed-in devices and which
 * of them the user has already been told about. The first read on a browser
 * only records the list; later reads report devices that were not in it.
 */
export function createDeviceActivity(changed: () => void): DeviceActivity {
  let account: string | null = null;
  let devices: SignedInDevice[] = [];
  let loadedAt = 0;
  let loading = false;

  async function load(accountId: string): Promise<void> {
    const response = await fetchApi(
      'account/sessions',
      '/api/account/sessions',
      {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      },
    );
    const latest = signedInDevices(
      await readApiJson(response, 'account/sessions'),
    );
    if (account !== accountId) return;
    devices = latest;
    loadedAt = Date.now();
    if (knownDevices(accountId) === null)
      rememberDevices(
        accountId,
        latest.map((device) => device.deviceId),
      );
    changed();
  }
  function unseen(): SignedInDevice[] {
    const known = account ? knownDevices(account) : null;
    if (!known) return [];
    return devices.filter(
      (device) => !device.current && !known.has(device.deviceId),
    );
  }
  return {
    refresh(accountId) {
      if (accountId !== account) {
        account = accountId;
        devices = [];
        loadedAt = 0;
      }
      if (!accountId || loading || Date.now() - loadedAt < refreshInterval)
        return;
      loading = true;
      // A failed read keeps the last list; the next refresh tries again.
      void load(accountId)
        .catch(() => undefined)
        .finally(() => {
          loading = false;
        });
    },
    of: (deviceId) => devices.find((device) => device.deviceId === deviceId),
    others: (deviceIds) =>
      devices.filter((device) => !deviceIds.has(device.deviceId)),
    unseen,
    acknowledge() {
      if (!account) return;
      rememberDevices(account, [
        ...(knownDevices(account) ?? []),
        ...devices.map((device) => device.deviceId),
      ]);
      changed();
    },
  };
}
