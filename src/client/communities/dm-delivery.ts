import {
  chatSyncActive,
  traceHandleDelivery,
  traceHandleFrame,
  diagnosticCaptureSignal,
} from '../chat-sync-diagnostics/index.ts';

/** Only newly decoded messages enter this observer. Cached rows and receipt
 * updates cannot create delivery. An offscreen row may become visible later. */
export function observeDmRows(input: {
  history: HTMLElement;
  messages: readonly { id: string; own: boolean; relation?: unknown }[];
  row: (id: string) => HTMLElement | undefined;
  signal: AbortSignal;
  previous: ReadonlySet<string>;
}): void {
  if (!chatSyncActive()) return;
  const committed = input.messages.flatMap((message) => {
    if (message.own || message.relation || input.previous.has(message.id))
      return [];
    const row = input.row(message.id);
    return row && traceHandleDelivery(message.id, 'dom')
      ? [{ id: message.id, row }]
      : [];
  });
  if (committed.length) observeVisibility(input, committed);
}
function observeVisibility(
  input: { history: HTMLElement; signal: AbortSignal },
  rows: { id: string; row: HTMLElement }[],
): void {
  const trace = traceHandleFrame(),
    capture = diagnosticCaptureSignal();
  const pending = new Set(rows);
  let disposed = false;
  let observer: IntersectionObserver | undefined;
  let frame: number | undefined;
  const dispose = () => {
    disposed = true;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', schedule);
    if (frame !== undefined) cancelAnimationFrame(frame);
    input.signal.removeEventListener('abort', dispose);
    capture?.removeEventListener('abort', dispose);
  };
  const render = () => {
    frame = undefined;
    if (input.signal.aborted || capture?.aborted) return dispose();
    showRows({ pending, history: input.history, trace, observer });
    if (!pending.size || !observer) dispose();
  };
  const schedule = () => {
    if (!disposed && frame === undefined) frame = requestAnimationFrame(render);
  };
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(schedule, { root: input.history });
    for (const item of rows) observer.observe(item.row);
  }
  document.addEventListener('visibilitychange', schedule);
  input.signal.addEventListener('abort', dispose, { once: true });
  capture?.addEventListener('abort', dispose, { once: true });
  if (document.visibilityState === 'visible') schedule();
  else render();
}
function showRows(input: {
  pending: Set<{ id: string; row: HTMLElement }>;
  history: HTMLElement;
  trace: ReturnType<typeof traceHandleFrame>;
  observer: IntersectionObserver | undefined;
}): void {
  const { pending, history, trace, observer } = input;
  for (const item of pending) {
    if (item.row.parentElement !== history) {
      pending.delete(item);
      continue;
    }
    const visible = visibleRow(history, item.row);
    trace(item.id, visible ? 'frame' : 'offscreen');
    if (visible) {
      observer?.unobserve(item.row);
      pending.delete(item);
    }
  }
}
function visibleRow(history: HTMLElement, row: HTMLElement): boolean {
  if (document.visibilityState !== 'visible' || history.closest('[hidden]'))
    return false;
  const area = history.getBoundingClientRect(),
    box = row.getBoundingClientRect();
  const viewport = window.visualViewport;
  const screen = viewport
    ? {
        top: viewport.offsetTop,
        left: viewport.offsetLeft,
        width: viewport.width,
        height: viewport.height,
      }
    : { top: 0, left: 0, width: innerWidth, height: innerHeight };
  return (
    Math.min(area.bottom, box.bottom, screen.top + screen.height) >
      Math.max(area.top, box.top, screen.top) &&
    Math.min(area.right, box.right, screen.left + screen.width) >
      Math.max(area.left, box.left, screen.left)
  );
}
