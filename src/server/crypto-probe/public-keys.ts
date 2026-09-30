import {
  identity,
  onlyKeys,
  record,
  text,
} from '../../shared/crypto-probe/index.ts';
import type { JsonObject, Role } from '../../shared/crypto-probe/index.ts';

function publicKey(value: unknown): void {
  if (!/^[A-Za-z0-9+/]{43}$/.test(text(value, 43))) {
    throw new Error('Chave pública inválida.');
  }
}

function signatures(value: unknown, role: Role): void {
  const id = identity(role);
  const users = record(value);
  onlyKeys(users, [id.user]);
  const keys = record(users[id.user]);
  onlyKeys(keys, [`ed25519:${id.device}`]);
  if (!/^[A-Za-z0-9+/]{86}$/.test(text(keys[`ed25519:${id.device}`], 86))) {
    throw new Error('Assinatura inválida.');
  }
}

function deviceKeys(value: unknown, role: Role): void {
  const keys = record(value);
  const id = identity(role);
  onlyKeys(keys, ['user_id', 'device_id', 'algorithms', 'keys', 'signatures']);
  if (keys.user_id !== id.user || keys.device_id !== id.device) {
    throw new Error('Identidade inválida.');
  }
  if (!Array.isArray(keys.algorithms) || keys.algorithms.length !== 2) {
    throw new Error('Algoritmos inválidos.');
  }
  const supported = ['m.olm.v1.curve25519-aes-sha2', 'm.megolm.v1.aes-sha2'];
  if (
    !supported.every((algorithm) =>
      (keys.algorithms as unknown[]).includes(algorithm),
    )
  ) {
    throw new Error('Algoritmos inválidos.');
  }
  const publicKeys = record(keys.keys);
  onlyKeys(publicKeys, [`ed25519:${id.device}`, `curve25519:${id.device}`]);
  publicKey(publicKeys[`ed25519:${id.device}`]);
  publicKey(publicKeys[`curve25519:${id.device}`]);
  signatures(keys.signatures, role);
}

function oneTimeKeys(value: unknown, role: Role): JsonObject {
  const keys = record(value);
  if (Object.keys(keys).length > 100)
    throw new Error('Limite de chaves excedido.');
  for (const [id, value] of Object.entries(keys)) {
    if (!/^signed_curve25519:[A-Za-z0-9+/]{1,64}$/.test(id)) {
      throw new Error('Identificador de chave inválido.');
    }
    const key = record(value);
    onlyKeys(key, ['key', 'signatures', 'fallback']);
    if (key.fallback !== undefined && key.fallback !== true) {
      throw new Error('Fallback inválido.');
    }
    publicKey(key.key);
    signatures(key.signatures, role);
  }
  return keys;
}

export function validateUpload(body: JsonObject, role: Role) {
  onlyKeys(body, ['device_keys', 'one_time_keys', 'fallback_keys']);
  deviceKeys(body.device_keys, role);
  oneTimeKeys(body.fallback_keys, role);
  return {
    device: record(body.device_keys),
    oneTime: oneTimeKeys(body.one_time_keys, role),
  };
}
