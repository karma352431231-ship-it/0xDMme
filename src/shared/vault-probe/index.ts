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
    throw new Error('Codificação inválida.');
  const bytes = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length > maximum || encode(bytes) !== encoded)
    throw new Error('Codificação não canônica.');
  return bytes;
}

function exactBytes(value: unknown, length: number): string {
  if (decode(value, length).length !== length)
    throw new Error('Tamanho inválido.');
  return text(value);
}

/** Valida somente o envelope público. Nunca aceita chave ou histórico legível. */
export function parseEnvelope(serialized: string): VaultEnvelope {
  if (new TextEncoder().encode(serialized).length > maxVaultBytes)
    throw new Error('Cofre excede o limite do ensaio.');
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
    throw new Error('Formato de cofre não suportado.');
  const revision = value.revision;
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error('Revisão inválida.');
  const ciphertext = text(value.ciphertext, 44_000);
  if (decode(ciphertext, 32_016).length < 16)
    throw new Error('Cofre incompleto.');
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
