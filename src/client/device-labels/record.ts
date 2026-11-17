import { keys, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';
import { cleanModel, deviceClients, deviceKinds } from './detect.ts';
import type { DeviceDescription } from './detect.ts';

export type DeviceLabelSync = Pick<
  VaultSync,
  'complete' | 'heads' | 'isRemoved' | 'open' | 'refresh' | 'save'
>;

/** What one device says about itself, plus the owner's own name for it. */
export interface DeviceLabel extends DeviceDescription {
  /** A name the owner chose; replaces the detected one on screen. */
  name: string | null;
  /** When this entry last changed, to merge concurrent versions. */
  at: number;
}

export const deviceLabelRecordLabel = '0xdmme:device-labels:v1';
export const deviceLabelLimit = 64;
export const deviceNameLimit = 40;
const versionLimit = 16;
const refreshRounds = 3;

async function entity(accountId: string): Promise<string> {
  const hash = await digest(canonical(['0xdmme-device-labels', 1, accountId]));
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Trimmed, single-line and bounded; an empty name clears the custom name. */
export function cleanDeviceName(value: string): string | null {
  const name = value.replace(/\s+/gu, ' ').trim();
  if (!name) return null;
  if ([...name].length > deviceNameLimit)
    throw new Error('Use a device name of up to 40 characters.');
  return name;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T {
  if (typeof value !== 'string' || !list.includes(value as T))
    throw new Error('Invalid device label.');
  return value as T;
}

function label(input: unknown): DeviceLabel {
  const value = object(input);
  keys(value, ['kind', 'model', 'client', 'name', 'at']);
  const model = value['model'],
    name = value['name'],
    at = value['at'];
  if (
    model !== null &&
    (typeof model !== 'string' || cleanModel(model) !== model)
  )
    throw new Error('Invalid device label.');
  if (
    name !== null &&
    (typeof name !== 'string' || cleanDeviceName(name) !== name)
  )
    throw new Error('Invalid device label.');
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0)
    throw new Error('Invalid device label.');
  return {
    kind: oneOf(deviceKinds, value['kind']),
    model,
    client: oneOf(deviceClients, value['client']),
    name,
    at,
  };
}

/** Parses one stored version; device ids are the directory's opaque ids. */
export function deviceLabels(input: unknown): Map<string, DeviceLabel> {
  const value = object(input);
  keys(value, ['version', 'devices']);
  if (value['version'] !== 1) throw new Error('Invalid device labels.');
  const devices = object(value['devices']);
  const entries = Object.entries(devices);
  if (entries.length > deviceLabelLimit)
    throw new Error('Too many device labels.');
  return new Map(
    entries.map(([id, entry]) => {
      if (!/^[A-Za-z0-9-]{1,64}$/u.test(id))
        throw new Error('Invalid device label.');
      return [id, label(entry)];
    }),
  );
}

/** The newest entry per device across concurrent versions. */
export function mergeDeviceLabels(
  versions: readonly Map<string, DeviceLabel>[],
): Map<string, DeviceLabel> {
  const merged = new Map<string, DeviceLabel>();
  for (const version of versions)
    for (const [id, entry] of version) {
      const known = merged.get(id);
      if (!known || entry.at > known.at) merged.set(id, entry);
    }
  return merged;
}

/**
 * Device names live only in the encrypted vault, readable by the account's own
 * devices. The signed device directory, which the server sees, keeps its
 * generic name. Saving supersedes every current version, so devices converge.
 */
export class DeviceLabelRecord {
  private readonly sync: DeviceLabelSync;
  constructor(sync: DeviceLabelSync) {
    this.sync = sync;
  }
  private async heads(accountId: string): Promise<VaultEntry[]> {
    for (let round = 0; round < refreshRounds && !this.sync.complete; round++)
      await this.sync.refresh();
    if (!this.sync.complete)
      throw new Error('The vault is still loading device names.');
    const entries = this.sync
      .heads(await entity(accountId))
      .filter(
        (entry) =>
          entry.change.kind === 'settings' &&
          entry.change.label === deviceLabelRecordLabel &&
          !this.sync.isRemoved(entry.commit.id),
      );
    if (entries.length > versionLimit)
      throw new Error('Too many device name versions.');
    return entries;
  }
  async load(accountId: string): Promise<Map<string, DeviceLabel>> {
    const versions: Map<string, DeviceLabel>[] = [];
    for (const entry of await this.heads(accountId)) {
      // A version that does not validate is superseded by the next save.
      try {
        versions.push(
          deviceLabels(
            JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
          ),
        );
      } catch {
        continue;
      }
    }
    return mergeDeviceLabels(versions);
  }
  /** Writes `labels` for the devices in `keep`, over every current version. */
  async save(
    accountId: string,
    labels: Map<string, DeviceLabel>,
    keep: ReadonlySet<string>,
  ): Promise<void> {
    const kept = [...labels].filter(([id]) => keep.has(id));
    if (kept.length > deviceLabelLimit)
      throw new Error('Too many device labels.');
    const parents = (await this.heads(accountId)).map(
      (entry) => entry.commit.id,
    );
    await this.sync.save({
      change: {
        version: 1,
        entity: await entity(accountId),
        kind: 'settings',
        parents,
        label: deviceLabelRecordLabel,
      },
      value: JSON.stringify({ version: 1, devices: Object.fromEntries(kept) }),
    });
  }
}
