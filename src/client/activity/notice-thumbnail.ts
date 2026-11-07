import { publicPostMediaBlob } from '../public-media/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';

/**
 * A small square of the public thumbnail of a post or reply in Activity, so
 * the reader recognises it (05/11/2026). The object URL lives only as long as
 * the signal; a failed read leaves the empty square.
 */
export function noticeThumbnail(
  media: PublicPostMedia,
  options: { signal: AbortSignal; small?: boolean },
): HTMLElement {
  const frame = document.createElement('span');
  frame.className = 'activity-card-thumb' + (options.small ? ' is-small' : '');
  frame.setAttribute('aria-hidden', 'true');
  const { signal } = options;
  if (signal.aborted) return frame;
  void publicPostMediaBlob(media, true, signal)
    .then((blob) => {
      if (signal.aborted) return;
      const url = URL.createObjectURL(blob);
      signal.addEventListener('abort', () => URL.revokeObjectURL(url), {
        once: true,
      });
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = url;
      frame.append(image);
    })
    .catch(() => {
      // The square stays as a placeholder; the card still names the post.
    });
  return frame;
}
