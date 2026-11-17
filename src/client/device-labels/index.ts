import { t } from '../../shared/i18n/index.ts';
import { detectThisDevice } from './detect.ts';
import type { DeviceClient, DeviceDescription, DeviceKind } from './detect.ts';
import {
  DeviceLabelRecord,
  cleanDeviceName,
  deviceLabelLimit,
} from './record.ts';
import type { DeviceLabel, DeviceLabelSync } from './record.ts';
export { describeDevice, cleanModel } from './detect.ts';
export type { DeviceKind, DeviceDescription } from './detect.ts';
export { cleanDeviceName, deviceLabels, mergeDeviceLabels } from './record.ts';
export type { DeviceLabel } from './record.ts';

const retryDelay = 60_000;

/** How a device is shown in the list. */
export interface DevicePresentation {
  kind: DeviceKind;
  title: string;
  /** "Chrome", "0xDMme app"; empty when unknown. */
  client: string;
}

const kindNames: Record<DeviceKind, () => string> = {
  mac: () => t('Mac'),
  windows: () => t('Windows PC'),
  linux: () => t('Linux PC'),
  chromeos: () => t('Chromebook'),
  iphone: () => t('iPhone'),
  ipad: () => t('iPad'),
  'android-phone': () => t('Android phone'),
  'android-tablet': () => t('Android tablet'),
  unknown: () => t('Device'),
};
const clientNames: Record<DeviceClient, () => string> = {
  app: () => t('0xDMme app'),
  chrome: () => 'Chrome',
  safari: () => 'Safari',
  firefox: () => 'Firefox',
  edge: () => 'Edge',
  opera: () => 'Opera',
  brave: () => 'Brave',
  browser: () => '',
};

export function presentDevice(label: DeviceLabel): DevicePresentation {
  return {
    kind: label.kind,
    title: label.name ?? label.model ?? kindNames[label.kind](),
    client: clientNames[label.client](),
  };
}

function sameDescription(a: DeviceDescription, b: DeviceDescription): boolean {
  return a.kind === b.kind && a.model === b.model && a.client === b.client;
}

/**
 * Device names for the Devices list. Each device records what it detects
 * about itself the first time the list opens there; the owner may rename any
 * device. Labels stay in the encrypted vault and leave with the session.
 */
export function startDeviceLabels(sync: DeviceLabelSync) {
  const record = new DeviceLabelRecord(sync);
  let labels = new Map<string, DeviceLabel>();
  let accountId: string | null = null;
  let loading: Promise<void> | null = null;
  /** The stored labels arrived; saving before that would drop them. */
  let loaded = false;
  /** When the last load failed; the list retries at most once a minute. */
  let failedAt = Number.NEGATIVE_INFINITY;
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  async function load(
    account: string,
    own: string,
    known: ReadonlySet<string>,
  ): Promise<void> {
    const current = generation;
    const [stored, detected] = await Promise.all([
      record.load(account),
      detectThisDevice(),
    ]);
    if (current !== generation) return;
    labels = stored;
    loaded = true;
    notify();
    const mine = stored.get(own);
    if (mine && sameDescription(mine, detected)) return;
    const next = new Map(stored);
    next.set(own, { ...detected, name: mine?.name ?? null, at: Date.now() });
    await record.save(account, next, known);
    if (current !== generation) return;
    labels = next;
    notify();
  }

  return {
    /** The label of a device, once loaded. */
    of(deviceId: string): DevicePresentation | null {
      const label = labels.get(deviceId);
      return label ? presentDevice(label) : null;
    },
    /** The owner's chosen name, if any. */
    customName(deviceId: string): string | null {
      return labels.get(deviceId)?.name ?? null;
    },
    observe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * Loads the labels of the signed-in account once, recording this device.
     * `known` are the directory's current devices; others are dropped on save.
     */
    ensure(input: {
      accountId: string;
      deviceId: string;
      known: ReadonlySet<string>;
    }): void {
      if (accountId === input.accountId && loading) return;
      if (accountId === input.accountId && Date.now() - failedAt < retryDelay)
        return;
      if (input.known.size > deviceLabelLimit) return;
      if (accountId !== input.accountId) {
        generation++;
        loaded = false;
        labels = new Map();
      }
      accountId = input.accountId;
      loading = load(input.accountId, input.deviceId, input.known).catch(() => {
        // Names are cosmetic: the list keeps its generic names and retries
        // a minute later.
        loading = null;
        failedAt = Date.now();
      });
    },
    async rename(input: {
      deviceId: string;
      name: string;
      known: ReadonlySet<string>;
    }): Promise<void> {
      const account = accountId,
        current = generation;
      if (!account || !loaded)
        throw new Error('Device names are still loading. Try again.');
      // A device that never opened this list has no description yet.
      const entry = labels.get(input.deviceId) ?? {
        kind: 'unknown' as const,
        model: null,
        client: 'browser' as const,
        name: null,
        at: 0,
      };
      const next = new Map(labels);
      next.set(input.deviceId, {
        ...entry,
        name: cleanDeviceName(input.name),
        at: Date.now(),
      });
      await record.save(account, next, input.known);
      if (current !== generation) return;
      labels = next;
      notify();
    },
    setSession(session: { accountId: string } | null): void {
      const account = session?.accountId ?? null;
      if (account === accountId) return;
      generation++;
      accountId = null;
      loading = null;
      loaded = false;
      failedAt = Number.NEGATIVE_INFINITY;
      labels = new Map();
      notify();
    },
  };
}
export type DeviceLabels = ReturnType<typeof startDeviceLabels>;
