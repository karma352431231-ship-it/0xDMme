import { base64urlnopad, hex } from '@scure/base';

const publicUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Represent the complete public UUID in 22 URL-safe characters, without a lookup. */
export function compactPublicId(value: string): string {
  return publicUuid.test(value)
    ? base64urlnopad.encode(hex.decode(value.replaceAll('-', '')))
    : value;
}

/** Unrecognized input remains subject to the existing identifier validation. */
export function expandPublicId(value: string): string {
  if (!/^[A-Za-z0-9_-]{22}$/u.test(value)) return value;
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(value);
  } catch {
    return value;
  }
  if (bytes.length !== 16 || base64urlnopad.encode(bytes) !== value)
    return value;
  const raw = hex.encode(bytes);
  const id = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  return publicUuid.test(id) ? id : value;
}
