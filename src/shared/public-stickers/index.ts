import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { prepareGif } from '../gif-inspection/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';
import { mp4StickerShape, prepareMp4Sticker } from '../mp4-inspection/index.ts';
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
/**
 * PNG, GIF, or since 26/11/2026 a short silent MP4 clip: a GIF from the chat
 * keeps its original video format instead of a heavier animated GIF.
 */
export type StickerFileType = 'image/png' | 'image/gif' | 'video/mp4';
export const stickerFileTypes: readonly StickerFileType[] = [
  'image/png',
  'image/gif',
  'video/mp4',
];
export function stickerFileType(value: unknown): value is StickerFileType {
  return stickerFileTypes.includes(value as StickerFileType);
}
/** A released sticker file as served at its stable address. */
export interface StickerImage {
  type: StickerFileType;
  bytes: Uint8Array<ArrayBuffer>;
}
export interface PublicStickerFile {
  type: StickerFileType;
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
  type: StickerFileType,
): PublicStickerFile {
  if (type === 'video/mp4') {
    const prepared = prepareMp4Sticker(bytes);
    const { width, height } = mp4StickerShape(prepared);
    return { type, bytes: prepared, width, height };
  }
  if (type === 'image/gif') {
    const prepared = prepareGif(bytes);
    return { type, bytes: prepared, ...gifSize(prepared) };
  }
  const shape = imageShape(bytes);
  if (shape.type !== type || !metadataFree(bytes, type))
    throw new Error('Sticker is not prepared.');
  return { type, bytes, width: shape.width, height: shape.height };
}

/** Checks prepared sticker bytes: PNG without metadata, a GIF, or a short
 * silent MP4 without metadata boxes; at most 1024 px. */
export function stickerFileFromBytes(
  bytes: Uint8Array<ArrayBuffer>,
  type: StickerFileType,
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

/** A prepared sticker file; never permission to show it publicly. */
export function publicStickerFile(value: unknown): PublicStickerFile {
  const data = object(value);
  keys(data, ['type', 'bytes']);
  const type = data['type'];
  if (!stickerFileType(type))
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
