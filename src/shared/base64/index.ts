const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
interface NativeDecoder {
  fromBase64?: (
    value: string,
    options: { alphabet: 'base64'; lastChunkHandling: 'strict' },
  ) => Uint8Array<ArrayBuffer>;
}
/** Canonical padded RFC 4648 only. Bound allocation before invoking either codec. */
export function decodeCanonicalBase64(
  value: string,
  maximum: number,
): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(maximum) || maximum < 0)
    throw new TypeError('Invalid base64 limit.');
  validateCanonicalBase64(value, maximum);
  const native = Uint8Array as typeof Uint8Array & NativeDecoder;
  if (native.fromBase64)
    return native.fromBase64(value, {
      alphabet: 'base64',
      lastChunkHandling: 'strict',
    });
  const binary = atob(value),
    bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Native codec honors byteOffset/byteLength. Legacy clients retain bounded spread. */
export function encodeCanonicalBase64(bytes: Uint8Array): string {
  const native = bytes as Uint8Array & { toBase64?: () => string };
  if (native.toBase64) return native.toBase64();
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    output += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(output);
}

function validateCanonicalBase64(value: string, maximum: number): void {
  if (
    value.length % 4 ||
    value.length > 4 * Math.ceil(maximum / 3) ||
    /[^A-Za-z0-9+/=]/u.test(value)
  )
    throw new TypeError('Invalid base64.');
  const padding = value.endsWith('==') ? 2 : Number(value.endsWith('='));
  const end = value.length - padding;
  if (
    value.indexOf('=') !== (padding ? end : -1) ||
    (value.length / 4) * 3 - padding > maximum
  )
    throw new TypeError('Invalid base64.');
  validatePaddingBits(value, end, padding);
}
function validatePaddingBits(
  value: string,
  end: number,
  padding: number,
): void {
  if (
    padding &&
    alphabet.indexOf(value.charAt(end - 1)) & (padding === 2 ? 15 : 3)
  )
    throw new TypeError('Invalid base64.');
}
