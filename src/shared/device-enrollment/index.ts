import { boundedText, keys, object, uuid } from '../account/index.ts';
import { canonical, digest, fingerprint, linkCode } from '../devices/index.ts';
import type { LinkCode } from '../devices/index.ts';
export interface EnrollmentCode {
  version: 1;
  id: string;
  accountId: string;
  root: string;
  secret: string;
  expiresAt: string;
}
export function enrollmentCode(value: unknown): EnrollmentCode {
  const data = object(value);
  keys(data, ['version', 'id', 'accountId', 'root', 'secret', 'expiresAt']);
  const secret = boundedText(data['secret'], 64),
    expiresAt = boundedText(data['expiresAt'], 32);
  if (
    data['version'] !== 1 ||
    !/^[a-f0-9]{64}$/u.test(secret) ||
    !Number.isFinite(Date.parse(expiresAt))
  )
    throw new Error('Invalid linking code.');
  return {
    version: 1,
    id: uuid(data['id']),
    accountId: uuid(data['accountId']),
    root: fingerprint(data['root']),
    secret,
    expiresAt,
  };
}
export function enrollmentPayload(code: EnrollmentCode): string {
  return '0xdmme-enroll:1:' + canonical(enrollmentCode(code));
}
/** Fragment-only URL: the capability never enters HTTP requests or referrers. */
export function enrollmentUrl(code: EnrollmentCode, origin: string): string {
  const url = new URL('/', origin);
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Linking requires HTTPS.');
  url.hash = 'vincular=' + encodeURIComponent(enrollmentPayload(code));
  return url.href;
}
export function readEnrollment(
  value: string,
  origin = 'https://0xdmme.app',
): EnrollmentCode {
  if (value.length > 4096) throw new Error('Linking code exceeds the limit.');
  if (/^https?:/u.test(value)) {
    const url = new URL(value);
    if (
      url.origin !== new URL(origin).origin ||
      url.pathname !== '/' ||
      url.search ||
      !url.hash.startsWith('#vincular=')
    )
      throw new Error('Invalid linking link.');
    value = decodeURIComponent(url.hash.slice('#vincular='.length));
  }
  if (value.length > 2048) throw new Error('Linking code exceeds the limit.');
  const raw = value.startsWith('0xdmme-enroll:1:')
    ? value.slice('0xdmme-enroll:1:'.length)
    : value;
  return enrollmentCode(JSON.parse(raw) as unknown);
}
export async function enrollmentHash(code: EnrollmentCode): Promise<string> {
  return digest(code.secret);
}
export function enrollmentBody(
  account: string,
  device: string,
  payload: unknown,
): string {
  return canonical(['0xdmme-device-enrollment', 1, account, device, payload]);
}
function secretBytes(secret: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-f0-9]{64}$/u.test(secret))
    throw new Error('Invalid linking secret.');
  return Uint8Array.from(secret.match(/../gu) ?? [], (v) => parseInt(v, 16));
}
async function macKey(secret: string): Promise<CryptoKey> {
  const bytes = secretBytes(secret);
  try {
    return await crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  } finally {
    bytes.fill(0);
  }
}
export async function enrollmentMac(
  secret: string,
  code: LinkCode,
): Promise<string> {
  const signed = await crypto.subtle.sign(
    'HMAC',
    await macKey(secret),
    new TextEncoder().encode(
      canonical(['0xdmme-device-enrollment-request', 1, linkCode(code)]),
    ),
  );
  return [...new Uint8Array(signed)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function verifyEnrollmentMac(
  secret: string,
  code: LinkCode,
  proof: string,
): Promise<void> {
  const bytes = secretBytes(proof);
  if (
    !(await crypto.subtle.verify(
      'HMAC',
      await macKey(secret),
      bytes,
      new TextEncoder().encode(
        canonical(['0xdmme-device-enrollment-request', 1, linkCode(code)]),
      ),
    ))
  )
    throw new Error('The request does not match the shared code.');
}
