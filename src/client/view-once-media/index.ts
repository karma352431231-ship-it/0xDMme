import {
  originalImageType,
  videoSignature,
} from '../attachment-images/index.ts';

export function viewOnceVideoType(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  const box = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = box.getUint32(0);
  if (size < 16 || size > bytes.length || box.getUint32(4) !== 0x66747970)
    return null;
  const brand = String.fromCharCode(...bytes.subarray(8, 12));
  if (brand === 'qt  ') return 'video/quicktime';
  return /^(?:iso[m2-9]|mp4[12]|avc1|dash|M4V |MSNV)$/u.test(brand)
    ? 'video/mp4'
    : null;
}

export function viewOnceSelectionMime(
  bytes: Uint8Array,
  name: string,
  declared: string,
): string {
  const gif = /^GIF8[79]a$/u.test(String.fromCharCode(...bytes.subarray(0, 6)));
  const type = gif
    ? 'image/gif'
    : (originalImageType(bytes) ?? viewOnceVideoType(bytes));
  if (type) return type;
  if (
    declared.startsWith('video/') ||
    videoSignature(bytes) ||
    /\.(?:mp4|mov|m4v|webm|mkv|avi|mpeg|mpg|ogv|flv|3gp|ts)$/iu.test(name)
  )
    throw new Error('Use an MP4 or MOV video for view once.');
  return declared || 'application/octet-stream';
}
