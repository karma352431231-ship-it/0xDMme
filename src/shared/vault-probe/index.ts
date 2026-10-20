import { onlyKeys, parseObject, text } from '../crypto-probe/index.ts';

export const vaultFormat = 'hash-talk-vault-probe';
export const maxVaultBytes = 65_536;
export type VaultEnvelope = {
  format: typeof vaultFormat;
  version: 1;
  owner: string;
  revision: number;
  iv: string;
  wrapIv: string;
  wrappedKey: string;
  ciphertext: string;
};

export function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function decode(
  value: unknown,
  maximum: number,
): Uint8Array<ArrayBuffer> {
  const encoded = text(value, Math.ceil(maximum / 3) * 4);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  )
    throw new Error('Invalid encoding.');
  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length > maximum || encode(bytes) !== encoded)
    throw new Error('Non-canonical encoding.');
  return bytes;
}

function exactBytes(value: unknown, length: number): string {
  if (decode(value, length).length !== length) throw new Error('Invalid size.');
  return text(value);
}

/** Validates only the public envelope. Never accepts a key or readable history. */
export function parseEnvelope(serialized: string): VaultEnvelope {
  if (new TextEncoder().encode(serialized).length > maxVaultBytes)
    throw new Error('Vault exceeds the probe limit.');
  const value = parseObject(serialized);
  onlyKeys(value, [
    'format',
    'version',
    'owner',
    'revision',
    'iv',
    'wrapIv',
    'wrappedKey',
    'ciphertext',
  ]);
  if (value.format !== vaultFormat || value.version !== 1)
    throw new Error('Unsupported vault format.');
  const revision = value.revision;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error('Invalid revision.');
  const ciphertext = text(value.ciphertext, 44_000);
  if (decode(ciphertext, 32_016).length < 16)
    throw new Error('Incomplete vault.');
  return {
    format: vaultFormat,
    version: 1,
    owner: text(value.owner, 100),
    revision,
    iv: exactBytes(value.iv, 12),
    wrapIv: exactBytes(value.wrapIv, 12),
    wrappedKey: exactBytes(value.wrappedKey, 48),
    ciphertext,
  };
}

export function authenticatedHeader(
  owner: string,
  revision: number,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([vaultFormat, 1, text(owner, 100), revision]),
  );
}
