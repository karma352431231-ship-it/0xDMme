import type { ZoomGesture, ZoomPoint } from './zoom.ts';

function fingers(event: TouchEvent): ZoomPoint[] {
  return Array.from(event.touches, (touch) => ({
    x: touch.clientX,
    y: touch.clientY,
  }));
}

/**
 * Two fingers on an image in a list open its viewer and keep zooming there,
 * without a first tap. The fingers stay bound to `trigger` until they lift.
 * `open` returns null when the viewer cannot open.
 */
export function pinchOpensViewer(
  trigger: HTMLElement,
  open: () => ZoomGesture | null,
  signal: AbortSignal,
): void {
  let gesture: ZoomGesture | null = null;
  const moved = (event: TouchEvent): void => {
    if (event.cancelable) event.preventDefault();
    gesture?.track(fingers(event));
  };
  const lifted = (event: TouchEvent): void => {
    const points = fingers(event);
    gesture?.track(points);
    if (points.length) return;
    gesture = null;
    trigger.removeEventListener('touchmove', moved);
  };
  trigger.addEventListener(
    'touchstart',
    (event) => {
      const points = fingers(event);
      if (points.length < 2) return;
      if (!gesture) {
        gesture = open();
        if (!gesture) return;
        // Only while pinching: an idle image must not slow scrolling.
        trigger.addEventListener('touchmove', moved, {
          passive: false,
          signal,
        });
      }
      gesture.track(points);
    },
    { passive: true, signal },
  );
  trigger.addEventListener('touchend', lifted, { signal });
  trigger.addEventListener('touchcancel', lifted, { signal });
}
