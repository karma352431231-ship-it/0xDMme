import { t } from '../../shared/i18n/index.ts';
import { ZoomSurface } from './zoom.ts';
import type { ZoomGesture, ZoomPoint } from './zoom.ts';
import { bindSwipe } from './swipe.ts';

export type { ZoomGesture } from './zoom.ts';
export { pinchOpensViewer } from './pinch-open.ts';
export { bindSwipe } from './swipe.ts';
export type { SwipeSteps } from './swipe.ts';

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
 * Pinch, drag and tap-to-zoom for an image inside its frame; the dialog gets
 * the "zoomed" class while enlarged. Shared by the public viewer and the
 * chat's image viewer (owner, 25/11/2026: chat pictures could not be zoomed).
 */
export interface ZoomableImage {
  /** A click on the image: zooms in at its point, or back to fit. */
  tap: (event: Event) => void;
  /** True once after a pinch or drag, so its trailing click is ignored. */
  takeMoved: () => boolean;
  zoomed: () => boolean;
}
export function zoomableImage(input: {
  dialog: HTMLElement;
  frame: HTMLElement;
  image: HTMLElement;
}): ZoomableImage & { surface: ZoomSurface } {
  const surface = new ZoomSurface({
    frame: input.frame,
    image: input.image,
    zoomed: (on) => input.dialog.classList.toggle('zoomed', on),
  });
  trackPointers(input.frame, surface);
  return {
    surface,
    tap: (event) => {
      event.stopPropagation();
      if (surface.takeMoved()) return;
      // A keyboard or scripted click has no position: zoom around the center.
      const pointer = event as MouseEvent;
      const at =
        pointer.detail > 0
          ? { x: pointer.clientX, y: pointer.clientY }
          : undefined;
      surface.toggle(at);
    },
    takeMoved: () => surface.takeMoved(),
    zoomed: () => input.dialog.classList.contains('zoomed'),
  };
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

export interface ViewerStep {
  /** "2 / 7" */
  position: string;
  previous?: (() => void) | undefined;
  next?: (() => void) | undefined;
}
function stepButton(
  label: string,
  side: 'previous' | 'next',
  run: (() => void) | undefined,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `public-image-step is-${side}`;
  button.setAttribute('aria-label', label);
  button.textContent = side === 'previous' ? '‹' : '›';
  button.hidden = !run;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    run?.();
  });
  return button;
}
/** Arrows, arrow keys and a position line for a gallery view. */
export function viewerStepControls(
  dialog: HTMLElement,
  step: ViewerStep,
): HTMLElement[] {
  const position = document.createElement('span');
  position.className = 'public-image-position';
  position.textContent = step.position;
  dialog.addEventListener('keydown', (event) => {
    const run =
      event.key === 'ArrowLeft'
        ? step.previous
        : event.key === 'ArrowRight'
          ? step.next
          : undefined;
    if (!run) return;
    event.preventDefault();
    run();
  });
  return [
    stepButton(t('Previous'), 'previous', step.previous),
    stepButton(t('Next'), 'next', step.next),
    position,
  ];
}

/** One picture, GIF or sticker of a gallery, read only when shown. */
export interface GalleryItem {
  alt: string;
  load: (
    signal: AbortSignal,
  ) => Promise<{ url: string; clip?: boolean; action?: boolean }>;
}
/**
 * Every item of a post in one viewer (owner, 25/11/2026): arrows and arrow
 * keys move between them. Each item loads on arrival; a failed one is skipped
 * in the direction of travel.
 */
export function openImageGallery(input: {
  items: readonly GalleryItem[];
  start: number;
  trigger: HTMLElement;
  signal: AbortSignal;
}): void {
  const count = input.items.length;
  let stop: (() => void) | null = null,
    turn = 0;
  const show = (index: number, direction: 1 | -1): void => {
    const item = input.items[index];
    if (!item || input.signal.aborted) return;
    const current = ++turn;
    item.load(input.signal).then(
      (media) => {
        if (current !== turn || input.signal.aborted) return;
        stop?.();
        stop = openImageViewer({
          ...media,
          alt: item.alt,
          trigger: input.trigger,
          signal: input.signal,
          step:
            count > 1
              ? {
                  position: `${index + 1} / ${count}`,
                  previous: index > 0 ? () => show(index - 1, -1) : undefined,
                  next:
                    index < count - 1 ? () => show(index + 1, 1) : undefined,
                }
              : undefined,
        });
      },
      () => {
        if (current === turn) show(index + direction, direction);
      },
    );
  };
  show(input.start, 1);
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
  clip?: boolean | undefined;
  /** False hides the account action ("Make sticker") for this view. */
  action?: boolean | undefined;
  /** Previous/next of a gallery; each closes this view and opens the other. */
  step?: ViewerStep | undefined;
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
  const zoom = zoomableImage({ dialog, frame, image });
  input.gesture?.(zoom.surface);
  const swipe = bindSwipe(frame, image, {
    previous: input.step?.previous,
    next: input.step?.next,
    zoomed: zoom.zoomed,
  });
  const toggle = (event: Event): void => {
    if (swipe.takeSwiped()) {
      event.stopPropagation();
      return;
    }
    zoom.tap(event);
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
    if (zoom.takeMoved() || swipe.takeSwiped()) return;
    if (event.target !== image) stop();
  });
  input.signal.addEventListener('abort', stop, { once: true });
  frame.append(image);
  // Clips too: a chat GIF becomes a video sticker (26/11/2026).
  const action = input.action === false ? null : actionButton(input.url, stop);
  dialog.append(
    frame,
    close,
    ...(action ? [action] : []),
    ...(input.step ? viewerStepControls(dialog, input.step) : []),
  );
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
