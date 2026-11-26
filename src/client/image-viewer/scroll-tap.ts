/**
 * Tells a real tap from the end of a scroll (owner, 26/11/2026: on phones a
 * picture sometimes opened while the page was only being dragged). Mobile
 * browsers can turn a finger that moved a little, or a touch that stopped a
 * moving page, into a click on whatever lies under it. Pictures that open a
 * viewer ask `scrollTap()` and ignore such a click.
 */
/** Farther than this, in pixels, the finger was dragging, not tapping. */
const tapSlop = 10;
/** A touch this soon after the page moved was stopping or continuing it. */
const scrollQuietMs = 250;

let installed = false;
let lastScroll = -Infinity;
let touch: { x: number; y: number; scrolling: boolean; moved: boolean } | null =
  null;

function install(): void {
  if (
    installed ||
    typeof document === 'undefined' ||
    typeof document.addEventListener !== 'function'
  )
    return;
  installed = true;
  const listen = { capture: true, passive: true } as const;
  // Scroll events do not bubble, but the capture phase sees every scroller.
  document.addEventListener(
    'scroll',
    () => {
      lastScroll = performance.now();
    },
    listen,
  );
  document.addEventListener(
    'touchstart',
    (event) => {
      const finger = event.touches[0];
      touch =
        event.touches.length === 1 && finger
          ? {
              x: finger.clientX,
              y: finger.clientY,
              scrolling: performance.now() - lastScroll < scrollQuietMs,
              moved: false,
            }
          : null;
    },
    listen,
  );
  // A mouse or pen press after a touch is judged on its own.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') touch = null;
    },
    listen,
  );
  document.addEventListener(
    'touchmove',
    (event) => {
      const finger = event.touches[0];
      if (!touch || !finger) return;
      if (
        Math.hypot(finger.clientX - touch.x, finger.clientY - touch.y) > tapSlop
      )
        touch.moved = true;
    },
    listen,
  );
}

/**
 * Starts watching touches and scrolls; idempotent. Call it where a picture's
 * open control is created, so the first touch is already observed.
 */
export function watchScrollTaps(): void {
  install();
}

/** True when the click ending the latest touch was part of a scroll. */
export function scrollTap(): boolean {
  if (!touch) return false;
  return (
    touch.moved ||
    touch.scrolling ||
    performance.now() - lastScroll < scrollQuietMs
  );
}
