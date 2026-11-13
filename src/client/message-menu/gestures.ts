interface GestureOptions {
  signal: AbortSignal;
  menu: () => void;
  reply?: () => void;
}
/** Controls keep their own touch, except media marked for holding: a hold
 * on a photo or a video still opens the message options (12/11/2026). */
function embeddedControl(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (element?.closest('[data-message-hold]')) return false;
  return !!element?.closest('button, a, input, select, textarea, audio, video');
}
let cancelActiveTouch: (() => void) | null = null;
/** One primary touch owns its window-level movement until release, cancellation or disposal. */
export function messageGestures(
  row: HTMLElement,
  options: GestureOptions,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: { x: number; y: number; id: number } | null = null;
  let movement: AbortController | null = null;
  let handled = false;
  let swiping = false;
  let reached = false;
  const listen = { signal: options.signal };
  const selecting = () => !!row.closest('[data-selecting-messages="true"]');
  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  function end(): void {
    cancel();
    movement?.abort();
    movement = null;
    origin = null;
    if (cancelActiveTouch === end) cancelActiveTouch = null;
    if (swiping) row.style.removeProperty('--message-swipe');
    swiping = false;
    reached = false;
    delete row.dataset?.['messageSwiping'];
  }
  function finish(event: PointerEvent): void {
    if (event.pointerId !== origin?.id) return;
    const reply = event.type === 'pointerup' && swiping && reached;
    end();
    if (reply && !selecting()) {
      handled = true;
      options.reply?.();
    }
  }
  function start(event: PointerEvent): void {
    if (row.dataset['editingMessage'] === 'true') return;
    if (selecting()) {
      end();
      return;
    }
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    handled = false;
    cancelActiveTouch?.();
    if (embeddedControl(event.target)) return;
    // Preserve the typing field's focus when choosing a different reply.
    // Native vertical panning remains governed by touch-action: pan-y.
    event.preventDefault();
    end();
    handled = false;
    cancelActiveTouch = end;
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
    movement = new AbortController();
    const active = { signal: movement.signal, capture: true };
    window.addEventListener('pointerdown', end, active);
    window.addEventListener('pointermove', move, active);
    window.addEventListener('pointerup', finish, active);
    window.addEventListener('pointercancel', finish, active);
    window.addEventListener('blur', end, active);
    timer = setTimeout(() => {
      handled = true;
      if (!selecting()) options.menu();
    }, 500);
  }
  function move(event: PointerEvent): void {
    if (handled || !origin || event.pointerId !== origin.id) return;
    const x = event.clientX - origin.x,
      y = event.clientY - origin.y;
    if (Math.hypot(x, y) < 10) return;
    cancel();
    if (
      !options.reply ||
      x < -10 ||
      Math.abs(y) > Math.max(16, Math.abs(x) * 1.25)
    ) {
      end();
      return;
    }
    if (x < 10) return;
    swiping = true;
    reached = x >= 40;
    row.dataset['messageSwiping'] = 'true';
    row.style.setProperty('--message-swipe', `${Math.min(64, x)}px`);
  }
  row.addEventListener('pointerdown', start, listen);
  row.addEventListener(
    'click',
    (event) => {
      if (!handled) return;
      handled = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { ...listen, capture: true },
  );
  row.addEventListener(
    'contextmenu',
    (event) => {
      if (row.dataset['editingMessage'] === 'true') return;
      if (selecting()) {
        event.preventDefault();
        return;
      }
      if (
        !embeddedControl(event.target) &&
        matchMedia('(pointer: coarse)').matches
      ) {
        event.preventDefault();
        if (!handled) options.menu();
      }
    },
    listen,
  );
  options.signal.addEventListener('abort', end, { once: true });
}
