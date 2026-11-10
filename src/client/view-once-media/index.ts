import {
  originalImageType,
  originalVideoType,
  videoSignature,
} from '../attachment-images/index.ts';

export { originalVideoType as viewOnceVideoType } from '../attachment-images/index.ts';

export function viewOnceSelectionMime(
  bytes: Uint8Array,
  name: string,
  declared: string,
): string {
  const gif = /^GIF8[79]a$/u.test(String.fromCharCode(...bytes.subarray(0, 6)));
  const type = gif
    ? 'image/gif'
    : (originalImageType(bytes) ?? originalVideoType(bytes));
  if (type) return type;
  if (
    declared.startsWith('video/') ||
    videoSignature(bytes) ||
    /\.(?:mp4|mov|m4v|webm|mkv|avi|mpeg|mpg|ogv|flv|3gp|ts)$/iu.test(name)
  )
    throw new Error('Use an MP4 or MOV video for view once.');
  return declared || 'application/octet-stream';
}
