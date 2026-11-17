import { imageFilePicture, previewByteLimit } from '../media-preview/index.ts';

/** The input is an already verified sender thumbnail. */
export async function prepareGalleryPicture(
  bytes: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes.length <= previewByteLimit) return bytes;
  try {
    const picture = await imageFilePicture(new Blob([bytes]), signal);
    if (!picture) throw new Error('Preview unavailable.');
    return picture;
  } finally {
    bytes.fill(0);
  }
}
