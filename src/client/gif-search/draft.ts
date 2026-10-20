import { t } from '../../shared/i18n/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls, withoutGifLinks } from './links.ts';
import { showExternalGif } from './presentation.ts';

/** GIF links stay in the draft text; each removable preview follows the same
 * external-media consent as the published post. Typing does not reload clips. */
export function mountGifDraft(input: {
  host: HTMLElement;
  text: HTMLInputElement | HTMLTextAreaElement;
  privacy: ExternalMediaConsent;
  signal: AbortSignal;
}): void {
  const area = document.createElement('div');
  area.className = 'media-picker-previews gif-draft-previews';
  input.host.append(area);
  let shown = '',
    release: (() => void)[] = [];
  function clear(): void {
    for (const stop of release) stop();
    release = [];
    area.replaceChildren();
  }
  function render(): void {
    const urls = gifUrls(input.text.value),
      signature = urls.join('\n');
    if (signature === shown) return;
    shown = signature;
    clear();
    for (const [index, url] of urls.entries()) {
      const tile = document.createElement('div'),
        close = document.createElement('button');
      tile.className = 'media-picker-tile';
      area.append(tile);
      release.push(
        showExternalGif(tile, url, {
          privacy: input.privacy,
          signal: input.signal,
        }),
      );
      close.type = 'button';
      close.className = 'media-picker-remove';
      close.textContent = '×';
      close.setAttribute('aria-label', t('Remove {0}', [`GIF ${index + 1}`]));
      close.addEventListener('click', () => {
        input.text.value = withoutGifLinks(input.text.value, [url]);
        input.text.dispatchEvent(new Event('input', { bubbles: true }));
      });
      tile.append(close);
    }
    area.hidden = urls.length === 0;
  }
  area.hidden = true;
  input.text.addEventListener('input', render, { signal: input.signal });
  input.signal.addEventListener(
    'abort',
    () => {
      clear();
      area.remove();
    },
    { once: true },
  );
  render();
}
