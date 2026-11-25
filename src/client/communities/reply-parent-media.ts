import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { stickerReferences } from '../../shared/stickers/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls, renderGif } from '../gif-search/index.ts';
import { openImageViewer } from '../image-viewer/index.ts';
import { publicPostMediaBlob } from '../public-media/index.ts';
import { stickerFigure, stickerViewSource } from '../stickers/index.ts';

interface StripInput {
  signal: AbortSignal;
  privacy?: ExternalMediaConsent | undefined;
  /** Shows the whole answered post (a video plays there). */
  expand: () => void;
}

/**
 * Under "Replying to" (owner, 25/11/2026): a row of small squares, the size
 * of Activity thumbnails, for every picture, video, GIF and sticker of the
 * answered post. A tap enlarges it like a tap on the post in the timeline.
 * GIFs appear only once external media is allowed; before that the post
 * preview keeps its own "Show GIF" choice. Everything read here, including
 * object URLs, lives as long as `signal` (the reply sheet).
 */
export function replyParentMedia(
  parent: CommunityPost,
  input: StripInput,
): HTMLElement | null {
  const strip = document.createElement('div');
  strip.className = 'reply-parent-media';
  for (const media of parent.media ?? [])
    strip.append(pictureThumb(media, input));
  if (input.privacy?.permitted('gifs'))
    for (const url of gifUrls(parent.text))
      strip.append(gifThumb(url, input.signal));
  for (const sticker of stickerReferences(parent.text))
    strip.append(stickerThumb(sticker, input));
  return strip.childElementCount ? strip : null;
}

/** A square that acts as a button around content that may hold its own. */
function thumb(
  label: string,
  open: (square: HTMLElement) => void,
): HTMLElement {
  const square = document.createElement('span');
  square.className = 'reply-parent-thumb';
  square.tabIndex = 0;
  square.setAttribute('role', 'button');
  square.setAttribute('aria-label', label);
  square.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    open(square);
  });
  square.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open(square);
  });
  return square;
}

function objectUrl(blob: Blob, signal: AbortSignal): string {
  const url = URL.createObjectURL(blob);
  signal.addEventListener('abort', () => URL.revokeObjectURL(url), {
    once: true,
  });
  return url;
}

function pictureThumb(media: PublicPostMedia, input: StripInput): HTMLElement {
  const { signal } = input;
  let full: Promise<string> | null = null;
  const square = thumb(
    media.result.kind === 'video' ? t('Play video') : t('Open photo'),
    (trigger) => {
      if (media.result.kind === 'video') return input.expand();
      full ??= publicPostMediaBlob(media, false, signal).then((blob) =>
        objectUrl(blob, signal),
      );
      full.then(
        (url) => {
          if (!signal.aborted)
            openImageViewer({ url, alt: '', trigger, signal });
        },
        () => {
          full = null;
          trigger.title = t('Public media unavailable.');
        },
      );
    },
  );
  void publicPostMediaBlob(media, true, signal)
    .then((blob) => {
      if (signal.aborted) return;
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = objectUrl(blob, signal);
      square.append(image);
    })
    .catch(() => {
      // The square stays as a placeholder; the post preview still opens.
    });
  return square;
}

function gifThumb(url: string, signal: AbortSignal): HTMLElement {
  const square = thumb('GIF', (trigger) =>
    openImageViewer({
      url,
      alt: 'GIF',
      trigger,
      signal,
      clip: url.endsWith('.mp4'),
      action: false,
    }),
  );
  renderGif(square, url);
  return square;
}

function stickerThumb(
  sticker: Parameters<typeof stickerFigure>[0],
  input: StripInput,
): HTMLElement {
  const figure = stickerFigure(sticker, {
    privacy: input.privacy,
    signal: input.signal,
  });
  const square = thumb(t('Sticker'), (trigger) => {
    const source = stickerViewSource(figure);
    if (!source) return;
    if (source.owned)
      input.signal.addEventListener(
        'abort',
        () => URL.revokeObjectURL(source.url),
        { once: true },
      );
    openImageViewer({
      url: source.url,
      alt: t('Sticker'),
      trigger,
      signal: input.signal,
      action: false,
    });
  });
  square.classList.add('is-sticker');
  square.append(figure);
  return square;
}
