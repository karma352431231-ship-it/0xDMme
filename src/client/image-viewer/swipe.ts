import { layoutLength } from '../display-scale/index.ts';

/** Previous/next of a viewer showing one item of several. */
export interface SwipeSteps {
  previous?: (() => void) | undefined;
  next?: (() => void) | undefined;
}
/** Past this horizontal travel in pixels, letting go changes the item. */
const swipeDistance = 56;
/** Below this travel a touch is still a tap or the start of a pinch. */
const swipeStart = 8;

/**
 * Only the main button drags (26/11/2026: a right click that opened the
 * browser menu left the picture following the mouse). A pen or finger has
 * no other button.
 */
export function dragsWith(event: PointerEvent): boolean {
  return event.pointerType !== 'mouse' || event.button === 0;
}
/** A mouse moving with no button held has missed its release. */
export function releasedMouse(event: PointerEvent): boolean {
  return event.pointerType === 'mouse' && (event.buttons & 1) === 0;
}

/**
 * One finger (or the mouse) dragged sideways on a fitted image moves to the
 * previous or next item (owner, 25/11/2026: swipe between the pictures of a
 * post, reply or chat on phones). The image follows the finger; a short drag
 * springs back. A second finger or a zoomed image leaves the gesture to zoom.
 */
export function bindSwipe(
  frame: HTMLElement,
  image: HTMLElement,
  input: SwipeSteps & { zoomed: () => boolean },
): { takeSwiped: () => boolean } {
  let start: { id: number; x: number; y: number } | null = null,
    fingers = 0,
    travel = 0,
    swiped = false;
  const follow = (distance: number): void => {
    travel = distance;
    image.style.translate = distance
      ? `${layoutLength(distance, image)}px 0`
      : '';
  };
  frame.addEventListener('pointerdown', (event) => {
    if (!dragsWith(event)) return;
    fingers += 1;
    start =
      fingers === 1 && !input.zoomed()
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    follow(0);
  });
  frame.addEventListener('pointermove', (event) => {
    if (!start || event.pointerId !== start.id) return;
    if (releasedMouse(event)) {
      release(event);
      return;
    }
    const x = event.clientX - start.x,
      y = event.clientY - start.y;
    if (Math.abs(x) < swipeStart || Math.abs(x) < Math.abs(y)) return;
    // Past the first or last item the image barely moves.
    const open = x < 0 ? input.next : input.previous;
    image.style.transition = 'none';
    follow(open ? x : x / 4);
  });
  function release(event: PointerEvent): void {
    fingers = Math.max(0, fingers - 1);
    if (!start || event.pointerId !== start.id) return;
    start = null;
    const run =
      travel <= -swipeDistance
        ? input.next
        : travel >= swipeDistance
          ? input.previous
          : undefined;
    image.style.transition = '';
    if (Math.abs(travel) >= swipeStart) swiped = true;
    follow(0);
    run?.();
  }
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  return {
    /** True once after a sideways drag, so its trailing click is not a tap. */
    takeSwiped: () => {
      const value = swiped;
      swiped = false;
      return value;
    },
  };
}
