import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { prepareGif } from '../gif-inspection/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';
import { publicStickerBytes } from '../stickers/index.ts';

export { publicStickerBytes };

/**
 * Public and personal sticker files (24/11/2026): the bytes a person turns
 * into a sticker, checked the same way on the device and on the server.
 * Kept apart from the sticker link grammar, which every chat loads.
 */
/** Public sticker and pack bounds (24/11/2026). */
export const publicStickerLimits = {
  side: 1024,
  perProfile: 300,
  packsPerProfile: 20,
  perPack: 30,
  addedPacks: 50,
  packName: 40,
} as const;
export interface PublicStickerFile {
  type: 'image/png' | 'image/gif';
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

function gifSize(bytes: Uint8Array): { width: number; height: number } {
  return {
    width: (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8),
    height: (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8),
  };
}
function stickerShape(
  bytes: Uint8Array<ArrayBuffer>,
  type: 'image/png' | 'image/gif',
): PublicStickerFile {
  if (type === 'image/gif') {
    const prepared = prepareGif(bytes);
    return { type, bytes: prepared, ...gifSize(prepared) };
  }
  const shape = imageShape(bytes);
  if (shape.type !== type || !metadataFree(bytes, type))
    throw new Error('Sticker is not prepared.');
  return { type, bytes, width: shape.width, height: shape.height };
}

/** Checks prepared sticker bytes: PNG without metadata or a GIF, ≤1024 px. */
export function stickerFileFromBytes(
  bytes: Uint8Array<ArrayBuffer>,
  type: 'image/png' | 'image/gif',
): PublicStickerFile {
  let file: PublicStickerFile;
  try {
    if (bytes.length > publicStickerBytes) throw new Error('Too large.');
    file = stickerShape(bytes, type);
  } catch {
    throw new AccountError(400, 'Sticker invalid. Prepare it again.');
  }
  const side = Math.max(file.width, file.height);
  if (!file.width || !file.height || side > publicStickerLimits.side)
    throw new AccountError(400, 'Sticker invalid. Prepare it again.');
  return file;
}

/** A prepared PNG or GIF sticker; never permission to show it publicly. */
export function publicStickerFile(value: unknown): PublicStickerFile {
  const data = object(value);
  keys(data, ['type', 'bytes']);
  const type = data['type'];
  if (type !== 'image/png' && type !== 'image/gif')
    throw new AccountError(400, 'Prepare a PNG or GIF sticker.');
  return stickerFileFromBytes(base64(data['bytes'], publicStickerBytes), type);
}

/** A pack name: one line, trimmed, 1–40 characters. */
export function stickerPackName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (
    !name ||
    [...name].length > publicStickerLimits.packName ||
    /[\p{Cc}\p{Cf}\n]/u.test(name)
  )
    throw new AccountError(400, 'Name the pack in 1 to 40 characters.');
  return name;
}

/** Public sticker IDs, unique and bounded (a pack's order matters). */
export function publicStickerIds(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new AccountError(400, 'Invalid sticker list.');
  const result = value.map((item: unknown) => uuid(item));
  if (new Set(result).size !== result.length)
    throw new AccountError(400, 'Invalid sticker list.');
  return result;
}
