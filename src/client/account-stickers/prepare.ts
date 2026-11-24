import { t } from '../../shared/i18n/index.ts';
import {
  publicStickerBytes,
  stickerFileFromBytes,
} from '../../shared/public-stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';
import { cropImage } from '../image-crop/index.ts';
import type { CropShape } from '../image-crop/index.ts';

/**
 * Turns any picture into a sticker on this device (24/11/2026). A still
 * picture is framed square, like a profile photo, and saved as a 512 px PNG
 * (transparency kept). A GIF stays as it is when it fits 1 MB and 1024 px.
 * There is no automatic background removal (owner decision).
 */
const side = 512;
const stickerCrop: CropShape = {
  aspect: 1,
  round: false,
  width: side,
  height: side,
};

function gifBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 6 && String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8'
  );
}

async function pngFrom(
  picture: Blob,
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const bitmap = await createImageBitmap(picture);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the sticker.');
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const width = Math.round(bitmap.width * scale),
      height = Math.round(bitmap.height * scale);
    context.drawImage(
      bitmap,
      Math.round((size - width) / 2),
      Math.round((size - height) / 2),
      width,
      height,
    );
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new Error('Could not prepare the sticker.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function stillSticker(
  picture: Blob,
  frame: boolean,
): Promise<PublicStickerFile | null> {
  const framed = frame
    ? await cropImage(
        picture instanceof File
          ? picture
          : new File([picture], 'sticker', { type: picture.type }),
        stickerCrop,
        t('The framed square becomes your sticker.'),
      )
    : picture;
  if (!framed) return null;
  let bytes = await pngFrom(framed, side);
  // Detailed pictures can exceed 1 MB as PNG; a smaller square still reads well.
  if (bytes.length > publicStickerBytes) bytes = await pngFrom(framed, 384);
  if (bytes.length > publicStickerBytes)
    throw new Error('This picture is too detailed for a sticker.');
  return stickerFileFromBytes(bytes, 'image/png');
}

/**
 * Prepares a picture as a sticker; null when the person cancels framing.
 * `frame` is false when the picture is already a sticker (saving a received one).
 */
export async function prepareSticker(
  picture: Blob,
  frame = true,
): Promise<PublicStickerFile | null> {
  const bytes = new Uint8Array(await picture.arrayBuffer());
  if (!gifBytes(bytes)) return stillSticker(picture, frame);
  if (bytes.length > publicStickerBytes)
    throw new Error('Choose a GIF up to 1 MB for a sticker.');
  try {
    return stickerFileFromBytes(bytes, 'image/gif');
  } catch {
    throw new Error('Choose a GIF up to 1 MB and 1024 px for a sticker.');
  }
}
