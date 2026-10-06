import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  matrixBase64,
  matrixBinding,
  matrixCiphertext,
  matrixOneTimeKey,
  matrixUser,
} from '../../shared/messages/index.ts';
import type { MatrixBinding } from '../../shared/messages/index.ts';
import type { MatrixUpload } from '../database/index.ts';
import { groupDeviceBatchSize } from '../../shared/group-messages/index.ts';
export function matrixAccount(input: string): string {
  const match = /^@([a-f0-9-]+):0xdmme\.app$/u.exec(input);
  if (!match?.[1]) throw new AccountError(400, 'Conta Matrix inválida.');
  return uuid(match[1]);
}
function keyBatch(input: unknown, binding: MatrixBinding, maximum: number) {
  const values = object(input ?? {});
  if (Object.keys(values).length > maximum)
    throw new AccountError(413, 'Lote de chaves excedido.');
  return Object.fromEntries(
    Object.entries(values).map(([id, value]) => {
      if (!/^signed_curve25519:[A-Za-z0-9+/_-]{1,100}$/u.test(id))
        throw new AccountError(400, 'Identificador de chave inválido.');
      return [id, matrixOneTimeKey(value, binding)];
    }),
  );
}
export function matrixUpload(data: Record<string, unknown>): MatrixUpload {
  keys(data, ['binding', 'sdk']);
  const binding = matrixBinding(data['binding']),
    sdk = object(data['sdk']);
  keys(
    sdk,
    Object.keys(sdk).filter((k) =>
      ['device_keys', 'one_time_keys', 'fallback_keys'].includes(k),
    ),
  );
  if (
    sdk['device_keys'] !== undefined &&
    canonical(sdk['device_keys']) !== canonical(binding.public)
  )
    throw new AccountError(403, 'Chaves Matrix divergentes do vínculo.');
  return {
    binding,
    keys: keyBatch(sdk['one_time_keys'], binding, 100),
    fallback: keyBatch(sdk['fallback_keys'], binding, 1),
  };
}
export function matrixQuery(data: Record<string, unknown>): string[] {
  return queryAccounts(data, 2);
}
export function groupMatrixQuery(data: Record<string, unknown>): string[] {
  return queryAccounts(data, 16);
}
function queryAccounts(
  data: Record<string, unknown>,
  maximum: number,
): string[] {
  keys(data, ['sdk']);
  const sdk = object(data['sdk']);
  keys(
    sdk,
    Object.keys(sdk).filter((k) => ['device_keys', 'timeout'].includes(k)),
  );
  const users = object(sdk['device_keys']);
  if (Object.keys(users).length > maximum)
    throw new AccountError(413, 'Lote de consulta de chaves excedido.');
  return Object.entries(users).map(([user, devices]) => {
    if (!Array.isArray(devices) || devices.length)
      throw new AccountError(400, 'Consulte o diretório completo.');
    return matrixAccount(user);
  });
}
export function matrixClaim(
  data: Record<string, unknown>,
): { account: string; device: string }[] {
  return claimRequests(data, 64);
}
export function groupMatrixClaim(
  data: Record<string, unknown>,
): { account: string; device: string }[] {
  return claimRequests(data, groupDeviceBatchSize);
}
function claimRequests(
  data: Record<string, unknown>,
  maximum: number,
): { account: string; device: string }[] {
  keys(data, ['sdk']);
  const sdk = object(data['sdk']);
  keys(
    sdk,
    Object.keys(sdk).filter((k) => ['one_time_keys', 'timeout'].includes(k)),
  );
  const requests = Object.entries(object(sdk['one_time_keys'])).flatMap(
    ([user, devices]) =>
      Object.entries(object(devices)).map(([device, algorithm]) => {
        if (algorithm !== 'signed_curve25519')
          throw new AccountError(400, 'Algoritmo de sessão inválido.');
        return { account: matrixAccount(user), device: uuid(device) };
      }),
  );
  if (requests.length > maximum)
    throw new AccountError(413, 'Lote de sessões excedido.');
  return requests;
}
export function olmContent(input: unknown): Record<string, unknown> {
  const content = object(input);
  keys(content, [
    'algorithm',
    'sender_key',
    'ciphertext',
    ...(Object.hasOwn(content, 'org.matrix.msgid') ? ['org.matrix.msgid'] : []),
  ]);
  if (Object.hasOwn(content, 'org.matrix.msgid'))
    boundedText(content['org.matrix.msgid'], 128);
  if (content['algorithm'] !== 'm.olm.v1.curve25519-aes-sha2')
    throw new AccountError(400, 'Envelope exige Olm.');
  matrixBase64(content['sender_key'], 32);
  const ciphertext = object(content['ciphertext']);
  if (Object.keys(ciphertext).length !== 1)
    throw new AccountError(400, 'Envelope exige um aparelho.');
  for (const [curve, raw] of Object.entries(ciphertext)) {
    matrixBase64(curve, 32);
    const body = object(raw);
    keys(body, ['type', 'body']);
    if (body['type'] !== 0 && body['type'] !== 1)
      throw new AccountError(400, 'Tipo Olm inválido.');
    matrixCiphertext(body['body'], 16_000);
  }
  return content;
}
export function matrixSend(data: Record<string, unknown>) {
  return sendEnvelopes(data, 64);
}
export function groupMatrixSend(data: Record<string, unknown>) {
  return sendEnvelopes(data, groupDeviceBatchSize);
}
function sendEnvelopes(data: Record<string, unknown>, maximum: number) {
  keys(data, ['sdk', 'id', 'type']);
  const id = boundedText(data['id'], 128);
  if (!/^[A-Za-z0-9_.-]+$/u.test(id) || data['type'] !== 'm.room.encrypted')
    throw new AccountError(400, 'Transporte individual inválido.');
  const sdk = object(data['sdk']);
  keys(sdk, ['messages']);
  const envelopes = Object.entries(object(sdk['messages'])).flatMap(
    ([user, devices]) =>
      Object.entries(object(devices)).map(([device, content]) => ({
        account: matrixAccount(user),
        device: uuid(device),
        content: olmContent(content),
      })),
  );
  if (envelopes.length > maximum)
    throw new AccountError(413, 'Lote de envelopes excedido.');
  return { id, envelopes };
}
export function assertBindingAccount(
  binding: MatrixBinding,
  account: string,
  device: string,
): void {
  if (
    binding.public.user_id !== matrixUser(account) ||
    binding.deviceId !== device
  )
    throw new AccountError(403, 'Vínculo de outro aparelho.');
}
