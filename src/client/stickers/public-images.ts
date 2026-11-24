import { publicStickerBlob } from '../public-media/index.ts';

/**
 * Public stickers repeat across a chat, so their approved files stay as a few
 * object URLs for this page. The oldest is released past the budget.
 */
const budget = 48;
const images = new Map<string, Promise<string>>();

export function publicStickerImage(
  id: string,
  signal: AbortSignal,
): Promise<string> {
  const known = images.get(id);
  if (known) {
    images.delete(id);
    images.set(id, known);
    return known;
  }
  // The shared read outlives one message, so one view leaving does not cancel it.
  const read = publicStickerBlob(id, AbortSignal.timeout(15_000)).then((blob) =>
    URL.createObjectURL(blob),
  );
  read.catch(() => images.delete(id));
  images.set(id, read);
  while (images.size > budget) {
    const [oldest, url] = images.entries().next().value as [
      string,
      Promise<string>,
    ];
    images.delete(oldest);
    void url.then(
      (value) => URL.revokeObjectURL(value),
      () => undefined,
    );
  }
  signal.throwIfAborted();
  return read;
}
