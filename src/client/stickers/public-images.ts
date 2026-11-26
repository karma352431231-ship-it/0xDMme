import { publicStickerBlob } from '../public-media/index.ts';

/**
 * Public stickers repeat across a chat, so their approved files stay as a few
 * object URLs for this page. The oldest is released past the budget.
 */
const budget = 48;
/** A loaded public sticker file; `video` for an MP4 clip (26/11/2026). */
export interface StickerArtSource {
  url: string;
  video: boolean;
}
const images = new Map<string, Promise<StickerArtSource>>();

export function publicStickerImage(
  id: string,
  signal: AbortSignal,
): Promise<StickerArtSource> {
  const known = images.get(id);
  if (known) {
    images.delete(id);
    images.set(id, known);
    return known;
  }
  // The shared read outlives one message, so one view leaving does not cancel it.
  const read = publicStickerBlob(id, AbortSignal.timeout(15_000)).then(
    (blob) => ({
      url: URL.createObjectURL(blob),
      video: blob.type === 'video/mp4',
    }),
  );
  read.catch(() => images.delete(id));
  images.set(id, read);
  while (images.size > budget) {
    const [oldest, url] = images.entries().next().value as [
      string,
      Promise<StickerArtSource>,
    ];
    images.delete(oldest);
    void url.then(
      (value) => URL.revokeObjectURL(value.url),
      () => undefined,
    );
  }
  signal.throwIfAborted();
  return read;
}
