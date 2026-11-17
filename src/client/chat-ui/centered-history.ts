import type { HistoryDirection } from '../history-window/index.ts';

export interface CenteredHistoryScroll {
  available: (direction: HistoryDirection) => boolean;
  load: (direction: HistoryDirection) => Promise<void>;
}
const nearEdge = 240;

/** Only a user scroll extends a centered window. Rendering and centering its
 * anchor can scroll the element too, so they do not trigger additional reads. */
export function watchCenteredHistory(
  history: HTMLElement,
  port: CenteredHistoryScroll,
  signal: AbortSignal,
): void {
  let active = false;
  let touchY: number | undefined;
  let intent: HistoryDirection | undefined;
  let armedUntil = 0;
  let top = history.scrollTop;
  const nearby = (direction: HistoryDirection) =>
    (direction === 'older'
      ? history.scrollTop
      : history.scrollHeight - history.clientHeight - history.scrollTop) <
    nearEdge;
  const check = () => {
    if (!intent || active || history.hidden || !history.clientHeight) return;
    if (
      performance.now() > armedUntil ||
      !nearby(intent) ||
      !port.available(intent)
    )
      return;
    const direction = intent;
    armedUntil = 0;
    intent = undefined;
    active = true;
    void port
      .load(direction)
      .catch(() => {})
      .finally(() => {
        active = false;
        intent = undefined;
        armedUntil = 0;
      });
  };
  const aim = (delta: number) => {
    if (!delta) return;
    intent = delta < 0 ? 'older' : 'newer';
    armedUntil = performance.now() + 800;
    check();
  };
  const options = { signal, passive: true };
  history.addEventListener('wheel', (event) => aim(event.deltaY), options);
  history.addEventListener(
    'touchstart',
    (event) => {
      touchY = event.touches[0]?.clientY;
    },
    options,
  );
  history.addEventListener(
    'touchmove',
    (event) => {
      const next = event.touches[0]?.clientY;
      if (next !== undefined && touchY !== undefined) aim(touchY - next);
      touchY = next;
    },
    options,
  );
  history.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target === history) armedUntil = performance.now() + 800;
    },
    options,
  );
  history.addEventListener(
    'keydown',
    (event) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) aim(-1);
      if (['ArrowDown', 'PageDown', 'End'].includes(event.key)) aim(1);
    },
    options,
  );
  history.addEventListener(
    'scroll',
    () => {
      const offset = history.scrollTop;
      if (!intent && offset !== top && performance.now() <= armedUntil)
        intent = offset < top ? 'older' : 'newer';
      top = offset;
      check();
    },
    options,
  );
}
