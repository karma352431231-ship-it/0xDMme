import { t } from '../../shared/i18n/index.ts';
import { externalMediaGate } from '../external-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifMessageUrl, gifUrls, withoutGifLinks } from './links.ts';
interface GifDisplay {
  privacy: ExternalMediaConsent;
  signal: AbortSignal;
}
/** Text first, clips underneath; unknown URLs are preserved in the text. */
export function showGifText(
  host: HTMLElement,
  text: string,
  options: GifDisplay & {
    renderText: (host: HTMLElement, text: string) => void;
  },
): () => void {
  const urls = gifUrls(text),
    body = withoutGifLinks(text, urls);
  host.replaceChildren();
  options.renderText(host, body);
  if (urls.length && !body) host.classList.add('gif-only');
  const stops = urls.map((url) => showExternalGif(host, url, options));
  return () => {
    for (const stop of stops) stop();
  };
}
/** A single fallback link remains visible only before consent or on failure/revocation. */
export function showExternalGif(
  host: HTMLElement,
  url: string,
  options: GifDisplay,
): () => void {
  if (!gifMessageUrl(url) || options.signal.aborted) return () => undefined;
  const field = document.createElement('div'),
    link = document.createElement('a');
  field.className = 'external-gif';
  link.className = 'external-gif-link';
  link.href = url;
  link.textContent = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  field.append(link);
  host.append(field);
  const stop = externalMediaGate(field, {
    consent: options.privacy,
    kind: 'gifs',
    signal: options.signal,
    label: t('Mostrar GIF'),
    automatic: true,
    render: (target) => renderGif(target, url),
  });
  return () => {
    stop();
    field.remove();
  };
}
/** No provider caption or URL over an allowed clip. Failure restores the fallback. */
export function renderGif(host: HTMLElement, url: string): void {
  if (!gifMessageUrl(url)) return;
  host.classList.add('chat-gif');
  const media = gifElement(url);
  media.addEventListener(
    'error',
    () => {
      if (!host.isConnected) return;
      const status = document.createElement('small');
      status.textContent = t('GIF indisponível agora.');
      status.setAttribute('role', 'status');
      host.replaceChildren(status);
    },
    { once: true },
  );
  host.replaceChildren(media);
}
function gifElement(url: string): HTMLVideoElement | HTMLImageElement {
  if (url.endsWith('.mp4')) {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', 'GIF');
    return video;
  }
  const image = document.createElement('img');
  image.src = url;
  image.alt = 'GIF';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  return image;
}
