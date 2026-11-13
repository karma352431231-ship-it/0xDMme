import { t } from '../../shared/i18n/index.ts';
import { retainedMedia } from '../media-retention/index.ts';
import type { RetainedMedia } from '../media-retention/index.ts';

interface VideoSize {
  width: number;
  height: number;
}
interface InlineVideoSource {
  blob: Blob;
  decoded?: (video: HTMLVideoElement) => void;
}
interface InlineVideoOptions {
  signal: AbortSignal;
  load: (signal: AbortSignal) => Promise<InlineVideoSource>;
  size?: VideoSize;
  label?: string;
  poster?: {
    bytes: number;
    load: (signal: AbortSignal) => Promise<Blob | null>;
  };
  deferSource?: boolean;
  previewFrame?: (video: HTMLVideoElement) => Promise<void>;
  downloadFallback?: (url: string | null) => void;
  stage?: (video: HTMLVideoElement, requestPlay: () => void) => HTMLElement;
  play?: () => void;
}

/** The feed and chat share source loading and viewport lifecycle. */
export function mountInlineVideo(
  slot: HTMLElement,
  options: InlineVideoOptions,
): () => void {
  const video = document.createElement('video'),
    caption = document.createElement('span'),
    retry = document.createElement('button');
  slot.classList.add('inline-video');
  const { size, poster } = options;
  setRatio(slot, size ?? { width: 16, height: 9 });
  video.className = 'community-media-preview';
  video.controls = true;
  video.preload = 'auto';
  if (size) {
    video.width = size.width;
    video.height = size.height;
  }
  if (options.label) video.setAttribute('aria-label', options.label);
  video.setAttribute('playsinline', '');
  if (options.play) video.addEventListener('play', options.play);
  caption.setAttribute('role', 'status');
  retry.type = 'button';
  retry.textContent = t('Try loading video');
  retry.hidden = true;
  slot.append(options.stage?.(video, requestPlay) ?? video, caption, retry);
  let visible = false,
    stopped = false,
    current: AbortController | null = null,
    resultUrl: string | null = null,
    posterUrl: string | null = null,
    retained: RetainedMedia | null = null,
    decoded: InlineVideoSource['decoded'],
    position = 0;
  let posterWork: AbortController | null = null;
  let captured = false;
  let playRequested = false;
  function unload(): void {
    retained?.release();
    retained = null;
    decoded = undefined;
    current?.abort();
    current = null;
    posterWork?.abort();
    posterWork = null;
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
    options.downloadFallback?.(null);
  }
  function usable(signal: AbortSignal): boolean {
    return !signal.aborted && !stopped;
  }
  function loadPoster(signal: AbortSignal): void {
    if (poster && !posterUrl)
      void poster
        .load(signal)
        .then((blob) => {
          if (!usable(signal) || !blob) return;
          posterUrl = URL.createObjectURL(blob);
          video.poster = posterUrl;
        })
        .catch(() => {
          /* The full player remains usable without its poster. */
        });
  }
  async function prepareVisible(): Promise<void> {
    if (!options.deferSource || !poster) {
      await load();
      return;
    }
    if (stopped || resultUrl || posterUrl || posterWork || current) return;
    await preparePoster();
  }
  async function preparePoster(): Promise<void> {
    const controller = new AbortController();
    posterWork = controller;
    const signal = AbortSignal.any([options.signal, controller.signal]);
    try {
      const blob = await poster!.load(signal);
      if (!usable(signal)) return;
      if (!blob) {
        await load();
        return;
      }
      posterUrl = URL.createObjectURL(blob);
      video.poster = posterUrl;
      caption.textContent = '';
      retry.textContent = t('Play video');
      retry.hidden = false;
      // The poster is a small preview: the full source follows quietly and
      // its first frame replaces it at full quality (owner, 13/11/2026).
      void loadQuietly();
    } catch {
      if (usable(signal)) {
        caption.textContent = t('Video unavailable. Try again.');
        retry.hidden = false;
      }
    } finally {
      if (posterWork === controller) posterWork = null;
    }
  }
  function announceLoading(): void {
    caption.textContent = t('Loading video…');
    retry.hidden = true;
  }
  async function load(): Promise<void> {
    const controller = beginLoad();
    if (!controller) return;
    announceLoading();
    await fetchSource(controller);
  }
  /** Upgrades a shown poster without a loading notice. */
  async function loadQuietly(): Promise<void> {
    const controller = beginLoad();
    if (controller) await fetchSource(controller);
  }
  function beginLoad(): AbortController | null {
    if (stopped || !visible || current || resultUrl) return null;
    current = new AbortController();
    return current;
  }
  async function fetchSource(controller: AbortController): Promise<void> {
    const signal = AbortSignal.any([options.signal, controller.signal]);
    if (!options.deferSource) loadPoster(signal);
    try {
      const source = await options.load(signal);
      if (usable(signal)) present(source);
    } catch {
      if (usable(signal)) {
        caption.textContent = t('Video unavailable. Try again.');
        retry.hidden = false;
      }
    } finally {
      if (current === controller) current = null;
    }
  }
  function present(source: InlineVideoSource): void {
    const { blob } = source;
    resultUrl = URL.createObjectURL(blob);
    retained = retainedMedia.keep({
      bytes: blob.size + (poster?.bytes ?? 0),
      visible,
      dispose: unload,
    });
    if (!blob.type.startsWith('video/')) {
      unavailable();
      return;
    }
    decoded = source.decoded;
    video.src = resultUrl;
    video.load();
    if (playRequested) startPlayback();
  }
  video.addEventListener('loadedmetadata', () => {
    if (!size)
      setRatio(slot, { width: video.videoWidth, height: video.videoHeight });
    if (position > 0 && position < video.duration) video.currentTime = position;
    else if (!poster && resultUrl) showFirstFrame(video);
  });
  function firstData(): void {
    if (!resultUrl || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return;
    caption.textContent = '';
    if (posterUrl && video.hasAttribute('poster')) {
      // The decoded source now shows its own first frame at full quality.
      video.removeAttribute('poster');
      retry.hidden = true;
      showFirstFrame(video);
    }
    const notify = decoded;
    decoded = undefined;
    notify?.(video);
    if (!captured && options.previewFrame) {
      captured = true;
      void options.previewFrame(video).catch(() => {});
    }
  }
  video.addEventListener('loadeddata', firstData);
  video.addEventListener('seeked', firstData);
  function unavailable(): void {
    if (!resultUrl) return;
    caption.textContent = t('Video unavailable. Try again.');
    options.downloadFallback?.(resultUrl);
  }
  video.addEventListener('error', unavailable);
  function startPlayback(): void {
    playRequested = false;
    void video.play().catch(() => {
      if (!stopped) retry.hidden = false;
    });
  }
  function requestPlay(): void {
    playRequested = true;
    if (resultUrl) startPlayback();
    else void load();
  }
  retry.addEventListener('click', requestPlay);
  video.addEventListener('click', () => {
    if (options.deferSource && !resultUrl) requestPlay();
  });
  const observer = new IntersectionObserver(
    (entries) => {
      visible =
        entries.some((entry) => entry.isIntersecting) || isFullscreen(video);
      retained?.visibility(visible);
      if (visible) void prepareVisible();
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

function isFullscreen(
  video: HTMLVideoElement & { webkitDisplayingFullscreen?: boolean },
): boolean {
  return !!(
    video.ownerDocument?.fullscreenElement?.contains(video) ||
    video.webkitDisplayingFullscreen
  );
}

function setRatio(slot: HTMLElement, size: VideoSize): void {
  if (size.width > 0 && size.height > 0)
    slot.style.setProperty('--video-ratio', String(size.width / size.height));
}

/** Seeking clears the browser's poster flag even at time zero. The decoded
 * start frame replaces the WebView's generic cover without starting playback. */
function showFirstFrame(video: HTMLVideoElement): void {
  if (video.paused && !video.seeking && video.currentTime === 0)
    video.currentTime = 0;
}
