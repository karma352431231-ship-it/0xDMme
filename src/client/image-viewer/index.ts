import { t } from '../../shared/i18n/index.ts';
import { ZoomSurface } from './zoom.ts';
import type { ZoomGesture, ZoomPoint } from './zoom.ts';

export type { ZoomGesture } from './zoom.ts';
export { pinchOpensViewer } from './pinch-open.ts';

const svgNs = 'http://www.w3.org/2000/svg';
function closeIcon(): SVGSVGElement {
  const icon = document.createElementNS(svgNs, 'svg'),
    path = document.createElementNS(svgNs, 'path');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  icon.append(path);
  return icon;
}

/** Follows the pointers on the viewer: two fingers zoom, one finger or the
 * mouse moves a zoomed image. */
function trackPointers(frame: HTMLElement, surface: ZoomSurface): void {
  const down = new Map<number, ZoomPoint>();
  const publish = () => surface.track([...down.values()]);
  frame.addEventListener('pointerdown', (event) => {
    down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    publish();
  });
  frame.addEventListener('pointermove', (event) => {
    if (!down.has(event.pointerId)) return;
    down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    publish();
  });
  for (const name of ['pointerup', 'pointercancel'] as const)
    frame.addEventListener(name, (event) => {
      down.delete(event.pointerId);
      publish();
    });
}

/** Only the enlarged image over the page: fingers zoom and move it, a tap on it
 * toggles zoom, a tap anywhere else or the X closes it and returns to where the
 * user was. Reuses the caller's image URL and lifetime; viewing never fetches
 * bytes. `gesture` receives the zoom when fingers that opened it keep moving. */
export function openImageViewer(input: {
  url: string;
  alt: string;
  trigger: HTMLButtonElement;
  signal: AbortSignal;
  gesture?: (gesture: ZoomGesture) => void;
}): () => void {
  const dialog = document.createElement('dialog'),
    frame = document.createElement('div'),
    image = document.createElement('img'),
    close = document.createElement('button');
  dialog.className = 'public-image-viewer';
  dialog.setAttribute('aria-label', t('Enlarged image'));
  frame.className = 'public-image-frame';
  image.src = input.url;
  image.alt = input.alt;
  close.type = 'button';
  close.className = 'public-image-close';
  close.setAttribute('aria-label', t('Close'));
  close.append(closeIcon());
  const surface = new ZoomSurface({
    frame,
    image,
    zoomed: (on) => dialog.classList.toggle('zoomed', on),
  });
  trackPointers(frame, surface);
  input.gesture?.(surface);
  const toggle = (event: Event): void => {
    event.stopPropagation();
    if (surface.takeMoved()) return;
    // A keyboard or scripted click has no position: zoom around the center.
    const pointer = event as MouseEvent;
    const at =
      pointer.detail > 0
        ? { x: pointer.clientX, y: pointer.clientY }
        : undefined;
    surface.toggle(at);
  };
  const stop = (): void => {
    input.signal.removeEventListener('abort', stop);
    dialog.remove();
    if (!input.signal.aborted && input.trigger.isConnected)
      input.trigger.focus({ preventScroll: true });
  };
  image.addEventListener('click', toggle);
  close.addEventListener('click', stop);
  dialog.addEventListener('close', stop);
  dialog.addEventListener('cancel', stop);
  // Any tap outside the image itself closes, including around a zoomed one.
  dialog.addEventListener('click', (event) => {
    if (!surface.takeMoved() && event.target !== image) stop();
  });
  input.signal.addEventListener('abort', stop, { once: true });
  frame.append(image);
  dialog.append(frame, close);
  document.body.append(dialog);
  try {
    input.signal.throwIfAborted();
    dialog.showModal();
  } catch (error: unknown) {
    stop();
    throw error;
  }
  return stop;
}
