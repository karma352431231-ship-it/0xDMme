import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';

/** One device with a live session on the account. */
export interface SignedInDevice {
  deviceId: string;
  /** When its session was last extended; accurate to about a day. */
  lastSeen: string;
  walletConfirmed: boolean;
  /** The device that asked. */
  current: boolean;
}
/** An account holds at most this many sessions. */
export const signedInDeviceLimit = 8;

function signedInDevice(value: unknown): SignedInDevice {
  const data = object(value);
  keys(data, ['deviceId', 'lastSeen', 'walletConfirmed', 'current']);
  const lastSeen = boundedText(data['lastSeen'], 32);
  if (
    !Number.isFinite(Date.parse(lastSeen)) ||
    typeof data['walletConfirmed'] !== 'boolean' ||
    typeof data['current'] !== 'boolean'
  )
    throw new AccountError(400, 'Invalid device activity.');
  return {
    deviceId: uuid(data['deviceId']),
    lastSeen,
    walletConfirmed: data['walletConfirmed'],
    current: data['current'],
  };
}
export function signedInDevices(value: unknown): SignedInDevice[] {
  const data = object(value);
  keys(data, ['devices']);
  const devices = data['devices'];
  if (!Array.isArray(devices) || devices.length > signedInDeviceLimit)
    throw new AccountError(400, 'Invalid device activity.');
  const result = devices.map(signedInDevice);
  if (new Set(result.map((device) => device.deviceId)).size !== result.length)
    throw new AccountError(400, 'Invalid device activity.');
  return result;
}
