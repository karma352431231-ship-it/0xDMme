import { ed25519 } from '@noble/curves/ed25519';
import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { canonical, eventHash, fingerprint, verify } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { matrixBase64, matrixUser } from './format.ts';

export interface MatrixDeviceKeys {
  user_id: string;
  device_id: string;
  algorithms: string[];
  keys: Record<string, string>;
  signatures: Record<string, Record<string, string>>;
}
export interface MatrixBinding {
  accountId: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  public: MatrixDeviceKeys;
  signature: string;
}
function signatureMap(
  input: unknown,
  user: string,
  device: string,
): Record<string, Record<string, string>> {
  const users = object(input);
  keys(users, [user]);
  const signatures = object(users[user]),
    id = `ed25519:${device}`;
  keys(signatures, [id]);
  return { [user]: { [id]: matrixBase64(signatures[id], 64) } };
}
function verifyMatrixSignature(
  input: Record<string, unknown>,
  publicKey: string,
  signature: string,
): void {
  const { signatures, unsigned, ...signed } = input;
  void signatures;
  void unsigned;
  const decode = (text: string, size: number) =>
    base64(text.padEnd(Math.ceil(text.length / 4) * 4, '='), size);
  if (
    !ed25519.verify(
      decode(signature, 64),
      new TextEncoder().encode(canonical(signed)),
      decode(publicKey, 32),
      { zip215: false },
    )
  )
    throw new AccountError(403, 'Assinatura Matrix inválida.');
}
export function matrixDeviceKeys(
  input: unknown,
  account: string,
  device: string,
): MatrixDeviceKeys {
  const data = object(input);
  keys(data, ['user_id', 'device_id', 'algorithms', 'keys', 'signatures']);
  const user = matrixUser(account),
    identity = uuid(device);
  const algorithms = data['algorithms'];
  if (
    data['user_id'] !== user ||
    data['device_id'] !== identity ||
    !Array.isArray(algorithms) ||
    algorithms.length !== 2 ||
    !algorithms.includes('m.olm.v1.curve25519-aes-sha2') ||
    !algorithms.includes('m.megolm.v1.aes-sha2')
  )
    throw new AccountError(400, 'Identidade Matrix divergente.');
  const publicKeys = object(data['keys']);
  keys(publicKeys, [`curve25519:${identity}`, `ed25519:${identity}`]);
  const result: MatrixDeviceKeys = {
    user_id: user,
    device_id: identity,
    algorithms: algorithms as string[],
    keys: {
      [`curve25519:${identity}`]: matrixBase64(
        publicKeys[`curve25519:${identity}`],
        32,
      ),
      [`ed25519:${identity}`]: matrixBase64(
        publicKeys[`ed25519:${identity}`],
        32,
      ),
    },
    signatures: signatureMap(data['signatures'], user, identity),
  };
  verifyMatrixSignature(
    data,
    result.keys[`ed25519:${identity}`] ?? '',
    result.signatures[user]?.[`ed25519:${identity}`] ?? '',
  );
  return result;
}
export function matrixBinding(input: unknown): MatrixBinding {
  const data = object(input);
  keys(data, [
    'accountId',
    'deviceId',
    'directory',
    'authorityRevision',
    'public',
    'signature',
  ]);
  const accountId = uuid(data['accountId']),
    deviceId = uuid(data['deviceId']);
  const revision = data['authorityRevision'];
  if (
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > 128 ||
    base64(data['signature'], 64).length !== 64
  )
    throw new AccountError(400, 'Vínculo Matrix inválido.');
  return {
    accountId,
    deviceId,
    directory: fingerprint(data['directory']),
    authorityRevision: revision,
    public: matrixDeviceKeys(data['public'], accountId, deviceId),
    signature: data['signature'] as string,
  };
}
export function matrixBindingProof(binding: MatrixBinding): string {
  const { signature, ...unsigned } = binding;
  void signature;
  return canonical(['0xdmme-matrix-device', 1, unsigned]);
}
export async function verifyMatrixBinding(
  input: unknown,
  event: DirectoryEvent,
): Promise<MatrixBinding> {
  const binding = matrixBinding(input),
    device = event.devices.find((d) => d.id === binding.deviceId);
  if (
    !device ||
    event.accountId !== binding.accountId ||
    event.revision !== binding.authorityRevision ||
    (await eventHash(event)) !== binding.directory
  )
    throw new AccountError(403, 'Vínculo Matrix sem autoridade verificada.');
  await verify(device.signing, binding.signature, matrixBindingProof(binding));
  return binding;
}
export function matrixOneTimeKey(
  input: unknown,
  binding: MatrixBinding,
): Record<string, unknown> {
  const data = object(input);
  keys(data, [
    'key',
    'signatures',
    ...(Object.hasOwn(data, 'fallback') ? ['fallback'] : []),
  ]);
  matrixBase64(data['key'], 32);
  if (Object.hasOwn(data, 'fallback') && data['fallback'] !== true)
    throw new AccountError(400, 'Fallback Matrix inválido.');
  const user = matrixUser(binding.accountId),
    device = binding.deviceId;
  const signatures = signatureMap(data['signatures'], user, device);
  verifyMatrixSignature(
    data,
    binding.public.keys[`ed25519:${device}`] ?? '',
    signatures[user]?.[`ed25519:${device}`] ?? '',
  );
  return data;
}
