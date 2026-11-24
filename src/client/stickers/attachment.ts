import { stickerFileNames } from '../../shared/stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';

/** A personal sticker as an attachment selection (see `stickerAttachment`). */
export function stickerSelection(file: PublicStickerFile) {
  return {
    name: stickerFileNames[file.type],
    type: file.type,
    image: true,
    bytes: new Uint8Array(file.bytes),
    thumbnail: null,
  };
}
