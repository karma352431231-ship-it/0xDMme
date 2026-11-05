import type {
  DeviceIdentity,
  DirectoryEvent,
} from '../../shared/devices/index.ts';
import { localDeviceKeys } from '../device-storage/index.ts';

type DeviceKeys = Pick<DeviceIdentity, 'signing' | 'wrapping'>;

function sameKeys(left: DeviceKeys, right: DeviceKeys): boolean {
  return left.signing === right.signing && left.wrapping === right.wrapping;
}

/** The directory lists this device under keys this browser no longer holds, for
 * example after the browser cleared its storage while the session cookie stayed.
 * A pinned root that differs from the directory proves nothing about the keys. */
export function deviceKeysLost(input: {
  local: DeviceKeys | undefined;
  listed: DeviceKeys | undefined;
  rootTrusted: boolean;
  rootPinned: boolean;
}): boolean {
  const { local, listed } = input;
  if (!local || !listed) return false;
  if (input.rootPinned && !input.rootTrusted) return false;
  return !sameKeys(local, listed);
}

/** Directory devices whose id this browser used under different keys. Their
 * private keys are gone from here, so recovery retires them. Only local evidence
 * counts: a device this browser never knew is someone else's to revoke. */
export async function lostDevices(
  accountId: string,
  current: DirectoryEvent,
): Promise<string[]> {
  const lost: string[] = [];
  for (const device of current.devices) {
    const local = await localDeviceKeys(accountId, device.id);
    if (local && !sameKeys(local, device)) lost.push(device.id);
  }
  return lost;
}
