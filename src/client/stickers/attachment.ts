import { stickerFileNames } from '../../shared/stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';

/** A personal sticker as an attachment selection (see `stickerAttachment`). */
export function stickerSelection(file: PublicStickerFile) {
  return {
    name: stickerFileNames[file.type],
    type: file.type,
    // A video sticker is a video attachment, never an image one.
    image: file.type !== 'video/mp4',
    bytes: new Uint8Array(file.bytes),
    thumbnail: null,
  };
}
