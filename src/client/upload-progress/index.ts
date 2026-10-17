import { t } from '../../shared/i18n/index.ts';

const svgNs = 'http://www.w3.org/2000/svg';
const radius = 15;
const circumference = 2 * Math.PI * radius;

export interface UploadRing {
  readonly element: HTMLElement;
  /** A fraction from 0 to 1 fills the ring; null spins while the server processes. */
  set(fraction: number | null): void;
}

/**
 * Upload progress shared by posts and chats (16/10/2026): a ring that fills
 * while the file is sent and spins while it is processed, with the percent
 * inside. It replaces the raw status sentences; screen readers get the text.
 */
export function uploadRing(): UploadRing {
  const element = document.createElement('span');
  element.className = 'upload-ring';
  element.setAttribute('role', 'progressbar');
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(svgNs, 'circle'),
    bar = document.createElementNS(svgNs, 'circle');
  for (const circle of [track, bar]) {
    circle.setAttribute('cx', '18');
    circle.setAttribute('cy', '18');
    circle.setAttribute('r', String(radius));
  }
  track.setAttribute('class', 'upload-ring-track');
  bar.setAttribute('class', 'upload-ring-bar');
  bar.setAttribute('stroke-dasharray', String(circumference));
  svg.append(track, bar);
  const value = document.createElement('span');
  value.className = 'upload-ring-value';
  element.append(svg, value);
  const set = (fraction: number | null): void => {
    if (fraction === null) {
      element.dataset['state'] = 'processing';
      element.removeAttribute('aria-valuenow');
      element.setAttribute('aria-label', t('upload.processing'));
      value.textContent = '';
      bar.setAttribute('stroke-dashoffset', String(circumference * 0.72));
      return;
    }
    const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    element.dataset['state'] = 'sending';
    element.setAttribute('aria-valuenow', String(percent));
    element.setAttribute('aria-label', t('upload.sending {0}', [percent]));
    value.textContent = t('upload.percent {0}', [percent]);
    bar.setAttribute(
      'stroke-dashoffset',
      String(circumference * (1 - percent / 100)),
    );
  };
  set(0);
  return { element, set };
}

/** Ring plus a short label, for status strips such as the chat's. */
export function uploadStatus(): UploadRing {
  const element = document.createElement('span');
  element.className = 'upload-status';
  const ring = uploadRing(),
    label = document.createElement('span');
  element.append(ring.element, label);
  return {
    element,
    set(fraction) {
      ring.set(fraction);
      label.textContent =
        fraction === null ? t('upload.processing') : t('upload.sending-file');
    },
  };
}
