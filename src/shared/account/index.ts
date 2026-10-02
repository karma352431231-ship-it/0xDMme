import { canonicalAddress, ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';
export const profileLimit = 3_000_000;
export const encryptedProfileLimit = profileLimit + 65_536;

export class AccountError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new AccountError(400, 'Dados inválidos.');
  return value as Record<string, unknown>;
}

export function keys(value: Record<string, unknown>, expected: string[]): void {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    throw new AccountError(400, 'Campos inválidos.');
}

export function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum || value.length === 0)
    throw new AccountError(400, 'Texto inválido.');
  return value;
}

export function uuid(value: unknown): string {
  const result = boundedText(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      result,
    )
  )
    throw new AccountError(400, 'Identificador inválido.');
  return result;
}

export function displayName(value: unknown): string {
  if (typeof value !== 'string') throw new AccountError(400, 'Nome inválido.');
  const name = value.normalize('NFC').trim();
  if (name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new AccountError(400, 'Nome inválido.');
  return name;
}

export interface AccountSession {
  accountId: string;
  ecosystem: Ecosystem;
  address: string;
  name: string;
  deviceId: string;
  deviceState: 'pending';
  historyAuthorized: false;
  expiresAt: string;
  csrf: string;
  profileRevision: number;
}

export interface EncryptedProfile {
  version: 1;
  revision: number;
  iv: string;
  ciphertext: string;
}

export function accountSession(value: unknown): AccountSession {
  const data = object(value);
  const expiresAt = boundedText(data['expiresAt'], 32);
  if (
    !Number.isFinite(Date.parse(expiresAt)) ||
    data['deviceState'] !== 'pending' ||
    data['historyAuthorized'] !== false
  )
    throw new AccountError(400, 'Sessão inválida.');
  const network = ecosystem(data['ecosystem']);
  const address = canonicalAddress(network, data['address']);
  const csrf = boundedText(data['csrf'], 64);
  if (
    !/^[0-9a-f]{64}$/u.test(csrf) ||
    typeof data['profileRevision'] !== 'number' ||
    !Number.isSafeInteger(data['profileRevision']) ||
    data['profileRevision'] < 0
  )
    throw new AccountError(400, 'Sessão inválida.');
  return {
    accountId: uuid(data['accountId']),
    ecosystem: network,
    address,
    name: displayName(data['name']),
    deviceId: uuid(data['deviceId']),
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt,
    csrf,
    profileRevision: data['profileRevision'],
  };
}

export function base64(
  value: unknown,
  maximum: number,
): Uint8Array<ArrayBuffer> {
  const encoded = boundedText(value, Math.ceil(maximum / 3) * 4);
  if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(encoded))
    throw new AccountError(400, 'Codificação inválida.');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0),
    );
  } catch {
    throw new AccountError(400, 'Codificação inválida.');
  }
  if (bytes.length > maximum || encode(bytes) !== encoded)
    throw new AccountError(400, 'Codificação inválida.');
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  // Avoid spreading multi-megabyte arrays into the JS call stack.
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    output += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(output);
}

export function profileEnvelope(value: unknown): EncryptedProfile {
  const data = object(value);
  keys(data, ['version', 'revision', 'iv', 'ciphertext']);
  if (
    data['version'] !== 1 ||
    typeof data['revision'] !== 'number' ||
    !Number.isSafeInteger(data['revision']) ||
    data['revision'] < 1
  )
    throw new AccountError(400, 'Versão inválida.');
  if (
    base64(data['iv'], 12).length !== 12 ||
    base64(data['ciphertext'], encryptedProfileLimit).length < 16
  )
    throw new AccountError(400, 'Perfil cifrado inválido.');
  return {
    version: 1,
    revision: data['revision'],
    iv: boundedText(data['iv'], 16),
    ciphertext: boundedText(
      data['ciphertext'],
      Math.ceil(encryptedProfileLimit / 3) * 4,
    ),
  };
}
