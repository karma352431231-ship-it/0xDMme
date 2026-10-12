import type { PublicPostMedia } from '../../shared/public-media/index.ts';

/** Keep full video bytes only while the player is near the viewport. Playback stays user initiated. */
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
  retry.textContent = 'Tentar carregar vídeo';
  retry.hidden = true;
  slot.append(video, caption, retry);
  let visible = false,
    stopped = false,
    current: AbortController | null = null,
    resultUrl: string | null = null,
    posterUrl: string | null = null,
    position = 0;
  function unload(): void {
    current?.abort();
    current = null;
    if (resultUrl && Number.isFinite(video.currentTime))
      position = video.currentTime;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
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
    caption.textContent = 'Carregando vídeo…';
    retry.hidden = true;
    loadPoster(signal);
    try {
      const blob = await options.load(false, signal);
      if (!usable(signal)) return;
      resultUrl = URL.createObjectURL(blob);
      video.src = resultUrl;
      video.load();
    } catch {
      if (usable(signal)) {
        caption.textContent = 'Vídeo indisponível. Tente novamente.';
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
      if (visible) void load();
      else unload();
    },
    { rootMargin: '200px' },
  );
  observer.observe(slot);
  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unload();
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    options.signal.removeEventListener('abort', cleanup);
  };
  options.signal.addEventListener('abort', cleanup, { once: true });
  if (options.signal.aborted) cleanup();
  return cleanup;
}
