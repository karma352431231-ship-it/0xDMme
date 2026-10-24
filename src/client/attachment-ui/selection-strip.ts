import { t } from '../../shared/i18n/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';

/**
 * Chosen files in the composer (24/10/2026): one tile per file side by side,
 * only the picture (or a file mark), a remove X on hover, and one ring for how
 * much of the send limit the files use together. Size and the metadata notice
 * stay in each tile's tooltip. Presentation only: AttachmentUi owns the
 * selection, its bytes and the object URLs passed in here.
 */
export function renderSelectionStrip(input: {
  area: Element;
  items: readonly AttachmentSelection[];
  url: (item: AttachmentSelection) => string | null;
  remove: (item: AttachmentSelection) => void;
}): void {
  const strip = document.createElement('div');
  strip.className = 'attachment-strip';
  for (const item of input.items)
    strip.append(tile(item, input.url(item), () => input.remove(item)));
  input.area.replaceChildren(strip);
}

function tile(
  item: AttachmentSelection,
  url: string | null,
  remove: () => void,
): HTMLElement {
  const figure = document.createElement('figure'),
    close = document.createElement('button');
  figure.className = 'attachment-tile';
  figure.title = `${item.name} · ${t('attachment.card-detail {0}', [megabytes(item.bytes.length)])}`;
  figure.append(tilePreview(item, url));
  close.type = 'button';
  close.className = 'attachment-tile-remove';
  close.setAttribute('aria-label', t('Remove {0}', [item.name]));
  close.title = t('Remove {0}', [item.name]);
  close.append(closeIcon());
  close.addEventListener('click', remove);
  figure.append(close);
  return figure;
}

function tilePreview(item: AttachmentSelection, url: string | null): Element {
  if (url && item.image) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = t('Local preview of the original image');
    return image;
  }
  if (url && item.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    // The first frame stands in for a poster; nothing plays in the composer.
    video.src = `${url}#t=0.1`;
    video.setAttribute('aria-label', item.name);
    return video;
  }
  const file = document.createElement('span'),
    extension = document.createElement('small');
  file.className = 'attachment-tile-file';
  extension.textContent = (item.name.split('.').at(-1) ?? '')
    .slice(0, 4)
    .toUpperCase();
  file.append(fileIcon(), extension);
  return file;
}

/** The ring fills with the files' total size against the send limit. */
export function renderUsageRing(
  ring: HTMLElement,
  input: { used: number; maximum: number },
): void {
  const fraction = Math.min(1, input.used / input.maximum),
    label = t('{0} MB of {1} MB', [
      megabytes(input.used),
      megabytes(input.maximum, 0),
    ]);
  ring.style.setProperty('--usage', String(fraction));
  ring.dataset['full'] = String(fraction >= 0.9);
  ring.setAttribute('aria-label', label);
  ring.title = label;
  if (!ring.firstChild) ring.append(ringIcon());
}

function megabytes(bytes: number, digits = 2): string {
  return (bytes / 1_000_000).toFixed(digits);
}

const svgNs = 'http://www.w3.org/2000/svg';
function svg(className: string, paths: readonly string[]): SVGSVGElement {
  const icon = document.createElementNS(svgNs, 'svg');
  icon.setAttribute('class', className);
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', d);
    icon.append(path);
  }
  return icon;
}
function closeIcon(): SVGSVGElement {
  return svg('attachment-tile-x', ['M6 6l12 12', 'M18 6L6 18']);
}
function fileIcon(): SVGSVGElement {
  return svg('attachment-tile-icon', [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5',
  ]);
}
function ringIcon(): SVGSVGElement {
  const icon = document.createElementNS(svgNs, 'svg');
  icon.setAttribute('viewBox', '0 0 36 36');
  icon.setAttribute('aria-hidden', 'true');
  for (const name of ['attachment-ring-track', 'attachment-ring-fill']) {
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('class', name);
    circle.setAttribute('cx', '18');
    circle.setAttribute('cy', '18');
    circle.setAttribute('r', '15');
    circle.setAttribute('pathLength', '100');
    icon.append(circle);
  }
  return icon;
}
