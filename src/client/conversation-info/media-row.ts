import { t } from '../../shared/i18n/index.ts';
import { infoRow } from './actions.ts';
import type { GallerySummary } from '../media-gallery/index.ts';

export interface MediaInfo {
  count: number;
  summary?: GallerySummary;
  open: () => void;
}
/** The panel owns its counter subscription and releases it on close. */
export function mediaInfoRow(input: {
  media: MediaInfo;
  close: () => void;
  signal: AbortSignal;
}): HTMLElement {
  const { media, close, signal } = input;
  const row = infoRow({
    label: t('Media, links and docs'),
    icon: 'image',
    end: '…',
    perform: () => {
      close();
      media.open();
    },
  });
  const update = () => {
    const count = media.summary ? media.summary.count() : media.count;
    row.querySelector('.info-row-end')!.textContent =
      count === null ? '…' : String(count);
  };
  if (media.summary) {
    const stop = media.summary.subscribe(update);
    signal.addEventListener('abort', stop, { once: true });
  }
  update();
  return row;
}
