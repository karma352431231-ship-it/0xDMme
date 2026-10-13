import { showExternalVideos } from '../external-video/index.ts';
import { gifUrls, showExternalGif } from '../gif-search/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
/** Approved external media is still loaded only under the reader's own consent. */
export function showPostExternalMedia(
  host: HTMLElement,
  text: string,
  options: { privacy: ExternalMediaConsent; signal: AbortSignal },
): () => void {
  const stops = [showExternalVideos(host, text, options)];
  const urls = gifUrls(text);
  for (const url of urls.slice(0, 3)) {
    const slot = document.createElement('div');
    slot.className = 'community-external-gif';
    host.append(slot);
    const stop = showExternalGif(slot, url, options);
    stops.push(() => {
      stop();
      slot.remove();
    });
  }
  return () => {
    for (const stop of stops) stop();
  };
}
