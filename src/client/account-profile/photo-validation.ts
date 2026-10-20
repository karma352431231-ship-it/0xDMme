import { encode, profileLimit } from '../../shared/account/index.ts';
function photoSignature(type: string, bytes: Uint8Array): boolean {
  if (type === 'image/png')
    return encode(bytes.subarray(0, 8)) === 'iVBORw0KGgo=';
  if (type === 'image/jpeg')
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/webp')
    return (
      new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
    );
  return false;
}

export function validatePhoto(
  type: string,
  bytes: Uint8Array<ArrayBuffer>,
): void {
  if (bytes.length === 0 || bytes.length > profileLimit)
    throw new Error('The photo must be no larger than 3 MB.');
  if (!photoSignature(type, bytes))
    throw new Error('Use a valid PNG, JPEG or WebP photo.');
}
