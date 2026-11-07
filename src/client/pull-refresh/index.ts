import { t } from '../../shared/i18n/index.ts';

/**
 * Pull down to refresh (owner, 06/11/2026): on phones any tab reloads when the
 * person pulls the page down while it is already at its top. Only a touch
 * that starts where nothing can scroll further up counts, and never inside an
 * open dialog or a text field.
 */
const threshold = 64;
const maximum = 96;
const turnPerPixel = 4;
/** Matches the return transition in pull-refresh.css. */
const returnMilliseconds = 220;

function scrolledDown(start: Element | null): boolean {
  for (let node = start; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight &&
      node.scrollTop > 0
    )
      return true;
  }
  return (document.scrollingElement?.scrollTop ?? 0) > 0;
}
function excluded(target: Element): boolean {
  return !!target.closest(
    'dialog[open], input, textarea, select, [contenteditable="true"], [data-pull-refresh="off"]',
  );
}

export function startPullRefresh(options: {
  /** Whether pulling is available now (phone layout, a mounted page). */
  enabled: () => boolean;
  refresh: () => Promise<void>;
}): () => void {
  const lifetime = new AbortController();
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  const mark = document.createElement('span');
  mark.setAttribute('aria-hidden', 'true');
  indicator.append(mark);
  document.body.append(indicator);
  let start: number | null = null;
  let pulled = 0;
  let busy = false;
  let settling: ReturnType<typeof setTimeout> | undefined;
  // The mark turns with the finger, so pulling back turns it the other way.
  const place = (distance: number) => {
    indicator.style.setProperty('--pull', `${distance}px`);
    indicator.style.setProperty('--turn', `${distance * turnPerPixel}deg`);
    indicator.style.setProperty(
      '--pull-ratio',
      String(Math.min(1, distance / threshold)),
    );
  };
  const show = (distance: number) => {
    clearTimeout(settling);
    place(distance);
    indicator.dataset['state'] = distance >= threshold ? 'ready' : 'pulling';
  };
  // Released or finished: the mark slides back up, unwinding until it is gone.
  const settle = () => {
    clearTimeout(settling);
    if (!indicator.dataset['state']) return;
    indicator.dataset['state'] = 'returning';
    place(0);
    settling = setTimeout(() => {
      indicator.removeAttribute('data-state');
    }, returnMilliseconds);
  };
  const reset = () => {
    start = null;
    pulled = 0;
    if (!busy) settle();
  };
  const begin = (event: TouchEvent) => {
    if (busy || event.touches.length !== 1 || !options.enabled()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || excluded(target) || scrolledDown(target)) return;
    start = event.touches[0]!.clientY;
  };
  const move = (event: TouchEvent) => {
    if (start === null) return;
    const distance = event.touches[0]!.clientY - start;
    if (distance <= 0) {
      reset();
      return;
    }
    // Resistance: the indicator moves at half the finger's speed.
    pulled = Math.min(maximum, distance / 2);
    if (event.cancelable) event.preventDefault();
    show(pulled);
  };
  const end = () => {
    if (start === null) return;
    const ready = pulled >= threshold;
    reset();
    if (!ready) return;
    busy = true;
    clearTimeout(settling);
    indicator.dataset['state'] = 'refreshing';
    indicator.setAttribute('aria-label', t('Refreshing…'));
    void options
      .refresh()
      .catch(() => {
        // The reloaded page reports its own problems.
      })
      .finally(() => {
        busy = false;
        indicator.removeAttribute('aria-label');
        reset();
      });
  };
  const listen = { signal: lifetime.signal };
  document.addEventListener('touchstart', begin, { ...listen, passive: true });
  document.addEventListener('touchmove', move, { ...listen, passive: false });
  document.addEventListener('touchend', end, listen);
  document.addEventListener('touchcancel', reset, listen);
  return () => {
    lifetime.abort();
    clearTimeout(settling);
    indicator.remove();
  };
}
