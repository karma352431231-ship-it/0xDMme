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

/**
 * One extra action under enlarged public images, set by the signed-in account
 * (24/11/2026: "Make sticker"). The viewer closes before it runs.
 */
export interface ImageViewerAction {
  label: string;
  run: (url: string) => void;
}
let viewerAction: ImageViewerAction | null = null;
export function setImageViewerAction(action: ImageViewerAction | null): void {
  viewerAction = action;
}
function actionButton(url: string, stop: () => void): HTMLButtonElement | null {
  const action = viewerAction;
  if (!action) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'public-image-action';
  button.textContent = action.label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    stop();
    action.run(url);
  });
  return button;
}

function picture(input: { url: string; alt: string }): HTMLImageElement {
  const image = document.createElement('img');
  image.src = input.url;
  image.alt = input.alt;
  return image;
}
function loopingClip(url: string, label: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('aria-label', label);
  return video;
}

/** Only the enlarged image over the page: fingers zoom and move it, a tap on it
 * toggles zoom, a tap anywhere else or the X closes it and returns to where the
 * user was. Reuses the caller's image URL and lifetime; viewing never fetches
 * bytes. `gesture` receives the zoom when fingers that opened it keep moving. */
export function openImageViewer(input: {
  url: string;
  alt: string;
  trigger: HTMLElement;
  signal: AbortSignal;
  gesture?: (gesture: ZoomGesture) => void;
  /** A GIF delivered as a silent looping clip (KLIPY .mp4). */
  clip?: boolean;
  /** False hides the account action ("Make sticker") for this view. */
  action?: boolean;
}): () => void {
  const dialog = document.createElement('dialog'),
    frame = document.createElement('div'),
    image = input.clip ? loopingClip(input.url, input.alt) : picture(input),
    close = document.createElement('button');
  dialog.className = 'public-image-viewer';
  dialog.setAttribute('aria-label', t('Enlarged image'));
  frame.className = 'public-image-frame';
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
  const action =
    input.clip || input.action === false ? null : actionButton(input.url, stop);
  dialog.append(frame, close, ...(action ? [action] : []));
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
