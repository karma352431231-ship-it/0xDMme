import {
  chatSyncActive,
  traceHandleDelivery,
  traceHandleFrame,
} from '../chat-sync-diagnostics/index.ts';

/** A verified packet becomes a DOM row, then gets a chance to appear in the
 * visible scrollport. A cached row or a receipt update cannot create a trace. */
export function observeDmRows(input: {
  history: HTMLElement;
  messages: readonly { id: string; own: boolean; relation?: unknown }[];
  row: (id: string) => HTMLElement | undefined;
  signal: AbortSignal;
  previous: ReadonlySet<string>;
}): void {
  if (!chatSyncActive()) return;
  const { history, signal } = input;
  const committed = input.messages.flatMap((message) => {
    if (message.own || message.relation || input.previous.has(message.id))
      return [];
    const row = input.row(message.id);
    return row && traceHandleDelivery(message.id, 'dom')
      ? [{ id: message.id, row }]
      : [];
  });
  if (!committed.length) return;
  const trace = traceHandleFrame();
  const frame = () => {
    if (signal.aborted) return;
    for (const { id, row } of committed) {
      if (row.parentElement === history)
        trace(id, visibleRow(history, row) ? 'frame' : 'offscreen');
    }
  };
  if (document.visibilityState === 'visible') requestAnimationFrame(frame);
  else frame();
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
