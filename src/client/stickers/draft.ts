import { t } from '../../shared/i18n/index.ts';
import {
  stickerReferences,
  withoutStickerLinks,
} from '../../shared/stickers/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { stickerFigure } from './display.ts';

/** Sticker links stay in a post or reply draft; each shows a removable preview. */
export function mountStickerDraft(input: {
  host: HTMLElement;
  text: HTMLInputElement | HTMLTextAreaElement;
  privacy?: ExternalMediaConsent | undefined;
  signal: AbortSignal;
}): void {
  const area = document.createElement('div');
  area.className = 'media-picker-previews sticker-draft-previews';
  area.hidden = true;
  input.host.append(area);
  let shown = '',
    drawn = new AbortController();
  function render(): void {
    const stickers = stickerReferences(input.text.value),
      signature = stickers.map((sticker) => sticker.link).join('\n');
    if (signature === shown) return;
    shown = signature;
    drawn.abort();
    drawn = new AbortController();
    area.replaceChildren();
    for (const [index, sticker] of stickers.entries()) {
      const tile = document.createElement('div'),
        close = document.createElement('button');
      tile.className = 'media-picker-tile sticker-draft-tile';
      tile.append(
        stickerFigure(sticker, {
          privacy: input.privacy,
          signal: AbortSignal.any([input.signal, drawn.signal]),
        }),
      );
      close.type = 'button';
      close.className = 'media-picker-remove';
      close.textContent = '×';
      close.setAttribute(
        'aria-label',
        t('Remove {0}', [`${t('Sticker')} ${index + 1}`]),
      );
      close.addEventListener('click', () => {
        input.text.value = withoutStickerLinks(input.text.value, [sticker]);
        input.text.dispatchEvent(new Event('input', { bubbles: true }));
      });
      tile.append(close);
      area.append(tile);
    }
    area.hidden = stickers.length === 0;
  }
  input.text.addEventListener('input', render, { signal: input.signal });
  input.signal.addEventListener(
    'abort',
    () => {
      drawn.abort();
      area.remove();
    },
    { once: true },
  );
  render();
}
