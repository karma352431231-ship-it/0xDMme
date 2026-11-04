interface GestureOptions {
  signal: AbortSignal;
  menu: () => void;
  reply?: () => void;
}
function embeddedControl(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest(
    'button, a, input, select, textarea, audio, video',
  );
}
/** One bubble's touch intent. Vertical scrolling and embedded controls remain native. */
export function messageGestures(
  row: HTMLElement,
  options: GestureOptions,
): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let origin: { x: number; y: number; id: number } | null = null;
  let handled = false;
  let swiping = false;
  const listen = { signal: options.signal };
  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  function end(): void {
    cancel();
    origin = null;
    if (swiping) row.style.removeProperty('--message-swipe');
    swiping = false;
  }
  function start(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    if (embeddedControl(event.target)) return;
    end();
    handled = false;
    row.setPointerCapture?.(event.pointerId);
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer = setTimeout(() => {
      handled = true;
      options.menu();
    }, 500);
  }
  function move(event: PointerEvent): void {
    if (handled || !origin || event.pointerId !== origin.id) return;
    const x = event.clientX - origin.x,
      y = event.clientY - origin.y;
    if (Math.hypot(x, y) < 10) return;
    cancel();
    if (!options.reply || x < 0 || Math.abs(y) > Math.abs(x) / 2) {
      end();
      return;
    }
    swiping = true;
    row.style.setProperty('--message-swipe', `${Math.min(64, x)}px`);
  }
  row.addEventListener('pointerdown', start, listen);
  row.addEventListener('pointermove', move, listen);
  row.addEventListener(
    'pointerup',
    (event) => {
      if (origin && swiping && event.clientX - origin.x >= 48) {
        handled = true;
        options.reply?.();
      }
      end();
    },
    listen,
  );
  for (const type of ['pointercancel', 'pointerleave'])
    row.addEventListener(type, end, listen);
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
