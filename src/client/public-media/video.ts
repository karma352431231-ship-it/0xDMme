import { t } from '../../shared/i18n/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { retainedPublicMedia } from './retained.ts';
import type { RetainedPublicMedia } from './retained.ts';

/** Retain visited players within the shared RAM budget. Playback stays user initiated. */
export function mountPublicVideo(
  slot: HTMLElement,
  media: PublicPostMedia,
  options: {
    signal: AbortSignal;
    load: (thumbnail: boolean, signal: AbortSignal) => Promise<Blob>;
  },
): () => void {
  const video = document.createElement('video'),
    caption = document.createElement('span'),
    retry = document.createElement('button');
  slot.classList.add('community-public-video');
  slot.style.setProperty(
    '--video-ratio',
    String(media.result.width / media.result.height),
  );
  video.className = 'community-media-preview';
  video.controls = true;
  video.preload = 'auto';
  video.width = media.result.width;
  video.height = media.result.height;
  video.setAttribute('playsinline', '');
  caption.setAttribute('role', 'status');
  retry.type = 'button';
  retry.textContent = t('Try loading video');
  retry.hidden = true;
  slot.append(video, fullscreenButton(video), caption, retry);
  let visible = false,
    stopped = false,
    current: AbortController | null = null,
    resultUrl: string | null = null,
    posterUrl: string | null = null,
    retained: RetainedPublicMedia | null = null,
    position = 0;
  function unload(): void {
    retained?.release();
    retained = null;
    current?.abort();
    current = null;
    if (resultUrl && Number.isFinite(video.currentTime))
      position = video.currentTime;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    posterUrl = null;
    video.removeAttribute('poster');
  }
  function usable(signal: AbortSignal): boolean {
    return !signal.aborted && !stopped;
  }
  function loadPoster(signal: AbortSignal): void {
    if (!posterUrl)
      void options
        .load(true, signal)
        .then((blob) => {
          if (!usable(signal)) return;
          posterUrl = URL.createObjectURL(blob);
          video.poster = posterUrl;
        })
        .catch(() => {
          /* The full player remains usable without its poster. */
        });
  }
  async function load(): Promise<void> {
    if (stopped || !visible || current || resultUrl) return;
    const controller = new AbortController();
    current = controller;
    const signal = AbortSignal.any([options.signal, controller.signal]);
    caption.textContent = t('Loading video…');
    retry.hidden = true;
    loadPoster(signal);
    try {
      const blob = await options.load(false, signal);
      if (!usable(signal)) return;
      resultUrl = URL.createObjectURL(blob);
      video.src = resultUrl;
      video.load();
      retained = retainedPublicMedia.keep({
        bytes: blob.size + media.result.thumbnailBytes,
        visible,
        dispose: unload,
      });
    } catch {
      if (usable(signal)) {
        caption.textContent = t('Video unavailable. Try again.');
        retry.hidden = false;
      }
    } finally {
      if (current === controller) current = null;
    }
  }
  video.addEventListener('loadedmetadata', () => {
    if (position > 0 && position < video.duration) video.currentTime = position;
  });
  video.addEventListener('loadeddata', () => {
    caption.textContent = '';
  });
  retry.addEventListener('click', () => {
    void load();
  });
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      retained?.visibility(visible);
      if (visible) void load();
      else {
        current?.abort();
        current = null;
        video.pause();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(slot);
  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unload();
    options.signal.removeEventListener('abort', cleanup);
  };
  options.signal.addEventListener('abort', cleanup, { once: true });
  if (options.signal.aborted) cleanup();
  return cleanup;
}

/** iOS Safari only offers full screen on the video element itself. */
type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

/**
 * Phones shrink the native controls and hide their full-screen choice in an
 * overflow menu or drop it, so touch screens get an explicit button (16/10/2026).
 */
function fullscreenButton(video: FullscreenVideo): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'public-video-fullscreen';
  button.setAttribute('aria-label', t('video.fullscreen'));
  button.title = t('video.fullscreen');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const corners = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  corners.setAttribute('d', 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5');
  svg.append(corners);
  button.append(svg);
  button.addEventListener('click', () => {
    if (typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(() => video.webkitEnterFullscreen?.());
      return;
    }
    video.webkitEnterFullscreen?.();
  });
  return button;
}
