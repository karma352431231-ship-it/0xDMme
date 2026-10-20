import { t } from '../../shared/i18n/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { openImageViewer } from '../image-viewer/index.ts';
import { retainedPublicMedia } from './retained.ts';
import type { RetainedPublicMedia } from './retained.ts';

/** Load near the screen and retain visited media until cleanup or memory pressure. */
export function mountPublicPicture(
  slot: HTMLElement,
  media: PublicPostMedia,
  options: {
    signal: AbortSignal;
    load: (signal: AbortSignal) => Promise<Blob>;
  },
): () => void {
  slot.classList.add('community-public-picture');
  slot.style.setProperty(
    '--picture-ratio',
    String(media.result.width / media.result.height),
  );
  const button = document.createElement('button'),
    image = document.createElement('img'),
    caption = document.createElement('span'),
    retry = document.createElement('button');
  button.type = retry.type = 'button';
  button.className = 'public-picture-open';
  button.setAttribute('aria-label', t('Zoom in on image'));
  image.className = 'community-media-preview';
  image.alt =
    media.result.kind === 'gif'
      ? t('Approved public GIF')
      : t('Approved public photo');
  image.width = media.result.width;
  image.height = media.result.height;
  image.hidden = true;
  image.decoding = 'async';
  caption.setAttribute('role', 'status');
  retry.textContent = t('Try loading image');
  retry.className = 'public-picture-retry';
  retry.hidden = true;
  button.append(image);
  slot.append(button, caption, retry);
  let visible = false,
    stopped = false,
    pending: AbortController | null = null,
    url: string | null = null,
    retained: RetainedPublicMedia | null = null,
    closeViewer: (() => void) | null = null;
  function unload(): void {
    retained?.release();
    retained = null;
    pending?.abort();
    pending = null;
    closeViewer?.();
    closeViewer = null;
    image.hidden = true;
    image.removeAttribute('src');
    if (url) URL.revokeObjectURL(url);
    url = null;
  }
  function canLoad(): boolean {
    return !stopped && visible && !pending && !url;
  }
  function usable(signal: AbortSignal): boolean {
    return !signal.aborted && !stopped && visible;
  }
  async function load(): Promise<void> {
    if (!canLoad()) return;
    const attempt = new AbortController();
    pending = attempt;
    const signal = AbortSignal.any([options.signal, attempt.signal]);
    caption.textContent = t('Loading image…');
    retry.hidden = true;
    try {
      const blob = await options.load(signal);
      if (!usable(signal)) return;
      url = URL.createObjectURL(blob);
      image.src = url;
      image.hidden = false;
      caption.textContent = '';
      retained = retainedPublicMedia.keep({
        bytes: blob.size,
        visible,
        dispose: unload,
      });
    } catch {
      if (usable(signal)) {
        caption.textContent = t('Image unavailable.');
        retry.hidden = false;
      }
    } finally {
      if (pending === attempt) pending = null;
    }
  }
  retry.addEventListener('click', () => void load());
  button.addEventListener('click', () => {
    if (!url || stopped) return;
    closeViewer?.();
    try {
      closeViewer = openImageViewer({
        url,
        alt: image.alt,
        trigger: button,
        signal: options.signal,
      });
    } catch {
      caption.textContent = t('Could not open the enlarged image.');
    }
  });
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            retained?.visibility(visible);
            if (visible) void load();
            else {
              pending?.abort();
              pending = null;
              closeViewer?.();
              closeViewer = null;
            }
          },
          { rootMargin: '200px' },
        );
  const stop = (): void => {
    stopped = true;
    observer?.disconnect();
    unload();
    options.signal.removeEventListener('abort', stop);
  };
  options.signal.addEventListener('abort', stop, { once: true });
  if (options.signal.aborted) {
    stop();
    return stop;
  }
  if (observer) observer.observe(slot);
  else {
    visible = true;
    void load();
  }
  return stop;
}
