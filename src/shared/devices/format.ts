import {
  AccountError,
  base64,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';

export const directoryLimit = 128;
export const deviceLimit = 32;
export const eventBytes = 65_536;
export const linkSeconds = 300;
export interface SealedSecret {
  iv: string;
  ciphertext: string;
  wrappedKey: string;
}
export interface DeviceIdentity {
  id: string;
  name: string;
  signing: string;
  wrapping: string;
}
export interface AuthorizedDevice extends DeviceIdentity {
  envelope: SealedSecret;
}
export interface RecoveryRoot {
  signing: string;
  wrapping: string;
  capsule: { iv: string; ciphertext: string };
}
export interface DirectoryEvent {
  version: 1;
  accountId: string;
  revision: number;
  epoch: number;
  previous: string | null;
  kind: 'initialize' | 'link' | 'revoke' | 'recover';
  signer: string;
  root: RecoveryRoot;
  devices: AuthorizedDevice[];
  revoked: string[];
  recovery: SealedSecret;
  linkId: string | null;
  profile: string | null;
  signature: string;
}
export function reject(message = 'Diretório de dispositivos inválido.'): never {
  throw new AccountError(409, message);
}
export function bytes(value: unknown, length: number): string {
  if (base64(value, length).length !== length) reject();
  return value as string;
}
export function positive(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  )
    reject();
  return value;
}
export function fingerprint(value: unknown): string {
  const result = boundedText(value, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) reject();
  return result;
}
function ciphertext(value: unknown): string {
  const bytes = base64(value, 8192);
  if (bytes.length < 16) reject();
  return value as string;
}
export function sealedSecret(value: unknown): SealedSecret {
  const data = object(value);
  keys(data, ['iv', 'ciphertext', 'wrappedKey']);
  return {
    iv: bytes(data['iv'], 12),
    ciphertext: ciphertext(data['ciphertext']),
    wrappedKey: bytes(data['wrappedKey'], 384),
  };
}
export function deviceIdentity(value: unknown): DeviceIdentity {
  const data = object(value);
  keys(data, ['id', 'name', 'signing', 'wrapping']);
  const name = boundedText(data['name'], 60).normalize('NFC').trim();
  if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) reject();
  return {
    id: uuid(data['id']),
    name,
    signing: bytes(data['signing'], 65),
    wrapping: bytes(data['wrapping'], 422),
  };
}
function authorizedDevice(value: unknown): AuthorizedDevice {
  const data = object(value);
  keys(data, ['id', 'name', 'signing', 'wrapping', 'envelope']);
  const { envelope, ...identity } = data;
  return { ...deviceIdentity(identity), envelope: sealedSecret(envelope) };
}
function recoveryRoot(value: unknown): RecoveryRoot {
  const data = object(value);
  keys(data, ['signing', 'wrapping', 'capsule']);
  const capsule = object(data['capsule']);
  keys(capsule, ['iv', 'ciphertext']);
  return {
    signing: bytes(data['signing'], 65),
    wrapping: bytes(data['wrapping'], 422),
    capsule: {
      iv: bytes(capsule['iv'], 12),
      ciphertext: ciphertext(capsule['ciphertext']),
    },
  };
}
export function directoryEvent(value: unknown): DirectoryEvent {
  const data = object(value);
  keys(data, [
    'version',
    'accountId',
    'revision',
    'epoch',
    'previous',
    'kind',
    'signer',
    'root',
    'devices',
    'revoked',
    'recovery',
    'linkId',
    'profile',
    'signature',
  ]);
  const kind = data['kind'];
  if (
    data['version'] !== 1 ||
    !['initialize', 'link', 'revoke', 'recover'].includes(String(kind))
  )
    reject();
  const { devices, revoked } = members(data);
  return {
    version: 1,
    accountId: uuid(data['accountId']),
    revision: positive(data['revision'], directoryLimit),
    epoch: positive(data['epoch'], directoryLimit),
    previous: data['previous'] === null ? null : fingerprint(data['previous']),
    kind: kind as DirectoryEvent['kind'],
    signer: data['signer'] === 'recovery' ? 'recovery' : uuid(data['signer']),
    root: recoveryRoot(data['root']),
    devices,
    revoked,
    recovery: sealedSecret(data['recovery']),
    linkId: data['linkId'] === null ? null : uuid(data['linkId']),
    profile: data['profile'] === null ? null : fingerprint(data['profile']),
    signature: bytes(data['signature'], 64),
  };
}
function members(data: Record<string, unknown>): {
  devices: AuthorizedDevice[];
  revoked: string[];
} {
  const devices = data['devices'];
  const revoked = data['revoked'];
  if (
    !Array.isArray(devices) ||
    !devices.length ||
    devices.length > deviceLimit ||
    !Array.isArray(revoked) ||
    revoked.length > deviceLimit
  )
    reject();
  return {
    devices: (devices as unknown[]).map(authorizedDevice),
    revoked: (revoked as unknown[]).map(uuid),
  };
}
export function identityOf(device: DeviceIdentity): DeviceIdentity {
  return {
    id: device.id,
    name: device.name,
    signing: device.signing,
    wrapping: device.wrapping,
  };
}
export interface LinkCode {
  version: 1;
  accountId: string;
  id: string;
  nonce: string;
  expiresAt: string;
  device: DeviceIdentity;
}
export function linkCode(value: unknown): LinkCode {
  const data = object(value);
  keys(data, ['version', 'accountId', 'id', 'nonce', 'expiresAt', 'device']);
  if (data['version'] !== 1) reject();
  const expiresAt = boundedText(data['expiresAt'], 32);
  if (
    !Number.isFinite(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString() !== expiresAt
  )
    reject();
  return {
    version: 1,
    accountId: uuid(data['accountId']),
    id: uuid(data['id']),
    nonce: fingerprint(data['nonce']),
    expiresAt,
    device: deviceIdentity(data['device']),
  };
}
